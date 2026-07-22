import { sumInviteLinkJoinedSubscribers } from './invite-link-metrics';

export type ChannelKpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';

function toNumberOrNull(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inRange(value: number, from: number | null, to: number | null) {
  if (from == null && to == null) return false;
  if (from != null && value < from) return false;
  if (to != null && value > to) return false;
  return true;
}

export function effectiveCampaignJoinedSubscribers(campaign: {
  inviteLinks?: Array<{ joinedCount?: unknown } | null | undefined> | null;
  joinedCount?: unknown;
  newSubscribers?: unknown;
}) {
  const linkedJoined = sumInviteLinkJoinedSubscribers(
    Array.isArray(campaign.inviteLinks) ? campaign.inviteLinks : [],
  );
  if (linkedJoined > 0) return linkedJoined;
  return Number(campaign.joinedCount ?? campaign.newSubscribers ?? 0);
}

export function effectiveCampaignActiveSubscribers(campaign: {
  cappedActiveSubscribersFromAd?: unknown;
  activeSubscribersFromAd?: unknown;
}) {
  return Number(
    campaign.cappedActiveSubscribersFromAd ??
      campaign.activeSubscribersFromAd ??
      0,
  );
}

export function resolveChannelKpiStatus(params: {
  avgCpa: number | null;
  targetCpaFrom?: unknown;
  targetCpa?: unknown;
  acceptableCpaFrom?: unknown;
  acceptableCpa?: unknown;
  stopCpaFrom?: unknown;
  stopCpa?: unknown;
}): ChannelKpiStatus {
  const targetCpaFrom = toNumberOrNull(params.targetCpaFrom);
  const targetCpa = toNumberOrNull(params.targetCpa);
  const acceptableCpaFrom = toNumberOrNull(params.acceptableCpaFrom);
  const acceptableCpa = toNumberOrNull(params.acceptableCpa);
  const stopCpaFrom = toNumberOrNull(params.stopCpaFrom) ?? toNumberOrNull(params.stopCpa);

  if (params.avgCpa == null) return 'unknown';
  if (inRange(params.avgCpa, targetCpaFrom, targetCpa)) return 'good';
  if (inRange(params.avgCpa, acceptableCpaFrom, acceptableCpa)) {
    return 'acceptable';
  }
  if (inRange(params.avgCpa, stopCpaFrom, null)) return 'bad';
  return 'unknown';
}

export function resolveChannelKpiLabel(status: ChannelKpiStatus) {
  if (status === 'good') return 'Good';
  if (status === 'acceptable') return 'Acceptable';
  if (status === 'bad') return 'Stop';
  return '-';
}
