import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateInvestorDto, UpdateInvestorDto } from './dto';

const dec = (value: unknown) => Number(value ?? 0);

@Injectable()
export class InvestorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  async findAll(userId: string) {
    const workspaceId = await this.workspace(userId);
    return this.prisma.investor.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  }

  async findSummary(userId: string) {
    const workspaceId = await this.workspace(userId);
    const [investors, grouped] = await Promise.all([
      this.prisma.investor.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.investment.groupBy({ by: ['investorId'], where: { workspaceId }, _sum: { amountInPrimaryCurrency: true }, _count: { _all: true } }),
    ]);

    const totalsByInvestor = new Map(grouped.map((row) => [row.investorId, dec(row._sum.amountInPrimaryCurrency)]));
    const countsByInvestor = new Map(grouped.map((row) => [row.investorId, row._count._all]));
    const totalInvestedPrimary = grouped.reduce((acc, row) => acc + dec(row._sum.amountInPrimaryCurrency), 0);

    const items = investors.map((investor) => {
      const investorTotal = totalsByInvestor.get(investor.id) ?? 0;
      return {
        ...investor,
        totalInvestedPrimary: investorTotal,
        investmentsCount: countsByInvestor.get(investor.id) ?? 0,
        ownershipPercent: totalInvestedPrimary > 0 ? (investorTotal / totalInvestedPrimary) * 100 : 0,
      };
    });

    return {
      items,
      summary: {
        totalInvestedPrimary,
        investorsCount: investors.length,
      },
    };
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.investor.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException('Investor not found');
    return row;
  }

  async create(userId: string, dto: CreateInvestorDto) {
    const workspaceId = await this.workspace(userId);
    return this.prisma.investor.create({ data: { workspaceId, ...dto, isActive: dto.isActive ?? true } });
  }

  async update(userId: string, id: string, dto: UpdateInvestorDto) {
    await this.findOne(userId, id);
    return this.prisma.investor.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.investor.update({ where: { id }, data: { isActive: false } });
  }
}
