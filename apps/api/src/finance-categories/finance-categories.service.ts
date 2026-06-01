import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateFinanceCategoryDto, UpdateFinanceCategoryDto } from './dto';

@Injectable()
export class FinanceCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async ensureSystemCategories(workspaceId: string, tx?: PrismaClient) {
    const client = tx ?? this.prisma;
    await (client as any).transactionCategory.upsert({
      where: {
        workspaceId_type_key: { workspaceId, type: 'income', key: 'investment' },
      },
      update: { isSystem: true, name: 'Investment' },
      create: {
        workspaceId,
        type: 'income',
        key: 'investment',
        isSystem: true,
        name: 'Investment',
      },
    });

    await (client as any).transactionCategory.upsert({
      where: {
        workspaceId_type_key: {
          workspaceId,
          type: 'expense',
          key: 'advertising',
        },
      },
      update: { isSystem: true, name: 'Advertising' },
      create: {
        workspaceId,
        type: 'expense',
        key: 'advertising',
        isSystem: true,
        name: 'Advertising',
      },
    });
  }

  async list(userId: string, type?: 'income' | 'expense') {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.ensureSystemCategories(workspaceId);

    return (this.prisma as any).transactionCategory.findMany({
      where: { workspaceId, type },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateFinanceCategoryDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.ensureSystemCategories(workspaceId);
    return (this.prisma as any).transactionCategory.create({
      data: {
        workspaceId,
        type: dto.type,
        name: dto.name.trim(),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateFinanceCategoryDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const category = await (this.prisma as any).transactionCategory.findFirst({
      where: { id, workspaceId },
    });
    if (!category) throw new NotFoundException('Category not found');

    if (category.isSystem && dto.name === undefined) {
      throw new BadRequestException('System category fields are protected');
    }

    return (this.prisma as any).transactionCategory.update({
      where: { id },
      data: { name: dto.name?.trim() },
    });
  }

  async remove(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const category = await (this.prisma as any).transactionCategory.findFirst({
      where: { id, workspaceId },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.isSystem) {
      throw new BadRequestException('System categories cannot be deleted');
    }

    const count = await (this.prisma as any).transaction.count({
      where: { workspaceId, categoryId: id },
    });
    if (count > 0) {
      throw new BadRequestException(
        'Category is used by existing transactions and cannot be deleted',
      );
    }

    return (this.prisma as any).transactionCategory.delete({ where: { id } });
  }
}
