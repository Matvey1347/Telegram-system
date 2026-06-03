import { Injectable } from '@nestjs/common';
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
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const [workspace, accounts, tx, campaigns, channels] =
      await Promise.all([
        this.prisma.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
          select: { primaryCurrency: true, secondaryCurrency: true },
        }),
        this.prisma.account.findMany({
          where: { workspaceId, isActive: true },
        }),
        this.prisma.transaction.findMany({ where: { workspaceId } }),
        this.prisma.adCampaign.findMany({
          where: { workspaceId },
          include: { inviteLinks: { select: { joinedCount: true } } },
        }),
        this.prisma.telegramChannel.count({ where: { workspaceId } }),
      ]);

    const income = tx
      .filter((t) => t.type === 'income')
      .reduce((a, t) => a + dec(t.amountInPrimaryCurrency), 0);
    const expenses = tx
      .filter((t) => t.type === 'expense')
      .reduce((a, t) => a + dec(t.amountInPrimaryCurrency), 0);
    const adSpend = campaigns.reduce(
      (a, c) => a + dec(c.priceInPrimaryCurrency),
      0,
    );
    const campaignsWithMtprotoMetrics = campaigns.map((campaign) => {
      const joinedCount = campaign.inviteLinks.reduce(
        (sum, link) => sum + link.joinedCount,
        0,
      );
      return {
        ...campaign,
        joinedCount,
        leftCount: null,
        netGrowthCount: null,
        cpa:
          joinedCount > 0
            ? dec(campaign.priceInPrimaryCurrency) / joinedCount
            : null,
        attributionSource: 'mtproto_invite_link_usage',
      };
    });
    const totalJoined = campaignsWithMtprotoMetrics.reduce(
      (sum, campaign) => sum + campaign.joinedCount,
      0,
    );
    const cpas = campaignsWithMtprotoMetrics.map((c) => dec(c.cpa)).filter((x) => x > 0);

    const accountRows = await Promise.all(
      accounts.map(async (account) => {
        const incomeSum = tx
          .filter((t) => t.accountId === account.id && t.type === 'income')
          .reduce((a, t) => a + dec(t.amount), 0);
        const expenseSum = tx
          .filter((t) => t.accountId === account.id && t.type === 'expense')
          .reduce((a, t) => a + dec(t.amount), 0);
        const outgoing = await this.prisma.transfer.aggregate({
          where: { workspaceId, fromAccountId: account.id },
          _sum: { fromAmount: true },
        });
        const incoming = await this.prisma.transfer.aggregate({
          where: { workspaceId, toAccountId: account.id },
          _sum: { toAmount: true },
        });
        const balance =
          dec(account.initialBalance) +
          incomeSum -
          expenseSum -
          dec(outgoing._sum.fromAmount) +
          dec(incoming._sum.toAmount);
        const primary = await this.conversionService.convertCurrency(
          balance,
          account.currency,
          workspace.primaryCurrency,
          workspaceId,
        );
        const secondary = await this.conversionService.convertCurrency(
          balance,
          account.currency,
          workspace.secondaryCurrency,
          workspaceId,
        );
        return { account, balance, primary, secondary };
      }),
    );

    const totalBalancePrimary = accountRows.reduce(
      (a, row) => a + dec(row.primary),
      0,
    );
    const totalBalanceSecondary = accountRows.reduce(
      (a, row) => a + dec(row.secondary),
      0,
    );

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
      averageCPA: cpas.length
        ? cpas.reduce((a, b) => a + b, 0) / cpas.length
        : null,
      campaignsCount: campaigns.length,
      telegramChannelsCount: channels,
      bestCampaigns: [...campaignsWithMtprotoMetrics]
        .sort((a, b) => dec(a.cpa) - dec(b.cpa))
        .slice(0, 5),
      worstCampaigns: [...campaignsWithMtprotoMetrics]
        .sort((a, b) => dec(b.cpa) - dec(a.cpa))
        .slice(0, 5),
    };
  }
}
