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

  private queryVariants(query: string) {
    return Array.from(new Set([query, query.toLocaleLowerCase(), query.toLocaleUpperCase()].filter(Boolean)));
  }

  private textMatches(field: string, query: string) {
    return this.queryVariants(query).map((variant) => ({ [field]: this.contains(variant) }));
  }

  private relationTextMatches(relation: string, field: string, query: string) {
    return this.queryVariants(query).map((variant) => ({
      [relation]: {
        is: {
          [field]: this.contains(variant),
        },
      },
    }));
  }

  private limited<T>(items: T[], limit = 40) {
    return items.slice(0, limit);
  }

  async search(userId: string, rawQuery?: string): Promise<SearchResult[]> {
    const query = this.text(rawQuery);
    if (query.length < 2) return [];

    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const numeric = Number(query.replace(',', '.'));
    const hasNumber = Number.isFinite(numeric);

    const [
      transactions,
      members,
      channels,
      telegramAccounts,
      bots,
      promos,
      people,
      campaigns,
      hypotheses,
      managedPosts,
      postGroups,
      promptNotes,
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          workspaceId,
          OR: [
            ...this.textMatches('description', query),
            ...this.textMatches('category', query),
            ...(hasNumber ? [{ amount: numeric }, { amountInPrimaryCurrency: numeric }] : []),
          ],
        },
        include: { account: { select: { name: true, currency: true } }, categoryRef: { select: { name: true, icon: true } }, icon: true },
        take: 8,
        orderBy: { date: 'desc' },
      }),
      this.prisma.workspaceMember.findMany({
        where: {
          workspaceId,
          user: {
            OR: [...this.textMatches('name', query), ...this.textMatches('email', query)],
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
            ...this.textMatches('title', query),
            ...this.textMatches('username', query),
            ...this.textMatches('description', query),
            ...this.textMatches('niche', query),
            ...this.textMatches('language', query),
          ],
        },
        select: { id: true, title: true, username: true, photoUrl: true, adminLinks: { select: { id: true }, take: 1 } },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.telegramUserAccountIntegration.findMany({
        where: {
          workspaceId,
          OR: [
            ...this.textMatches('label', query),
            ...this.textMatches('username', query),
            ...this.textMatches('firstName', query),
            ...this.textMatches('lastName', query),
            ...this.textMatches('phoneMasked', query),
          ],
        },
        select: { id: true, label: true, username: true, firstName: true, phoneMasked: true, photoUrl: true, status: true },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.telegramBotIntegration.findMany({
        where: {
          workspaceId,
          OR: [
            ...this.textMatches('label', query),
            ...this.textMatches('username', query),
            ...this.textMatches('firstName', query),
            ...this.textMatches('botTokenMasked', query),
          ],
        },
        select: { id: true, label: true, username: true, firstName: true, botTokenMasked: true, isActive: true },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.promo.findMany({
        where: {
          workspaceId,
          OR: [
            ...this.textMatches('title', query),
            ...this.textMatches('text', query),
            ...this.textMatches('angle', query),
          ],
        },
        include: { telegramChannel: { select: { title: true, photoUrl: true } } },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.advertisingSource.findMany({
        where: {
          workspaceId,
          type: { not: 'telegram_channel' },
          OR: [
            ...this.textMatches('name', query),
            ...this.textMatches('telegramUsername', query),
            ...this.textMatches('url', query),
            ...this.textMatches('description', query),
            ...this.textMatches('contactInfo', query),
            ...this.textMatches('notes', query),
          ],
        },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.adCampaign.findMany({
        where: {
          workspaceId,
          OR: [
            ...this.textMatches('title', query),
            ...this.textMatches('notes', query),
            ...this.textMatches('sourcePostUrl', query),
          ],
        },
        include: { telegramChannel: { select: { title: true, photoUrl: true } }, promo: { select: { title: true } } },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.adHypothesis.findMany({
        where: {
          workspaceId,
          OR: [
            ...this.textMatches('name', query),
            ...this.textMatches('description', query),
            ...this.textMatches('conclusion', query),
            ...this.textMatches('status', query),
          ],
        },
        take: 6,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.telegramManagedPost.findMany({
        where: {
          workspaceId,
          OR: [
            ...this.textMatches('title', query),
            ...this.textMatches('text', query),
            ...this.textMatches('lastError', query),
            ...this.textMatches('lastTelegramSyncNote', query),
            ...this.relationTextMatches('group', 'title', query),
            ...this.relationTextMatches('group', 'description', query),
          ],
        },
        include: {
          telegramChannel: { select: { id: true, title: true, photoUrl: true } },
          group: { select: { id: true, title: true } },
        },
        take: 10,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.postGroup.findMany({
        where: {
          workspaceId,
          OR: [
            ...this.textMatches('title', query),
            ...this.textMatches('description', query),
          ],
        },
        include: {
          telegramChannel: { select: { id: true, title: true, photoUrl: true } },
          _count: { select: { posts: true, promptNotes: true } },
        },
        take: 8,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.promptNote.findMany({
        where: {
          workspaceId,
          OR: [
            ...this.textMatches('title', query),
            ...this.textMatches('content', query),
            ...this.textMatches('emoji', query),
            ...this.relationTextMatches('postGroup', 'title', query),
            ...this.relationTextMatches('postGroup', 'description', query),
          ],
        },
        include: {
          icon: { select: { imageUrl: true, emoji: true } },
          telegramChannel: { select: { id: true, title: true, photoUrl: true } },
          postGroup: { select: { id: true, title: true, telegramChannelId: true } },
        },
        take: 10,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const iconIds = [
      ...new Set(
        [...managedPosts.map((post) => post.icon), ...postGroups.map((group) => group.icon)].filter(Boolean),
      ),
    ] as string[];
    const icons = iconIds.length
      ? await this.prisma.icon.findMany({
          where: {
            workspaceId,
            id: { in: iconIds },
          },
          select: { id: true, imageUrl: true, emoji: true },
        })
      : [];
    const iconsById = new Map(icons.map((icon) => [icon.id, icon]));

    return this.limited([
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
      ...telegramAccounts.map((account): SearchResult => ({
        id: account.id,
        type: 'telegram-account',
        label: 'Telegram account',
        title: account.username ? `@${account.username}` : account.label,
        subtitle: [account.firstName, account.phoneMasked, account.status].filter(Boolean).join(' · '),
        href: '/telegram-channels?tab=accounts&accountTab=mtproto',
        iconUrl: account.photoUrl,
      })),
      ...bots.map((bot): SearchResult => ({
        id: bot.id,
        type: 'telegram-bot',
        label: 'Bot',
        title: bot.username ? `@${bot.username}` : bot.label,
        subtitle: [bot.firstName, bot.botTokenMasked, bot.isActive ? 'active' : 'inactive'].filter(Boolean).join(' · '),
        href: '/telegram-channels?tab=bot',
      })),
      ...promos.map((promo): SearchResult => ({
        id: promo.id,
        type: 'promo',
        label: 'Ad',
        title: promo.title,
        subtitle: promo.telegramChannel?.title,
        href: '/promos',
        iconUrl: promo.telegramChannel?.photoUrl,
      })),
      ...people.map((source): SearchResult => ({
        id: source.id,
        type: 'person',
        label: 'Person',
        title: source.name,
        subtitle: source.telegramUsername ? `@${source.telegramUsername}` : source.url,
        href: '/telegram-channels?tab=accounts&accountTab=people',
        iconUrl: source.imageUrl,
      })),
      ...campaigns.map((campaign): SearchResult => ({
        id: campaign.id,
        type: 'ad-campaign',
        label: 'Ad',
        title: campaign.title,
        subtitle: [campaign.telegramChannel?.title, campaign.promo?.title].filter(Boolean).join(' · '),
        href: `/ad-campaigns/${campaign.id}`,
        iconUrl: campaign.telegramChannel?.photoUrl,
      })),
      ...hypotheses.map((hypothesis): SearchResult => ({
        id: hypothesis.id,
        type: 'ad-hypothesis',
        label: 'Ad hypothesis',
        title: hypothesis.name,
        subtitle: hypothesis.description || hypothesis.status,
        href: '/ad-campaigns',
      })),
      ...managedPosts.map((post): SearchResult => {
        const icon = post.icon ? iconsById.get(post.icon) : null;
        return {
          id: post.id,
          type: 'telegram-managed-post',
          label: 'Post',
          title: post.title,
          subtitle: [post.status.toLowerCase(), post.telegramChannel.title, post.group?.title].filter(Boolean).join(' · '),
          href: `/telegram-posts?channelId=${post.telegramChannelId}&postId=${post.id}`,
          iconUrl: icon?.imageUrl || post.telegramChannel.photoUrl,
          iconEmoji: icon?.emoji,
        };
      }),
      ...postGroups.map((group): SearchResult => {
        const icon = group.icon ? iconsById.get(group.icon) : null;
        return {
          id: group.id,
          type: 'post-group',
          label: 'Post group',
          title: group.title,
          subtitle: [
            group.telegramChannel.title,
            `${group._count.posts} post${group._count.posts === 1 ? '' : 's'}`,
            `${group._count.promptNotes} note${group._count.promptNotes === 1 ? '' : 's'}`,
          ].join(' · '),
          href: `/telegram-posts?channelId=${group.telegramChannelId}&groupId=${group.id}`,
          iconUrl: icon?.imageUrl || group.telegramChannel.photoUrl,
          iconEmoji: icon?.emoji,
        };
      }),
      ...promptNotes.map((note): SearchResult => {
        const targetChannelId =
          note.telegramChannelId ||
          note.postGroup?.telegramChannelId ||
          note.telegramChannelIds[0] ||
          '';
        const title = note.title.trim() || note.content.trim().split('\n')[0] || 'Prompt note';
        const channelSubtitle =
          note.telegramChannel?.title ||
          note.postGroup?.title ||
          (note.telegramChannelIds.length > 1
            ? `${note.telegramChannelIds.length} channels`
            : null);
        return {
          id: note.id,
          type: 'prompt-note',
          label: 'Prompt note',
          title,
          subtitle: channelSubtitle,
          href: targetChannelId
            ? `/telegram-posts?channelId=${targetChannelId}&noteId=${note.id}`
            : '/telegram-posts',
          iconUrl: note.icon?.imageUrl,
          iconEmoji: note.icon?.emoji || note.emoji,
        };
      }),
    ]);
  }
}
