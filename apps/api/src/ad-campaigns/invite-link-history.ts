export type CampaignInviteLinkHistoryCampaign = {
  id: string;
  title?: string | null;
  inviteLinks: CampaignInviteLinkHistoryInviteLink[];
};

export type CampaignInviteLinkHistoryInviteLink = {
  id: string;
  name: string;
  url: string;
  joinedCount: number;
  requestedCount?: number | null;
  isRevoked: boolean;
  lastSyncedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

export type CampaignInviteLinkSnapshotRow = {
  inviteLinkId: string;
  syncedAt: Date;
  joinedCount: number;
  requestedCount: number;
  isRevoked: boolean | null;
};

type HistoryRow = {
  syncedAt: Date;
  joinedCount: number;
  requestedCount: number;
  isRevoked?: boolean | null;
};

function inviteLinkHistoryPoints<T extends HistoryRow>(rows: T[]) {
  let peakJoinedCount = 0;
  let peakTotalAttributed = 0;
  return rows.map((row) => {
    const joinedCount = Number(row.joinedCount || 0);
    const requestedCount = Number(row.requestedCount || 0);
    const totalAttributed = joinedCount + requestedCount;
    peakJoinedCount = Math.max(peakJoinedCount, joinedCount);
    peakTotalAttributed = Math.max(peakTotalAttributed, totalAttributed);
    const drawdownFromPeak = Math.max(0, peakTotalAttributed - totalAttributed);
    const drawdownPercent =
      peakTotalAttributed > 0
        ? (drawdownFromPeak / peakTotalAttributed) * 100
        : 0;
    return {
      syncedAt: row.syncedAt,
      joinedCount,
      requestedCount,
      totalAttributed,
      peakJoinedCount,
      drawdownFromPeak,
      drawdownPercent,
    };
  });
}

function inviteLinkSyntheticHistoryPoint(params: {
  syncedAt?: Date | null;
  joinedCount?: number | null;
  requestedCount?: number | null;
  isRevoked?: boolean | null;
}) {
  return {
    syncedAt: params.syncedAt ?? new Date(),
    joinedCount: Number(params.joinedCount ?? 0),
    requestedCount: Number(params.requestedCount ?? 0),
    isRevoked: Boolean(params.isRevoked),
  };
}

function appendCurrentInviteLinkHistoryRowIfChanged<T extends HistoryRow>(
  rows: T[],
  current: {
    syncedAt?: Date | null;
    joinedCount?: number | null;
    requestedCount?: number | null;
    isRevoked?: boolean | null;
  },
) {
  const currentJoinedCount = Number(current.joinedCount ?? 0);
  const currentRequestedCount = Number(current.requestedCount ?? 0);
  const currentRevoked = Boolean(current.isRevoked);
  const latest = rows[rows.length - 1] ?? null;
  if (
    latest &&
    Number(latest.joinedCount || 0) === currentJoinedCount &&
    Number(latest.requestedCount || 0) === currentRequestedCount &&
    Boolean(latest.isRevoked) === currentRevoked
  ) {
    return rows;
  }
  return [
    ...rows,
    inviteLinkSyntheticHistoryPoint({
      syncedAt: current.syncedAt ?? new Date(),
      joinedCount: currentJoinedCount,
      requestedCount: currentRequestedCount,
      isRevoked: currentRevoked,
    }),
  ];
}

function inviteLinkHistorySummary<
  T extends {
    joinedCount: number;
    requestedCount: number;
    totalAttributed: number;
    peakJoinedCount: number;
    drawdownFromPeak: number;
    drawdownPercent: number;
  },
>(points: T[]) {
  const current = points[points.length - 1] ?? null;
  const peakJoinedCount = points.reduce(
    (max, point) => Math.max(max, Number(point.peakJoinedCount || 0)),
    0,
  );
  const peakRequestedCount = points.reduce(
    (max, point) => Math.max(max, Number(point.requestedCount || 0)),
    0,
  );
  const peakTotalAttributed = points.reduce(
    (max, point) => Math.max(max, Number(point.totalAttributed || 0)),
    0,
  );
  return {
    currentJoinedCount: Number(current?.joinedCount || 0),
    currentRequestedCount: Number(current?.requestedCount || 0),
    currentTotalAttributed:
      Number(current?.joinedCount || 0) + Number(current?.requestedCount || 0),
    peakJoinedCount,
    peakRequestedCount,
    peakTotalAttributed,
    drawdownFromPeak: Number(current?.drawdownFromPeak || 0),
    drawdownPercent: Number(current?.drawdownPercent || 0),
    hasHighDropoff: Number(current?.drawdownPercent || 0) >= 15,
  };
}

export function buildCampaignInviteLinkHistoryPayload(
  campaign: CampaignInviteLinkHistoryCampaign,
  rowsAsc: CampaignInviteLinkSnapshotRow[],
  limit = 120,
) {
  const maxPoints = Math.max(2, Math.min(365, limit));
  const grouped = new Map<string, HistoryRow>();
  for (const row of rowsAsc) {
    const key = row.syncedAt.toISOString();
    const current = grouped.get(key);
    if (current) {
      current.joinedCount += Number(row.joinedCount || 0);
      current.requestedCount += Number(row.requestedCount || 0);
      current.isRevoked = Boolean(current.isRevoked) && Boolean(row.isRevoked);
    } else {
      grouped.set(key, {
        syncedAt: row.syncedAt,
        joinedCount: Number(row.joinedCount || 0),
        requestedCount: Number(row.requestedCount || 0),
        isRevoked: Boolean(row.isRevoked),
      });
    }
  }

  const currentAggregateSyncedAt = campaign.inviteLinks.reduce<Date | null>(
    (latest, link) => {
      const candidate =
        link.lastSyncedAt ?? link.updatedAt ?? link.createdAt ?? null;
      if (!candidate) return latest;
      if (!latest || candidate.getTime() > latest.getTime()) return candidate;
      return latest;
    },
    null,
  );
  const currentJoinedCount = campaign.inviteLinks.reduce(
    (sum, link) => sum + Number(link.joinedCount || 0),
    0,
  );
  const currentRequestedCount = campaign.inviteLinks.reduce(
    (sum, link) => sum + Number(link.requestedCount || 0),
    0,
  );
  const currentIsRevoked =
    campaign.inviteLinks.length > 0 &&
    campaign.inviteLinks.every((link) => Boolean(link.isRevoked));
  const aggregateRows = appendCurrentInviteLinkHistoryRowIfChanged(
    [...grouped.values()].slice(-maxPoints),
    {
      syncedAt: currentAggregateSyncedAt,
      joinedCount: currentJoinedCount,
      requestedCount: currentRequestedCount,
      isRevoked: currentIsRevoked,
    },
  ).slice(-maxPoints);
  const aggregatePoints = inviteLinkHistoryPoints(
    aggregateRows.length
      ? aggregateRows
      : [
          inviteLinkSyntheticHistoryPoint({
            joinedCount: currentJoinedCount,
            requestedCount: currentRequestedCount,
            isRevoked: currentIsRevoked,
          }),
        ],
  );

  const perLinkRows = new Map<string, HistoryRow[]>();
  for (const row of rowsAsc) {
    const list = perLinkRows.get(row.inviteLinkId) ?? [];
    list.push({
      syncedAt: row.syncedAt,
      joinedCount: Number(row.joinedCount || 0),
      requestedCount: Number(row.requestedCount || 0),
      isRevoked: Boolean(row.isRevoked),
    });
    perLinkRows.set(row.inviteLinkId, list);
  }

  const inviteLinks = campaign.inviteLinks.map((link) => {
    const linkRows = appendCurrentInviteLinkHistoryRowIfChanged(
      (perLinkRows.get(link.id) ?? []).slice(-maxPoints),
      {
        syncedAt: link.lastSyncedAt ?? link.updatedAt ?? link.createdAt ?? null,
        joinedCount: link.joinedCount,
        requestedCount: link.requestedCount,
        isRevoked: link.isRevoked,
      },
    ).slice(-maxPoints);
    const points = inviteLinkHistoryPoints(
      linkRows.length
        ? linkRows
        : [
            inviteLinkSyntheticHistoryPoint({
              joinedCount: link.joinedCount,
              requestedCount: link.requestedCount,
              isRevoked: link.isRevoked,
            }),
          ],
    );
    return {
      ...link,
      points,
      summary: inviteLinkHistorySummary(points),
    };
  });

  return {
    campaign: {
      id: campaign.id,
      title: campaign.title,
    },
    inviteLinks,
    points: aggregatePoints,
    summary: {
      ...inviteLinkHistorySummary(aggregatePoints),
      inviteLinksCount: campaign.inviteLinks.length,
    },
  };
}

export type CampaignInviteLinkHistoryPayload = ReturnType<
  typeof buildCampaignInviteLinkHistoryPayload
>;
