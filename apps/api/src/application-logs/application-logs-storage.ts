import { Prisma } from '@prisma/client';

export function isApplicationLogStorageMissing(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2021') return true;
  if (error.code !== 'P2010') return false;

  const originalCode =
    (
      error.meta as
        | {
            driverAdapterError?: {
              cause?: { originalCode?: string };
            };
          }
        | undefined
    )?.driverAdapterError?.cause?.originalCode ?? null;

  return originalCode === '42P01';
}
