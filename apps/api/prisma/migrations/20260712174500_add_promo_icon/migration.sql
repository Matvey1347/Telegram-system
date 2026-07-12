ALTER TABLE "Promo" ADD COLUMN IF NOT EXISTS "iconId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Promo_iconId_fkey'
      AND table_name = 'Promo'
  ) THEN
    ALTER TABLE "Promo"
      ADD CONSTRAINT "Promo_iconId_fkey"
      FOREIGN KEY ("iconId") REFERENCES "Icon"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Promo_iconId_idx" ON "Promo"("iconId");
