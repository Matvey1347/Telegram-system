-- Store currency codes as uppercase ISO-like text instead of a fixed enum.
CREATE TYPE "CurrencyDisplayMode" AS ENUM ('code', 'symbol');

ALTER TABLE "Workspace"
  ALTER COLUMN "primaryCurrency" TYPE VARCHAR(3) USING "primaryCurrency"::text,
  ALTER COLUMN "primaryCurrency" SET DEFAULT 'USD',
  ALTER COLUMN "secondaryCurrency" TYPE VARCHAR(3) USING "secondaryCurrency"::text,
  ALTER COLUMN "secondaryCurrency" SET DEFAULT 'UAH',
  ADD COLUMN "currencyDisplayMode" "CurrencyDisplayMode" NOT NULL DEFAULT 'code';

ALTER TABLE "Account"
  ALTER COLUMN "currency" TYPE VARCHAR(3) USING "currency"::text;

ALTER TABLE "Transaction"
  ALTER COLUMN "currency" TYPE VARCHAR(3) USING "currency"::text;

ALTER TABLE "Investment"
  ALTER COLUMN "currency" TYPE VARCHAR(3) USING "currency"::text;

ALTER TABLE "Transfer"
  ALTER COLUMN "fromCurrency" TYPE VARCHAR(3) USING "fromCurrency"::text,
  ALTER COLUMN "toCurrency" TYPE VARCHAR(3) USING "toCurrency"::text,
  ALTER COLUMN "transferLossCurrency" TYPE VARCHAR(3) USING "transferLossCurrency"::text;

ALTER TABLE "AdCampaign"
  ALTER COLUMN "currency" TYPE VARCHAR(3) USING "currency"::text;

ALTER TABLE "ExchangeRate"
  ALTER COLUMN "baseCurrency" TYPE VARCHAR(3) USING "baseCurrency"::text,
  ALTER COLUMN "targetCurrency" TYPE VARCHAR(3) USING "targetCurrency"::text;

DROP TYPE "Currency";
