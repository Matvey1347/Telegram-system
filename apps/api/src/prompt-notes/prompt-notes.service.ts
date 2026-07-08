import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WorkspaceService } from '../common/workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePromptNoteDto,
  PromptNotesQueryDto,
  UpdatePromptNoteDto,
} from './dto';

@Injectable()
export class PromptNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  async findAll(userId: string, query: PromptNotesQueryDto) {
    const workspaceId = await this.workspace(userId);
    const search = query.search?.trim();
    const telegramChannelId = query.telegramChannelId?.trim();
    const postGroupId = query.postGroupId?.trim();
    const and: Prisma.PromptNoteWhereInput[] = [];
    if (telegramChannelId) {
      and.push({
        OR: [
          { telegramChannelIds: { has: telegramChannelId } },
          { telegramChannelIds: { isEmpty: true } },
          { telegramChannelId },
          { telegramChannelId: null, postGroupId: null },
        ],
      });
    }
    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { content: { contains: search, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }
    if (postGroupId) {
      and.push({
        OR: [
          { postGroupId },
          ...(telegramChannelId
            ? [
                { telegramChannelId, postGroupId: null },
                { telegramChannelId: null, postGroupId: null },
              ]
            : []),
        ],
      });
    }
    return this.prisma.promptNote.findMany({
      where: {
        workspaceId,
        ...(and.length ? { AND: and } : {}),
      },
      include: {
        icon: true,
        assignedMember: { include: { user: true, avatarIcon: true } },
        telegramChannel: true,
        postGroup: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreatePromptNoteDto) {
    const workspaceId = await this.workspace(userId);
    const title = dto.title?.trim() ?? '';
    const context = await this.resolveContext(workspaceId, dto);
    return this.prisma.promptNote.create({
      data: {
        workspaceId,
        title,
        content: dto.content,
        emoji: this.normalizeEmoji(dto.emoji),
        ...context,
      },
      include: {
        icon: true,
        assignedMember: { include: { user: true, avatarIcon: true } },
        telegramChannel: true,
        postGroup: true,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdatePromptNoteDto) {
    const workspaceId = await this.workspace(userId);
    const note = await this.prisma.promptNote.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!note) throw new NotFoundException('Prompt note not found');
    const title = dto.title?.trim();
    const context = await this.resolveContext(workspaceId, dto);
    return this.prisma.promptNote.update({
      where: { id },
      data: {
        title,
        content: dto.content,
        ...(dto.emoji !== undefined
          ? { emoji: this.normalizeEmoji(dto.emoji) }
          : {}),
        ...context,
      },
      include: {
        icon: true,
        assignedMember: { include: { user: true, avatarIcon: true } },
        telegramChannel: true,
        postGroup: true,
      },
    });
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const note = await this.prisma.promptNote.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!note) throw new NotFoundException('Prompt note not found');
    return this.prisma.promptNote.delete({ where: { id } });
  }

  private normalizeEmoji(value: string | null | undefined) {
    const emoji = value?.trim();
    return emoji || null;
  }

  private async resolveContext(
    workspaceId: string,
    dto: Partial<CreatePromptNoteDto | UpdatePromptNoteDto>,
  ) {
    const data: {
      iconId?: string | null;
      assignedMemberId?: string | null;
      telegramChannelId?: string | null;
      telegramChannelIds?: string[];
      postGroupId?: string | null;
    } = {};

    if (dto.iconId !== undefined) {
      const iconId = dto.iconId?.trim() || null;
      if (iconId) {
        const icon = await this.prisma.icon.findFirst({
          where: {
            id: iconId,
            OR: [{ workspaceId }, { workspaceId: null }],
          },
          select: { id: true },
        });
        if (!icon) throw new BadRequestException('Icon not found');
      }
      data.iconId = iconId;
    }

    if (dto.assignedMemberId !== undefined) {
      const assignedMemberId = dto.assignedMemberId?.trim() || null;
      if (assignedMemberId) {
        const member = await this.prisma.workspaceMember.findFirst({
          where: { id: assignedMemberId, workspaceId },
          select: { id: true },
        });
        if (!member) throw new BadRequestException('Member not found');
      }
      data.assignedMemberId = assignedMemberId;
    }

    if (dto.telegramChannelId !== undefined) {
      const telegramChannelId = dto.telegramChannelId?.trim() || null;
      if (telegramChannelId) {
        const channel = await this.prisma.telegramChannel.findFirst({
          where: { id: telegramChannelId, workspaceId },
          select: { id: true },
        });
        if (!channel) {
          throw new BadRequestException('Telegram channel not found');
        }
      }
      data.telegramChannelId = telegramChannelId;
    }

    if (dto.telegramChannelIds !== undefined) {
      const telegramChannelIds = [
        ...new Set(
          dto.telegramChannelIds.map((id) => id.trim()).filter(Boolean),
        ),
      ];
      if (telegramChannelIds.length) {
        const count = await this.prisma.telegramChannel.count({
          where: { id: { in: telegramChannelIds }, workspaceId },
        });
        if (count !== telegramChannelIds.length) {
          throw new BadRequestException('Some Telegram channels were not found');
        }
      }
      data.telegramChannelIds = telegramChannelIds;
      data.telegramChannelId = telegramChannelIds[0] ?? null;
    } else if (dto.telegramChannelId !== undefined) {
      data.telegramChannelIds = data.telegramChannelId
        ? [data.telegramChannelId]
        : [];
    }

    if (dto.postGroupId !== undefined) {
      const postGroupId = dto.postGroupId?.trim() || null;
      if (postGroupId) {
        const group = await this.prisma.postGroup.findFirst({
          where: {
            id: postGroupId,
            workspaceId,
            ...(data.telegramChannelId
              ? { telegramChannelId: data.telegramChannelId }
              : {}),
          },
          select: { id: true, telegramChannelId: true },
        });
        if (!group) throw new BadRequestException('Post group not found');
        if (dto.telegramChannelId === undefined) {
          data.telegramChannelId = group.telegramChannelId;
        }
      }
      data.postGroupId = postGroupId;
    }

    return data;
  }
}
