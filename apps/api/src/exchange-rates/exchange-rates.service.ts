import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateExchangeRateDto, UpdateExchangeRateDto } from './dto';

@Injectable()
export class ExchangeRatesService {
  constructor(private prisma: PrismaService, private workspaceService: WorkspaceService) {}
  async findAll(userId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.exchangeRate.findMany({ where: { workspaceId }, orderBy: { date: 'desc' } });
  }
  async create(userId: string, dto: CreateExchangeRateDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.exchangeRate.create({ data: { ...dto, workspaceId, date: new Date(dto.date) } });
  }
  async update(userId: string, id: string, dto: UpdateExchangeRateDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.exchangeRate.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException('Exchange rate not found');
    return this.prisma.exchangeRate.update({ where: { id }, data: { ...dto, date: dto.date ? new Date(dto.date) : undefined } });
  }
  async remove(userId: string, id: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.exchangeRate.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException('Exchange rate not found');
    return this.prisma.exchangeRate.delete({ where: { id } });
  }
}
