import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    return this.prisma.promptNote.findMany({
      where: {
        workspaceId,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreatePromptNoteDto) {
    const workspaceId = await this.workspace(userId);
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Title is required');
    return this.prisma.promptNote.create({
      data: { workspaceId, title, content: dto.content },
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
    if (dto.title !== undefined && !title) {
      throw new BadRequestException('Title is required');
    }
    return this.prisma.promptNote.update({
      where: { id },
      data: { title, content: dto.content },
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
}
