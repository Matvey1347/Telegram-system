ALTER TABLE "WorkspaceMember"
  ADD COLUMN IF NOT EXISTS "avatarIconId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceMember_avatarIconId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceMember"
      ADD CONSTRAINT "WorkspaceMember_avatarIconId_fkey"
      FOREIGN KEY ("avatarIconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
