import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';

type SearchResult = {
  id: string;
  type: string;
  label: string;
  title: string;
  subtitle?: string | null;
  href: string;
  iconUrl?: string | null;
  iconEmoji?: string | null;
};

@Injectable()
export class GlobalSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private text(value: unknown) {
    return String(value ?? '').trim();
  }

  private contains(query: string) {
    return { contains: query, mode: 'insensitive' as const };
  }

  private limited<T>(items: T[], limit = 40) {
    return items.slice(0, limit);
  }

  async search(userId: string, rawQuery?: string): Promise<SearchResult[]> {
    const query = this.text(rawQuery);
    if (query.length < 2) return [];

    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const contains = this.contains(query);
    const numeric = Number(query.replace(',', '.'));
    const hasNumber = Number.isFinite(numeric);

    const [
      accounts,
      transactions,
      categories,
      transfers,
      members,
      channels,
      networks,
      promos,
      sources,
      campaigns,
      hypotheses,
    ] = await Promise.all([
      this.prisma.account.findMany({
        where: { workspaceId, name: contains },
        select: { id: true, name: true, currency: true, icon: true },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.transaction.findMany({
        where: {
          workspaceId,
          OR: [
            { description: contains },
            { category: contains },
            ...(hasNumber ? [{ amount: numeric }, { amountInPrimaryCurrency: numeric }] : []),
          ],
        },
        include: { account: { select: { name: true, currency: true } }, categoryRef: { select: { name: true, icon: true } }, icon: true },
        take: 8,
        orderBy: { date: 'desc' },
      }),
      this.prisma.transactionCategory.findMany({
        where: { workspaceId, name: contains },
        select: { id: true, name: true, type: true, icon: true },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.transfer.findMany({
        where: {
          workspaceId,
          OR: [
            { description: contains },
            ...(hasNumber ? [{ fromAmount: numeric }, { toAmount: numeric }] : []),
          ],
        },
        include: { fromAccount: { select: { name: true } }, toAccount: { select: { name: true } } },
        take: 6,
        orderBy: { date: 'desc' },
      }),
      this.prisma.workspaceMember.findMany({
        where: {
          workspaceId,
          user: {
            OR: [{ name: contains }, { email: contains }],
          },
        },
        include: { user: true, avatarIcon: true },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.telegramChannel.findMany({
        where: {
          workspaceId,
          OR: [
            { title: contains },
            { username: contains },
            { description: contains },
            { niche: contains },
            { language: contains },
          ],
        },
        select: { id: true, title: true, username: true, photoUrl: true, adminLinks: { select: { id: true }, take: 1 } },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.telegramChannelNetwork.findMany({
        where: { workspaceId, OR: [{ name: contains }, { description: contains }] },
        select: { id: true, name: true, description: true },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.promo.findMany({
        where: { workspaceId, OR: [{ title: contains }, { text: contains }, { angle: contains }] },
        include: { telegramChannel: { select: { title: true, photoUrl: true } } },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.advertisingSource.findMany({
        where: {
          workspaceId,
          OR: [
            { name: contains },
            { telegramUsername: contains },
            { url: contains },
            { description: contains },
            { contactInfo: contains },
            { notes: contains },
          ],
        },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.adCampaign.findMany({
        where: { workspaceId, OR: [{ title: contains }, { notes: contains }, { sourcePostUrl: contains }] },
        include: { telegramChannel: { select: { title: true, photoUrl: true } }, promo: { select: { title: true } } },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.adHypothesis.findMany({
        where: { workspaceId, OR: [{ name: contains }, { description: contains }, { conclusion: contains }, { status: contains }] },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return this.limited([
      ...accounts.map((account): SearchResult => ({
        id: account.id,
        type: 'account',
        label: 'Account',
        title: account.name,
        subtitle: account.currency,
        href: '/accounts',
        iconUrl: account.icon?.imageUrl,
        iconEmoji: account.icon?.emoji,
      })),
      ...transactions.map((transaction): SearchResult => ({
        id: transaction.id,
        type: 'transaction',
        label: 'Transaction',
        title: transaction.description || transaction.categoryRef?.name || transaction.category,
        subtitle: `${transaction.type} · ${transaction.account?.name || transaction.currency}`,
        href: `/transactions?search=${encodeURIComponent(query)}`,
        iconUrl: transaction.icon?.imageUrl || transaction.categoryRef?.icon?.imageUrl,
        iconEmoji: transaction.icon?.emoji || transaction.categoryRef?.icon?.emoji,
      })),
      ...categories.map((category): SearchResult => ({
        id: category.id,
        type: 'category',
        label: 'Category',
        title: category.name,
        subtitle: category.type,
        href: '/categories',
        iconUrl: category.icon?.imageUrl,
        iconEmoji: category.icon?.emoji,
      })),
      ...transfers.map((transfer): SearchResult => ({
        id: transfer.id,
        type: 'transfer',
        label: 'Transfer',
        title: transfer.description || `${transfer.fromAccount?.name || transfer.fromCurrency} -> ${transfer.toAccount?.name || transfer.toCurrency}`,
        subtitle: `${transfer.fromAmount} ${transfer.fromCurrency} -> ${transfer.toAmount} ${transfer.toCurrency}`,
        href: '/transfers',
      })),
      ...members.map((member): SearchResult => ({
        id: member.id,
        type: 'member',
        label: 'Member',
        title: member.user.name,
        subtitle: `${member.user.email} · ${member.role}`,
        href: '/workspace-members',
        iconUrl: member.avatarIcon?.imageUrl,
        iconEmoji: member.avatarIcon?.emoji,
      })),
      ...channels.map((channel): SearchResult => ({
        id: channel.id,
        type: 'telegram-channel',
        label: channel.adminLinks.length ? 'Our channel' : 'External channel',
        title: channel.title,
        subtitle: channel.username ? `@${channel.username}` : null,
        href: channel.adminLinks.length
          ? `/telegram/channels/${channel.id}`
          : '/telegram-channels?tab=channels&channelTab=external',
        iconUrl: channel.photoUrl,
      })),
      ...networks.map((network): SearchResult => ({
        id: network.id,
        type: 'telegram-network',
        label: 'Network',
        title: network.name,
        subtitle: network.description,
        href: `/telegram-channel-networks/${network.id}`,
      })),
      ...promos.map((promo): SearchResult => ({
        id: promo.id,
        type: 'promo',
        label: 'Promo',
        title: promo.title,
        subtitle: promo.telegramChannel?.title,
        href: '/promos',
        iconUrl: promo.telegramChannel?.photoUrl,
      })),
      ...sources.map((source): SearchResult => ({
        id: source.id,
        type: 'advertising-source',
        label: source.type === 'telegram_channel' ? 'Ad source' : 'Contact',
        title: source.name,
        subtitle: source.telegramUsername ? `@${source.telegramUsername}` : source.url,
        href: '/telegram-channels?tab=accounts&accountTab=people',
        iconUrl: source.imageUrl,
      })),
      ...campaigns.map((campaign): SearchResult => ({
        id: campaign.id,
        type: 'ad-campaign',
        label: 'Ad campaign',
        title: campaign.title,
        subtitle: [campaign.telegramChannel?.title, campaign.promo?.title].filter(Boolean).join(' · '),
        href: `/ad-campaigns/${campaign.id}`,
        iconUrl: campaign.telegramChannel?.photoUrl,
      })),
      ...hypotheses.map((hypothesis): SearchResult => ({
        id: hypothesis.id,
        type: 'ad-hypothesis',
        label: 'Hypothesis',
        title: hypothesis.name,
        subtitle: hypothesis.description || hypothesis.status,
        href: '/ad-campaigns',
      })),
    ]);
  }
}
