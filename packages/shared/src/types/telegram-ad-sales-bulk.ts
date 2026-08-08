import type {
  TelegramAdPricingMode,
  TelegramAdSale,
} from './telegram-ad-sales';

export type TelegramAdSalesBulkTarget =
  | { type: 'CHANNEL'; channelId: string }
  | { type: 'NETWORK'; networkId: string };

export type TelegramAdSalesBulkAdvertiserInput = {
  advertiserId?: string | null;
  advertiserName: string;
  advertiserTelegram?: string | null;
  advertiserContact?: string | null;
  advertiserCompanyName?: string | null;
  createAdvertiser?: boolean;
};

export type TelegramAdSalesBulkDefaults = TelegramAdSalesBulkAdvertiserInput & {
  agreedPrice: number;
  time: string;
  timezone: string;
  productId?: string | null;
  pricingMode?: TelegramAdPricingMode;
  expectedViews?: number | null;
  recommendedPrice?: number | null;
  minimumPrice?: number | null;
  manualPriceReason?: string | null;
  settlementCurrency: string;
  assignedMemberId?: string | null;
};

export type TelegramAdSalesBulkChannelOverride = {
  channelId: string;
  telegramPostId?: string | null;
  productId?: string | null;
  time?: string | null;
  pricingMode?: TelegramAdPricingMode;
  expectedViews?: number | null;
  recommendedPrice?: number | null;
  minimumPrice?: number | null;
  manualPriceReason?: string | null;
};

export type TelegramAdSalesBulkRow = {
  clientRowId: string;
  date: string;
  advertiserOverride?: TelegramAdSalesBulkAdvertiserInput | null;
  agreedPriceOverride?: number | null;
  channelOverrides?: TelegramAdSalesBulkChannelOverride[];
};

export type TelegramAdSalesBulkCreateRequest = {
  target: TelegramAdSalesBulkTarget;
  defaults: TelegramAdSalesBulkDefaults;
  rows: TelegramAdSalesBulkRow[];
};

export type TelegramAdSalesBulkRowResult = {
  clientRowId: string;
  date: string;
  saleId: string;
  placementIds: string[];
};

export type TelegramAdSalesBulkCreateResponse = {
  sales: TelegramAdSale[];
  rows: TelegramAdSalesBulkRowResult[];
  createdSaleCount: number;
  createdPlacementCount: number;
  channelIds: string[];
};
