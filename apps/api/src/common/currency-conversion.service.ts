import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const dec = (value: unknown) => Number(value ?? 0);

@Injectable()
export class CurrencyConversionService {
  constructor(private readonly prisma: PrismaService) {}

  async getRate(
    fromCurrency: string,
    toCurrency: string,
    workspaceId: string,
    date?: Date,
  ): Promise<number | null> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (from === to) return 1;

    const dateFilter = date ? { lte: date } : undefined;

    const direct = await this.prisma.exchangeRate.findFirst({
      where: {
        workspaceId,
        baseCurrency: from,
        targetCurrency: to,
        date: dateFilter,
      },
      orderBy: { date: 'desc' },
    });
    if (direct) return dec(direct.rate);

    const inverse = await this.prisma.exchangeRate.findFirst({
      where: {
        workspaceId,
        baseCurrency: to,
        targetCurrency: from,
        date: dateFilter,
      },
      orderBy: { date: 'desc' },
    });
    if (inverse) {
      const rate = dec(inverse.rate);
      return rate ? 1 / rate : null;
    }

    for (const bridge of ['USD', 'EUR']) {
      if (bridge === from || bridge === to) continue;
      const fromBridge = await this.getRate(from, bridge, workspaceId, date);
      const bridgeTo = await this.getRate(bridge, to, workspaceId, date);
      if (fromBridge && bridgeTo) return fromBridge * bridgeTo;
    }

    return null;
  }

  async convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    workspaceId: string,
    date?: Date,
  ): Promise<number | null> {
    const rate = await this.getRate(
      fromCurrency,
      toCurrency,
      workspaceId,
      date,
    );
    return rate == null ? null : amount * rate;
  }
}
