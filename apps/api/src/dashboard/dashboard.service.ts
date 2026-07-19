import { Injectable } from '@nestjs/common';
import { sumInviteLinkAttributedSubscribers } from '../common/analytics/invite-link-metrics';
import { CurrencyConversionService } from '../common/currency-conversion.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';

const dec = (v: unknown) => Number(v ?? 0);
const DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(input?: { dateFrom?: string; dateTo?: string }) {
  if (!input?.dateFrom && !input?.dateTo) {
    return { from: startOfDay(new Date(2000, 0, 1)), to: endOfDay(new Date()) };
  }
  const fallbackTo = startOfDay(new Date());
  const fallbackFrom = new Date(fallbackTo.getTime() - 29 * DAY);
  const from = startOfDay(parseDate(input?.dateFrom) ?? fallbackFrom);
  const to = endOfDay(parseDate(input?.dateTo) ?? fallbackTo);
  return from <= to ? { from, to } : { from: startOfDay(to), to: endOfDay(from) };
}

function inRange(date: Date | null | undefined, from: Date, to: Date) {
  if (!date) return false;
  const time = date.getTime();
  return time >= from.getTime() && time <= to.getTime();
}

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private conversionService: CurrencyConversionService,
  ) {}

  async summary(userId: string, input?: { dateFrom?: string; dateTo?: string }) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const { from, to } = dateRange(input);
    return this.buildSummary(workspaceId, from, to);
  }

  private async buildSummary(workspaceId: string, from: Date, to: Date) {
    const [workspace, accounts, tx, campaigns, channels, hypotheses, members] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { primaryCurrency: true, secondaryCurrency: true },
      }),
      this.prisma.account.findMany({
        where: {
          workspaceId,
          isActive: true,
          OR: [
            { assignedMemberId: null },
            { assignedMember: { isHidden: false } },
          ],
        },
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          icon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
        },
      }),
      this.prisma.transaction.findMany({
        where: { workspaceId },
        include: {
          categoryRef: {
            include: {
              icon: {
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
      }),
      this.prisma.adCampaign.findMany({
        where: { workspaceId },
        include: {
          inviteLinks: { select: { joinedCount: true, requestedCount: true } },
          telegramChannel: {
            select: {
              id: true,
              title: true,
              username: true,
              photoUrl: true,
              targetCpaFrom: true,
              targetCpa: true,
              acceptableCpaFrom: true,
              acceptableCpa: true,
              stopCpaFrom: true,
              stopCpa: true,
            },
          },
          promo: { select: { title: true } },
        },
      }),
      this.prisma.telegramChannel.findMany({
        where: { workspaceId },
        select: {
          id: true,
          title: true,
          username: true,
          photoUrl: true,
          currentSubscribersCount: true,
          isActive: true,
          adminLinks: { select: { id: true }, take: 1 },
          audienceSnapshots: {
            orderBy: { collectedAt: 'desc' },
            take: 1,
            select: {
              subscribersCount: true,
              activeSubscribersEstimate: true,
              viewRate: true,
              dataQuality: true,
              hasExternalTrafficAnomaly: true,
            },
          },
        },
      }),
      this.prisma.adHypothesis.findMany({ where: { workspaceId }, select: { id: true, status: true } }),
      this.prisma.workspaceMember.count({ where: { workspaceId } }),
    ]);

    const periodTx = tx.filter((t) => inRange(t.date, from, to));
    const campaignDate = (campaign: any) =>
      campaign.placementDate ?? campaign.startedAt ?? campaign.createdAt;
    const periodCampaignsRaw = campaigns.filter((campaign) =>
      inRange(campaignDate(campaign), from, to),
    );

    const income = periodTx
      .filter((t) => t.type === 'income')
      .reduce((a, t) => a + dec(t.amountInPrimaryCurrency), 0);
    const expenses = periodTx
      .filter((t) => t.type === 'expense')
      .reduce((a, t) => a + dec(t.amountInPrimaryCurrency), 0);
    const adSpend = periodCampaignsRaw.reduce(
      (a, c) => a + dec(c.priceInPrimaryCurrency),
      0,
    );
    const selectedInviteLinkIds = campaigns
      .map((campaign) => String(campaign.telegramInviteLinkId || '').trim())
      .filter(Boolean);
    const selectedInviteLinks = selectedInviteLinkIds.length
      ? await this.prisma.telegramInviteLink.findMany({
          where: { workspaceId, id: { in: selectedInviteLinkIds } },
          select: { id: true, joinedCount: true, requestedCount: true },
        })
      : [];
    const selectedInviteLinksById = new Map(
      selectedInviteLinks.map((link) => [
        link.id,
        sumInviteLinkAttributedSubscribers([link]),
      ]),
    );
    const campaignJoinedCount = (campaign: any) => {
      const selectedLinkId = String(campaign.telegramInviteLinkId || '').trim();
      if (selectedLinkId && selectedInviteLinksById.has(selectedLinkId)) {
        return Number(selectedInviteLinksById.get(selectedLinkId) || 0);
      }

      const linkedJoined = sumInviteLinkAttributedSubscribers(campaign.inviteLinks);
      return Math.max(Number(campaign.joinedCount || 0), linkedJoined);
    };
    const campaignsWithMtprotoMetrics = campaigns.map((campaign) => {
      const joinedCount = campaignJoinedCount(campaign);
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
    const periodCampaigns = campaignsWithMtprotoMetrics.filter((campaign) =>
      inRange(campaignDate(campaign), from, to),
    );
    const totalJoined = periodCampaigns.reduce(
      (sum, campaign) => sum + campaign.joinedCount,
      0,
    );
    const cpas = periodCampaigns
      .map((c) => dec(c.cpa))
      .filter((x) => x > 0);
    const rankedCampaigns = periodCampaigns.filter(
      (campaign) =>
        campaign.joinedCount > 0 &&
        dec(campaign.priceInPrimaryCurrency) > 0 &&
        campaign.cpa !== null,
    );

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

    const dailyMap = new Map<string, { date: string; income: number; expenses: number; profit: number; adSpend: number; joined: number }>();
    for (let time = startOfDay(from).getTime(); time <= startOfDay(to).getTime(); time += DAY) {
      const date = isoDay(new Date(time));
      dailyMap.set(date, { date, income: 0, expenses: 0, profit: 0, adSpend: 0, joined: 0 });
    }
    for (const transaction of periodTx) {
      const row = dailyMap.get(isoDay(transaction.date));
      if (!row) continue;
      const amount = dec(transaction.amountInPrimaryCurrency);
      if (transaction.type === 'income') row.income += amount;
      if (transaction.type === 'expense') row.expenses += amount;
      row.profit = row.income - row.expenses;
    }
    for (const campaign of periodCampaigns) {
      const row = dailyMap.get(isoDay(campaignDate(campaign)));
      if (!row) continue;
      row.adSpend += dec(campaign.priceInPrimaryCurrency);
      row.joined += campaign.joinedCount;
    }

    const categoryMap = new Map<string, { id?: string | null; name: string; type: string; amount: number; count: number; iconId?: string | null; icon?: unknown }>();
    for (const transaction of periodTx) {
      const category = transaction.categoryRef;
      const key = `${transaction.type}:${transaction.categoryId ?? transaction.category}`;
      const current = categoryMap.get(key) ?? {
        id: transaction.categoryId,
        name: category?.name ?? transaction.category,
        type: transaction.type,
        amount: 0,
        count: 0,
        iconId: category?.iconId ?? null,
        icon: category?.icon ?? null,
      };
      current.amount += dec(transaction.amountInPrimaryCurrency);
      current.count += 1;
      categoryMap.set(key, current);
    }

    const channelAdMap = new Map<string, { id: string; title: string; username?: string | null; photoUrl?: string | null; spend: number; joined: number; campaigns: number }>();
    for (const campaign of periodCampaigns) {
      const channel = campaign.telegramChannel;
      const current = channelAdMap.get(channel.id) ?? {
        id: channel.id,
        title: channel.title,
        username: channel.username,
        photoUrl: channel.photoUrl,
        spend: 0,
        joined: 0,
        campaigns: 0,
      };
      current.spend += dec(campaign.priceInPrimaryCurrency);
      current.joined += campaign.joinedCount;
      current.campaigns += 1;
      channelAdMap.set(channel.id, current);
    }

    const ownChannels = channels.filter((channel) => channel.adminLinks.length > 0);
    const externalChannels = channels.filter((channel) => channel.adminLinks.length === 0);
    const totalSubscribers = ownChannels.reduce((sum, channel) => {
      const latest = channel.audienceSnapshots[0];
      return sum + Number(latest?.subscribersCount ?? channel.currentSubscribersCount ?? 0);
    }, 0);
    const activeSubscribersEstimate = ownChannels.reduce((sum, channel) => {
      const latest = channel.audienceSnapshots[0];
      return sum + Number(latest?.activeSubscribersEstimate ?? 0);
    }, 0);
    const anomalousChannelsCount = ownChannels.filter((channel) => channel.audienceSnapshots[0]?.hasExternalTrafficAnomaly).length;
    const campaignStatusCounts = campaigns.reduce<Record<string, number>>((acc, campaign) => {
      acc[campaign.status] = (acc[campaign.status] ?? 0) + 1;
      return acc;
    }, {});
    const adQualityCounts = periodCampaigns.reduce<Record<string, number>>((acc, campaign) => {
      const key = campaign.overallStatus || 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const hypothesisStatusCounts = hypotheses.reduce<Record<string, number>>((acc, hypothesis) => {
      acc[hypothesis.status] = (acc[hypothesis.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      period: { dateFrom: isoDay(from), dateTo: isoDay(to) },
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
      periodCampaignsCount: periodCampaigns.length,
      telegramChannelsCount: channels.length,
      ownChannelsCount: ownChannels.length,
      externalChannelsCount: externalChannels.length,
      workspaceMembersCount: members,
      totalSubscribers,
      activeSubscribersEstimate,
      anomalousChannelsCount,
      dailyTrend: [...dailyMap.values()],
      categoryBreakdown: [...categoryMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 8),
      accountBalances: accountRows
        .map((row) => ({
          id: row.account.id,
          name: row.account.name,
          currency: row.account.currency,
          iconId: row.account.iconId,
          icon: row.account.icon,
          balance: row.balance,
          primary: row.primary,
          secondary: row.secondary,
        }))
        .sort((a, b) => dec(b.primary) - dec(a.primary)),
      channelPerformance: [...channelAdMap.values()]
        .map((channel) => ({
          ...channel,
          cpa: channel.joined > 0 ? channel.spend / channel.joined : null,
        }))
        .sort((a, b) => dec(a.cpa ?? Number.POSITIVE_INFINITY) - dec(b.cpa ?? Number.POSITIVE_INFINITY))
        .slice(0, 6),
      topOwnChannels: ownChannels
        .map((channel) => {
          const latest = channel.audienceSnapshots[0];
          return {
            id: channel.id,
            title: channel.title,
            username: channel.username,
            photoUrl: channel.photoUrl,
            subscribers: Number(latest?.subscribersCount ?? channel.currentSubscribersCount ?? 0),
            activeSubscribers: Number(latest?.activeSubscribersEstimate ?? 0),
            viewRate: latest?.viewRate ?? null,
            dataQuality: latest?.dataQuality ?? 'unknown',
          };
        })
        .sort((a, b) => b.subscribers - a.subscribers)
        .slice(0, 6),
      campaignStatusCounts,
      adQualityCounts,
      hypothesisStatusCounts,
      bestCampaigns: [...rankedCampaigns]
        .sort((a, b) => dec(a.cpa) - dec(b.cpa))
        .slice(0, 5),
      worstCampaigns: [...rankedCampaigns]
        .sort((a, b) => dec(b.cpa) - dec(a.cpa))
        .slice(0, 5),
    };
  }
}
