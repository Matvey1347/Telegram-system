import { Injectable } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { CurrencyConversionService } from '../common/currency-conversion.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';

const dec = (v: unknown) => Number(v ?? 0);

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private conversionService: CurrencyConversionService,
  ) {}

  async summary(userId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const [workspace, accounts, tx, campaigns, channels, memberInvestmentRows] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { primaryCurrency: true, secondaryCurrency: true } }),
      this.prisma.account.findMany({ where: { workspaceId, isActive: true } }),
      this.prisma.transaction.findMany({ where: { workspaceId } }),
      this.prisma.adCampaign.findMany({ where: { workspaceId } }),
      this.prisma.telegramChannel.count({ where: { workspaceId } }),
      this.prisma.investment.groupBy({ by: ['workspaceMemberId'], where: { workspaceId }, _sum: { amountInPrimaryCurrency: true } }),
    ]);

    const income = tx.filter((t) => t.type === 'income').reduce((a, t) => a + dec(t.amountInPrimaryCurrency), 0);
    const expenses = tx.filter((t) => t.type === 'expense').reduce((a, t) => a + dec(t.amountInPrimaryCurrency), 0);
    const adSpend = campaigns.reduce((a, c) => a + dec(c.priceInPrimaryCurrency), 0);
    const totalJoined = campaigns.reduce((a, c) => a + (c.joinedCount ?? 0), 0);
    const cpas = campaigns.map((c) => dec(c.cpa)).filter((x) => x > 0);

    const totalInvestedPrimary = memberInvestmentRows.reduce((acc, row) => acc + dec(row._sum.amountInPrimaryCurrency), 0);
    const investingMembersCount = memberInvestmentRows.filter((row) => dec(row._sum.amountInPrimaryCurrency) > 0).length;
    const topInvestorRow = [...memberInvestmentRows].sort((a, b) => dec(b._sum.amountInPrimaryCurrency) - dec(a._sum.amountInPrimaryCurrency))[0];

    const topWorkspaceMember = topInvestorRow
      ? await this.prisma.workspaceMember.findFirst({
          where: { id: topInvestorRow.workspaceMemberId, workspaceId },
          include: { user: { select: { id: true, name: true, email: true } } },
        })
      : null;

    const accountRows = await Promise.all(accounts.map(async (account) => {
      const incomeSum = tx.filter((t) => t.accountId === account.id && t.type === 'income').reduce((a, t) => a + dec(t.amount), 0);
      const expenseSum = tx.filter((t) => t.accountId === account.id && t.type === 'expense').reduce((a, t) => a + dec(t.amount), 0);
      const outgoing = await this.prisma.transfer.aggregate({ where: { workspaceId, fromAccountId: account.id }, _sum: { fromAmount: true } });
      const incoming = await this.prisma.transfer.aggregate({ where: { workspaceId, toAccountId: account.id }, _sum: { toAmount: true } });
      const balance = dec(account.initialBalance) + incomeSum - expenseSum - dec(outgoing._sum.fromAmount) + dec(incoming._sum.toAmount);
      const primary = await this.conversionService.convertCurrency(balance, account.currency as Currency, workspace.primaryCurrency, workspaceId);
      const secondary = await this.conversionService.convertCurrency(balance, account.currency as Currency, workspace.secondaryCurrency, workspaceId);
      return { account, balance, primary, secondary };
    }));

    const totalBalancePrimary = accountRows.reduce((a, row) => a + dec(row.primary), 0);
    const totalBalanceSecondary = accountRows.reduce((a, row) => a + dec(row.secondary), 0);

    return {
      totalBalancePrimary,
      totalBalanceSecondary,
      primaryCurrency: workspace.primaryCurrency,
      secondaryCurrency: workspace.secondaryCurrency,
      incomeForPeriod: income,
      expensesForPeriod: expenses,
      profitForPeriod: income - expenses,
      adSpendForPeriod: adSpend,
      totalJoinedFromAds: totalJoined,
      averageCPA: cpas.length ? cpas.reduce((a, b) => a + b, 0) / cpas.length : null,
      accountsSummary: accountRows.map((row) => ({ ...row.account, initialBalance: dec(row.account.initialBalance), calculatedBalance: row.balance })),
      campaignsCount: campaigns.length,
      telegramChannelsCount: channels,
      bestCampaigns: [...campaigns].sort((a, b) => dec(a.cpa) - dec(b.cpa)).slice(0, 5),
      worstCampaigns: [...campaigns].sort((a, b) => dec(b.cpa) - dec(a.cpa)).slice(0, 5),
      totalInvestedPrimary,
      investorsCount: investingMembersCount,
      topInvestor: topInvestorRow && topWorkspaceMember
        ? {
            workspaceMemberId: topWorkspaceMember.id,
            user: topWorkspaceMember.user,
            totalInvestedPrimary: dec(topInvestorRow._sum.amountInPrimaryCurrency),
            investmentSharePercent: totalInvestedPrimary > 0
              ? (dec(topInvestorRow._sum.amountInPrimaryCurrency) / totalInvestedPrimary) * 100
              : 0,
          }
        : null,
    };
  }
}
