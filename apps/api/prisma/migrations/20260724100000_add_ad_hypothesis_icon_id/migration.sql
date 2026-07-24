ALTER TABLE "AdHypothesis"
ADD COLUMN IF NOT EXISTS "iconId" TEXT;

CREATE INDEX IF NOT EXISTS "AdHypothesis_iconId_idx"
ON "AdHypothesis"("iconId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'AdHypothesis_iconId_fkey'
      AND table_name = 'AdHypothesis'
  ) THEN
    ALTER TABLE "AdHypothesis"
    ADD CONSTRAINT "AdHypothesis_iconId_fkey"
    FOREIGN KEY ("iconId") REFERENCES "Icon"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
