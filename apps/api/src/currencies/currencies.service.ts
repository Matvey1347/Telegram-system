import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateCurrencyRateDto, UpdateCurrencySettingsDto, UpdateCurrencyRateDto } from './dto';

const SUPPORTED_CURRENCIES: Currency[] = [Currency.UAH, Currency.USD, Currency.EUR, Currency.PLN];

@Injectable()
export class CurrenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async getSettings(userId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { primaryCurrency: true, secondaryCurrency: true },
    });
    return { ...workspace, supportedCurrencies: SUPPORTED_CURRENCIES };
  }

  async updateSettings(userId: string, dto: UpdateCurrencySettingsDto) {
    if (dto.primaryCurrency === dto.secondaryCurrency) {
      throw new BadRequestException('Primary and secondary currencies must be different');
    }
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const workspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        primaryCurrency: dto.primaryCurrency,
        secondaryCurrency: dto.secondaryCurrency,
      },
      select: { primaryCurrency: true, secondaryCurrency: true },
    });
    return { ...workspace, supportedCurrencies: SUPPORTED_CURRENCIES };
  }

  async getRates(userId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.exchangeRate.findMany({ where: { workspaceId }, orderBy: { date: 'desc' } });
  }

  async createRate(userId: string, dto: CreateCurrencyRateDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.exchangeRate.create({
      data: { ...dto, workspaceId, date: new Date(dto.date) },
    });
  }

  async updateRate(userId: string, id: string, dto: UpdateCurrencyRateDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.exchangeRate.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException('Exchange rate not found');
    return this.prisma.exchangeRate.update({
      where: { id },
      data: { ...dto, date: dto.date ? new Date(dto.date) : undefined },
    });
  }

  async removeRate(userId: string, id: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.exchangeRate.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException('Exchange rate not found');
    return this.prisma.exchangeRate.delete({ where: { id } });
  }

  async syncRates(userId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { primaryCurrency: true },
    });

    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${workspace.primaryCurrency}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { result?: string; rates?: Record<string, number>; error_type?: string };
      if (payload.result !== 'success' || !payload.rates) {
        throw new Error(payload.error_type || 'invalid_api_response');
      }

      const now = new Date();
      let updated = 0;
      for (const targetCurrency of SUPPORTED_CURRENCIES) {
        if (targetCurrency === workspace.primaryCurrency) continue;
        const rate = payload.rates[targetCurrency];
        if (!rate || rate <= 0) continue;

        const latest = await this.prisma.exchangeRate.findFirst({
          where: { workspaceId, baseCurrency: workspace.primaryCurrency, targetCurrency },
          orderBy: { date: 'desc' },
          select: { id: true },
        });

        if (latest) {
          await this.prisma.exchangeRate.update({
            where: { id: latest.id },
            data: { rate, date: now, source: 'open.er-api.com' },
          });
        } else {
          await this.prisma.exchangeRate.create({
            data: {
              workspaceId,
              baseCurrency: workspace.primaryCurrency,
              targetCurrency,
              rate,
              date: now,
              source: 'open.er-api.com',
            },
          });
        }
        updated += 1;
      }
      return { success: true, updated };
    } catch {
      throw new BadGatewayException('Failed to sync exchange rates. Manual rates remain available.');
    }
  }
}
