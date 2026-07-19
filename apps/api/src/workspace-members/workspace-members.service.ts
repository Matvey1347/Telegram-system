import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WorkspaceRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateWorkspaceMemberDto, UpdateWorkspaceMemberDto } from './dto';
import {
  attributeInviteLinkCreator,
  buildInviteLinkAttributionMaps,
} from '../telegram/shared/telegram-invite-link-attribution';
import { normalizeTelegramUsername } from '../telegram/shared/telegram-import.helpers';

@Injectable()
export class WorkspaceMembersService {
  private readonly memberInclude = {
    user: { select: { id: true, email: true, name: true } },
    avatarIcon: true,
    assignedTelegramUserAccounts: {
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
    },
  } satisfies Prisma.WorkspaceMemberInclude;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async requireManager(userId: string) {
    return this.workspaceService.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
      WorkspaceRole.admin,
    ]);
  }

  private toResponse<T extends { userId: string }>(
    row: T,
    currentUserId: string,
  ) {
    return { ...row, isCurrentUser: row.userId === currentUserId };
  }

  private normalizeMemberUsername(input: string | null | undefined) {
    if (input === undefined) return undefined;
    if (input === null) return null;
    const trimmed = String(input).trim();
    if (!trimmed) return null;
    return normalizeTelegramUsername(trimmed);
  }

  private async assertTelegramUsernameAvailable(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    telegramUsername: string | null | undefined,
    excludedMemberId?: string,
  ) {
    if (!telegramUsername) return;
    const existing = await tx.workspaceMember.findFirst({
      where: {
        workspaceId,
        telegramUsername,
        id: excludedMemberId ? { not: excludedMemberId } : undefined,
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Telegram username is already assigned to another workspace member',
      );
    }
  }

  private async reattributeWorkspaceInviteLinksTx(
    tx: Prisma.TransactionClient,
    workspaceId: string,
  ) {
    const [members, integrations, links] = await Promise.all([
      tx.workspaceMember.findMany({
        where: { workspaceId },
        select: { id: true, telegramUsername: true },
      }),
      tx.telegramUserAccountIntegration.findMany({
        where: { workspaceId },
        select: { telegramUserId: true, username: true, assignedMemberId: true },
      }),
      tx.telegramInviteLink.findMany({
        where: { workspaceId },
        select: {
          id: true,
          creatorTelegramUserId: true,
          creatorUsername: true,
          creatorFirstName: true,
          creatorLastName: true,
          creatorPhotoUrl: true,
        },
      }),
    ]);

    const maps = buildInviteLinkAttributionMaps({ members, integrations });
    await Promise.all(
      links.map((link) => {
        const attribution = attributeInviteLinkCreator(link, maps);
        return tx.telegramInviteLink.update({
          where: { id: link.id },
          data: {
            creatorMemberId: attribution.creatorMemberId,
            creatorMatchSource: attribution.creatorMatchSource,
            creatorUsername: attribution.creatorUsername,
          },
        });
      }),
    );
  }

  private async investmentTransactions(workspaceId: string) {
    return (this.prisma as any).transaction.findMany({
      where: {
        workspaceId,
        type: 'income',
        memberId: { not: null },
        categoryRef: { key: 'investment' },
      },
      select: {
        memberId: true,
        amountInPrimaryCurrency: true,
      },
    });
  }

  private buildInvestmentSummary(
    memberId: string,
    isHidden: boolean,
    byMember: Map<string, { total: number; count: number }>,
    workspaceTotal: number,
  ) {
    if (isHidden) {
      return {
        isInvestor: false,
        totalInvestedPrimary: 0,
        investmentSharePercent: 0,
        investmentsCount: 0,
      };
    }
    const totals = byMember.get(memberId);
    return {
      isInvestor: (totals?.total ?? 0) > 0,
      totalInvestedPrimary: totals?.total ?? 0,
      investmentSharePercent:
        workspaceTotal > 0 ? (((totals?.total ?? 0) / workspaceTotal) * 100) : 0,
      investmentsCount: totals?.count ?? 0,
    };
  }

  private async assertAvatarIcon(workspaceId: string, avatarIconId?: string | null) {
    if (avatarIconId === undefined || avatarIconId === null) return;
    const icon = await this.prisma.icon.findFirst({
      where: { id: avatarIconId, workspaceId },
      select: { id: true },
    });
    if (!icon) throw new NotFoundException('Avatar image not found');
  }

  async list(userId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const [rows, investments] = await Promise.all([
      this.prisma.workspaceMember.findMany({
        where: { workspaceId: membership.workspaceId },
        include: this.memberInclude,
        orderBy: { createdAt: 'asc' },
      }),
      this.investmentTransactions(membership.workspaceId),
    ]);

    const byMember = new Map<string, { total: number; count: number }>();
    for (const tx of investments) {
      const memberId = tx.memberId as string;
      const prev = byMember.get(memberId) ?? { total: 0, count: 0 };
      prev.total += Number(tx.amountInPrimaryCurrency ?? 0);
      prev.count += 1;
      byMember.set(memberId, prev);
    }
    const visibleMemberIds = new Set(
      rows.filter((row) => !row.isHidden).map((row) => row.id),
    );
    const workspaceTotal = [...byMember.entries()].reduce(
      (acc, [memberId, v]) => (visibleMemberIds.has(memberId) ? acc + v.total : acc),
      0,
    );

    return rows.map((row) => ({
      ...this.toResponse(row, userId),
      investmentSummary: this.buildInvestmentSummary(
        row.id,
        Boolean(row.isHidden),
        byMember,
        workspaceTotal,
      ),
    }));
  }

  async memberInvestments(userId: string, memberId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: membership.workspaceId },
    });
    if (!member) throw new NotFoundException('Workspace member not found');

    return (this.prisma as any).transaction.findMany({
      where: {
        workspaceId: membership.workspaceId,
        memberId,
        type: 'income',
        categoryRef: { key: 'investment' },
      },
      include: { account: true, categoryRef: true },
      orderBy: { date: 'desc' },
    });
  }

  async investmentsSummary(userId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const [investments, members] = await Promise.all([
      this.investmentTransactions(membership.workspaceId),
      this.prisma.workspaceMember.findMany({
        where: { workspaceId: membership.workspaceId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    const byMember = new Map<string, { total: number; count: number }>();
    for (const tx of investments) {
      const memberId = tx.memberId as string;
      const prev = byMember.get(memberId) ?? { total: 0, count: 0 };
      prev.total += Number(tx.amountInPrimaryCurrency ?? 0);
      prev.count += 1;
      byMember.set(memberId, prev);
    }

    const visibleMembers = members.filter((member) => !member.isHidden);
    const visibleMemberIds = new Set(visibleMembers.map((member) => member.id));
    const total = [...byMember.entries()].reduce(
      (acc, [memberId, item]) => (visibleMemberIds.has(memberId) ? acc + item.total : acc),
      0,
    );

    return visibleMembers
      .filter((m) => byMember.has(m.id))
      .map((member) => {
        const item = byMember.get(member.id)!;
        return {
          member,
          totalInvestedPrimary: item.total,
          investmentsCount: item.count,
          investmentSharePercent: total > 0 ? (item.total / total) * 100 : 0,
        };
      });
  }

  async create(userId: string, dto: CreateWorkspaceMemberDto) {
    const current = await this.requireManager(userId);
    const email = dto.email.toLowerCase().trim();
    const role = dto.role ?? WorkspaceRole.member;
    const telegramUsername = this.normalizeMemberUsername(dto.telegramUsername);

    if (current.role === WorkspaceRole.admin && role !== WorkspaceRole.member) {
      throw new ForbiddenException('Admin can only add member role');
    }
    if (role === WorkspaceRole.owner && current.role !== WorkspaceRole.owner) {
      throw new ForbiddenException('Only owner can add owner role');
    }
    await this.assertAvatarIcon(current.workspaceId, dto.avatarIconId);

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    let user = existingUser;
    let temporaryPassword: string | undefined;

    if (!user) {
      temporaryPassword = dto.password || randomBytes(12).toString('base64url');
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      user = await this.prisma.user.create({
        data: {
          email,
          name: dto.name?.trim() || email.split('@')[0],
          passwordHash,
        },
      });
    }

    const already = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: current.workspaceId,
          userId: user.id,
        },
      },
    });
    if (already)
      throw new ConflictException('User is already a member of this workspace');
    await this.assertTelegramUsernameAvailable(
      this.prisma,
      current.workspaceId,
      telegramUsername,
    );

    const created = await this.prisma.workspaceMember.create({
      data: {
        workspaceId: current.workspaceId,
        userId: user.id,
        role,
        avatarIconId: dto.avatarIconId ?? null,
        telegramUsername,
      },
      include: this.memberInclude,
    });

    return {
      ...this.toResponse(created, userId),
      temporaryPassword: dto.password ? undefined : temporaryPassword,
    };
  }

  async update(
    userId: string,
    memberId: string,
    dto: UpdateWorkspaceMemberDto,
  ) {
    const current = await this.requireManager(userId);
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: current.workspaceId },
    });
    if (!member) throw new NotFoundException('Workspace member not found');
    const nextTelegramUsername = this.normalizeMemberUsername(
      dto.telegramUsername,
    );

    if (current.role === WorkspaceRole.admin) {
      if (member.role !== WorkspaceRole.member) {
        throw new ForbiddenException('Admin cannot edit owner/admin');
      }
      if (dto.role !== undefined && dto.role !== WorkspaceRole.member) {
        throw new ForbiddenException('Admin can only assign member role');
      }
    }

    if (
      dto.role === WorkspaceRole.owner &&
      current.role !== WorkspaceRole.owner
    ) {
      throw new ForbiddenException('Only owner can promote to owner');
    }

    if (
      dto.role !== undefined &&
      member.role === WorkspaceRole.owner &&
      dto.role !== WorkspaceRole.owner
    ) {
      const ownersCount = await this.prisma.workspaceMember.count({
        where: { workspaceId: current.workspaceId, role: WorkspaceRole.owner },
      });
      if (ownersCount <= 1)
        throw new ForbiddenException('Cannot demote the last owner');
    }
    await this.assertAvatarIcon(current.workspaceId, dto.avatarIconId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.assertTelegramUsernameAvailable(
        tx,
        current.workspaceId,
        nextTelegramUsername,
        member.id,
      );

      const requestedAccountIds = dto.telegramUserAccountIds
        ? [...new Set(dto.telegramUserAccountIds)]
        : undefined;
      const currentAssignedAccounts = await tx.telegramUserAccountIntegration.findMany({
        where: {
          workspaceId: current.workspaceId,
          assignedMemberId: member.id,
        },
        select: { id: true },
      });

      if (requestedAccountIds) {
        const accounts = requestedAccountIds.length
          ? await tx.telegramUserAccountIntegration.findMany({
              where: {
                workspaceId: current.workspaceId,
                id: { in: requestedAccountIds },
              },
              select: { id: true, assignedMemberId: true },
            })
          : [];
        if (accounts.length !== requestedAccountIds.length) {
          throw new NotFoundException(
            'One or more Telegram accounts were not found in this workspace',
          );
        }
        const occupied = accounts.find(
          (account) =>
            account.assignedMemberId && account.assignedMemberId !== member.id,
        );
        if (occupied) {
          throw new ConflictException(
            'One or more Telegram accounts are already linked to another workspace member',
          );
        }
        const currentAssignedIds = new Set(
          currentAssignedAccounts.map((account) => account.id),
        );
        const requestedSet = new Set(requestedAccountIds);
        const toAssign = requestedAccountIds.filter((id) => !currentAssignedIds.has(id));
        const toUnassign = currentAssignedAccounts
          .map((account) => account.id)
          .filter((id) => !requestedSet.has(id));

        if (toAssign.length) {
          await tx.telegramUserAccountIntegration.updateMany({
            where: {
              workspaceId: current.workspaceId,
              id: { in: toAssign },
              assignedMemberId: null,
            },
            data: { assignedMemberId: member.id },
          });
        }
        if (toUnassign.length) {
          await tx.telegramUserAccountIntegration.updateMany({
            where: {
              workspaceId: current.workspaceId,
              id: { in: toUnassign },
              assignedMemberId: member.id,
            },
            data: { assignedMemberId: null },
          });
        }
      }

      const saved = await tx.workspaceMember.update({
        where: { id: memberId },
        data: {
          role: dto.role,
          isHidden: dto.isHidden,
          avatarIconId:
            dto.avatarIconId === undefined ? undefined : dto.avatarIconId,
          telegramUsername:
            nextTelegramUsername === undefined ? undefined : nextTelegramUsername,
        },
        include: this.memberInclude,
      });

      if (
        nextTelegramUsername !== undefined ||
        dto.telegramUserAccountIds !== undefined
      ) {
        await this.reattributeWorkspaceInviteLinksTx(tx, current.workspaceId);
      }

      return saved;
    });
    return this.toResponse(updated, userId);
  }

  async remove(userId: string, memberId: string) {
    const current = await this.requireManager(userId);
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: current.workspaceId },
    });
    if (!member) throw new NotFoundException('Workspace member not found');

    if (
      current.role === WorkspaceRole.admin &&
      member.role !== WorkspaceRole.member
    ) {
      throw new ForbiddenException('Admin cannot remove owner/admin');
    }

    if (member.role === WorkspaceRole.owner) {
      const ownersCount = await this.prisma.workspaceMember.count({
        where: { workspaceId: current.workspaceId, role: WorkspaceRole.owner },
      });
      if (ownersCount <= 1)
        throw new ForbiddenException('Cannot remove the last owner');
    }

    if (member.userId === userId && member.role === WorkspaceRole.owner) {
      const ownersCount = await this.prisma.workspaceMember.count({
        where: { workspaceId: current.workspaceId, role: WorkspaceRole.owner },
      });
      if (ownersCount <= 1)
        throw new ForbiddenException(
          'Cannot remove yourself as the last owner',
        );
    }

    return this.prisma.workspaceMember.delete({ where: { id: memberId } });
  }
}
