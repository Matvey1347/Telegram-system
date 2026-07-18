import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { UpdateMeDto, UpdatePasswordDto, UpdateWorkspaceDto } from './dto';
import { normalizeTelegramUsername } from '../telegram/shared/telegram-import.helpers';
import { TelegramChannelsService } from '../telegram-channels/telegram-channels.service';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly telegramChannelsService: TelegramChannelsService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    return {
      ...user,
      avatarIconId: membership.avatarIconId,
      avatarIcon: membership.avatarIcon ?? null,
      telegramUsername: (membership as { telegramUsername?: string | null })
        .telegramUsername ?? null,
      assignedTelegramUserAccounts:
        await this.prisma.telegramUserAccountIntegration.findMany({
          where: {
            workspaceId: membership.workspaceId,
            assignedMemberId: membership.id,
          },
          select: {
            id: true,
            label: true,
            telegramUserId: true,
            username: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            status: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        role: membership.role,
        avatarIcon: membership.workspace.avatarIcon ?? null,
      },
    };
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const data: { name?: string; email?: string } = {};
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const normalizedTelegramUsername =
      dto.telegramUsername === undefined
        ? undefined
        : dto.telegramUsername?.trim()
          ? normalizeTelegramUsername(dto.telegramUsername)
          : null;

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) throw new ConflictException('Name cannot be empty');
      data.name = trimmed;
    }

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== userId)
        throw new ConflictException('Email already exists');
      data.email = email;
    }

    if (dto.avatarIconId !== undefined && dto.avatarIconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.avatarIconId, workspaceId: membership.workspaceId },
      });
      if (!icon) {
        throw new NotFoundException('Avatar image not found');
      }
    }

    if (dto.avatarIconId !== undefined) {
      await this.prisma.workspaceMember.update({
        where: { id: membership.id },
        data: { avatarIconId: dto.avatarIconId },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      if (normalizedTelegramUsername) {
        const existingMember = await tx.workspaceMember.findFirst({
          where: {
            workspaceId: membership.workspaceId,
            telegramUsername: normalizedTelegramUsername,
            id: { not: membership.id },
          },
          select: { id: true },
        });
        if (existingMember) {
          throw new ConflictException(
            'Telegram username is already assigned to another workspace member',
          );
        }
      }

      if (dto.telegramUserAccountIds !== undefined) {
        const requestedIds = [...new Set(dto.telegramUserAccountIds)];
        const accounts = requestedIds.length
          ? await tx.telegramUserAccountIntegration.findMany({
              where: {
                workspaceId: membership.workspaceId,
                id: { in: requestedIds },
              },
              select: { id: true, assignedMemberId: true },
            })
          : [];
        if (accounts.length !== requestedIds.length) {
          throw new NotFoundException(
            'One or more Telegram accounts were not found in this workspace',
          );
        }
        const occupied = accounts.find(
          (account) =>
            account.assignedMemberId &&
            account.assignedMemberId !== membership.id,
        );
        if (occupied) {
          throw new ConflictException(
            'One or more Telegram accounts are already linked to another workspace member',
          );
        }
        const currentAccounts = await tx.telegramUserAccountIntegration.findMany({
          where: {
            workspaceId: membership.workspaceId,
            assignedMemberId: membership.id,
          },
          select: { id: true },
        });
        const currentIds = new Set(currentAccounts.map((account) => account.id));
        const requestedSet = new Set(requestedIds);
        const toAssign = requestedIds.filter((id) => !currentIds.has(id));
        const toUnassign = currentAccounts
          .map((account) => account.id)
          .filter((id) => !requestedSet.has(id));
        if (toAssign.length) {
          await tx.telegramUserAccountIntegration.updateMany({
            where: {
              workspaceId: membership.workspaceId,
              id: { in: toAssign },
              assignedMemberId: null,
            },
            data: { assignedMemberId: membership.id },
          });
        }
        if (toUnassign.length) {
          await tx.telegramUserAccountIntegration.updateMany({
            where: {
              workspaceId: membership.workspaceId,
              id: { in: toUnassign },
              assignedMemberId: membership.id,
            },
            data: { assignedMemberId: null },
          });
        }
      }

      if (
        dto.avatarIconId !== undefined ||
        normalizedTelegramUsername !== undefined
      ) {
        await tx.workspaceMember.update({
          where: { id: membership.id },
          data: {
            avatarIconId:
              dto.avatarIconId === undefined ? undefined : dto.avatarIconId,
            telegramUsername:
              normalizedTelegramUsername === undefined
                ? undefined
                : normalizedTelegramUsername,
          } as Prisma.WorkspaceMemberUpdateInput,
        });
      }

      if (Object.keys(data).length) {
        await tx.user.update({ where: { id: userId }, data });
      }
    });

    if (
      normalizedTelegramUsername !== undefined ||
      dto.telegramUserAccountIds !== undefined
    ) {
      await this.telegramChannelsService.reattributeWorkspaceInviteLinks(
        membership.workspaceId,
      );
    }

    return this.me(userId);
  }

  async updatePassword(userId: string, dto: UpdatePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid)
      throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { success: true };
  }

  async updateWorkspace(userId: string, dto: UpdateWorkspaceDto) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    if (membership.role !== WorkspaceRole.owner) {
      throw new ForbiddenException('Only owner can update workspace name');
    }

    if (dto.avatarIconId !== undefined && dto.avatarIconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.avatarIconId, workspaceId: membership.workspaceId },
      });
      if (!icon) {
        throw new NotFoundException('Icon not found');
      }
    }

    await this.prisma.workspace.update({
      where: { id: membership.workspaceId },
      data: {
        name: dto.name.trim(),
        avatarIconId:
          dto.avatarIconId === undefined ? undefined : dto.avatarIconId,
      },
    });

    return this.me(userId);
  }
}
