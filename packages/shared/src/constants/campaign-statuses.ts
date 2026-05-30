export const CAMPAIGN_STATUSES = [
  'planned',
  'active',
  'finished',
  'cancelled',
  'archived'
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
