import { Prisma } from '@prisma/client';

export function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

export function decimalOrNull(
  value: Prisma.Decimal.Value | null | undefined,
): Prisma.Decimal | null {
  return value == null ? null : decimal(value);
}

export function decimalToString(value: Prisma.Decimal.Value | null | undefined) {
  return value == null ? null : decimal(value).toFixed();
}
