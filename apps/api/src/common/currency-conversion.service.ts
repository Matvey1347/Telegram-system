import { Injectable } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const dec = (value: unknown) => Number(value ?? 0);

@Injectable()
export class CurrencyConversionService {
  constructor(private readonly prisma: PrismaService) {}

  async convertCurrency(amount: number, fromCurrency: Currency, toCurrency: Currency, workspaceId: string): Promise<number | null> {
    if (fromCurrency === toCurrency) return amount;

    const direct = await this.prisma.exchangeRate.findFirst({
      where: { workspaceId, baseCurrency: fromCurrency, targetCurrency: toCurrency },
      orderBy: { date: 'desc' },
    });
    if (direct) return amount * dec(direct.rate);

    const inverse = await this.prisma.exchangeRate.findFirst({
      where: { workspaceId, baseCurrency: toCurrency, targetCurrency: fromCurrency },
      orderBy: { date: 'desc' },
    });
    if (inverse) {
      const rate = dec(inverse.rate);
      if (!rate) return null;
      return amount / rate;
    }

    return null;
  }
}
