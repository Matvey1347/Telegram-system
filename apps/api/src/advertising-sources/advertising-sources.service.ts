import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateAdvertisingSourceDto, UpdateAdvertisingSourceDto } from './dto';

@Injectable()
export class AdvertisingSourcesService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
  ) {}
  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }
  async findAll(userId: string) {
    const workspaceId = await this.workspace(userId);
    return this.prisma.advertisingSource.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }
  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.advertisingSource.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Advertising source not found');
    return row;
  }
  async create(userId: string, dto: CreateAdvertisingSourceDto) {
    const workspaceId = await this.workspace(userId);
    return this.prisma.advertisingSource.create({
      data: { workspaceId, ...dto },
    });
  }
  async update(userId: string, id: string, dto: UpdateAdvertisingSourceDto) {
    await this.findOne(userId, id);
    return this.prisma.advertisingSource.update({ where: { id }, data: dto });
  }
  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.advertisingSource.delete({ where: { id } });
  }
}
