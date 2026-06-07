import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkspaceRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private shapeMembership(row: {
    id: string;
    workspaceId: string;
    role: WorkspaceRole;
    workspace: {
      id: string;
      name: string;
      primaryCurrency: string;
      secondaryCurrency: string;
      avatarIcon?: {
        id: string;
        type: 'emoji' | 'image';
        name: string;
        emoji?: string | null;
        imageUrl?: string | null;
      } | null;
      currencyDisplayMode?: 'code' | 'symbol';
    };
  }) {
    return {
      id: row.workspace.id,
      name: row.workspace.name,
      role: row.role,
      primaryCurrency: row.workspace.primaryCurrency,
      secondaryCurrency: row.workspace.secondaryCurrency,
      currencyDisplayMode: row.workspace.currencyDisplayMode ?? 'code',
      avatarIcon: row.workspace.avatarIcon ?? null,
    };
  }

  async findAll(userId: string) {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { userId },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            primaryCurrency: true,
            secondaryCurrency: true,
            avatarIcon: {
              select: {
                id: true,
                type: true,
                name: true,
                emoji: true,
                imageUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) =>
      this.shapeMembership({
        ...row,
        workspace: {
          ...row.workspace,
          currencyDisplayMode: 'code',
        },
      }),
    );
  }

  async findOne(userId: string, id: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: id },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            primaryCurrency: true,
            secondaryCurrency: true,
            avatarIcon: {
              select: {
                id: true,
                type: true,
                name: true,
                emoji: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    return this.shapeMembership({
      ...membership,
      workspace: {
        ...membership.workspace,
        currencyDisplayMode: 'code',
      },
    });
  }

  async create(userId: string, dto: CreateWorkspaceDto) {
    const name = dto.name.trim();
    const workspaceId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO "Workspace" (
            "id",
            "name",
            "primaryCurrency",
            "secondaryCurrency",
            "createdAt",
            "updatedAt"
          )
          VALUES (${workspaceId}, ${name}, 'USD', 'UAH', NOW(), NOW())
        `,
      );
      await tx.workspaceMember.create({
        data: {
          userId,
          workspaceId,
          role: WorkspaceRole.owner,
        },
      });
    });

    return {
      id: workspaceId,
      name,
      role: WorkspaceRole.owner,
      primaryCurrency: 'USD',
      secondaryCurrency: 'UAH',
      currencyDisplayMode: 'code',
      avatarIcon: null,
    };
  }

  async update(userId: string, id: string, dto: UpdateWorkspaceDto) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: id },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    if (
      membership.role !== WorkspaceRole.owner &&
      membership.role !== WorkspaceRole.admin
    ) {
      throw new ForbiddenException('Insufficient workspace role');
    }
    if (dto.name === undefined && dto.avatarIconId === undefined) {
      return this.findOne(userId, id);
    }
    if (dto.avatarIconId !== undefined && dto.avatarIconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.avatarIconId, workspaceId: id },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }
    await this.prisma.workspace.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        avatarIconId:
          dto.avatarIconId === undefined ? undefined : dto.avatarIconId,
      },
    });
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: id },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    if (membership.role !== WorkspaceRole.owner) {
      throw new ForbiddenException('Only owner can delete workspace');
    }
    await this.prisma.workspace.delete({ where: { id } });
    return { success: true };
  }

  async selected(userId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    return this.shapeMembership(membership);
  }
}
