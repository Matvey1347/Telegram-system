import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import {
  CreateCurrencyRateDto,
  UpdateCurrencySettingsDto,
  UpdateCurrencyRateDto,
} from './dto';

const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'PLN',
  'UAH',
  'GBP',
  'TRY',
  'CAD',
  'AUD',
  'CHF',
  'CZK',
  'DKK',
  'NOK',
  'SEK',
  'JPY',
  'CNY',
  'RON',
  'HUF',
  'BGN',
  'GEL',
  'KZT',
] as const;

@Injectable()
export class CurrenciesService {
  private readonly logger = new Logger(CurrenciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async getSettings(userId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        primaryCurrency: true,
        secondaryCurrency: true,
      },
    });
    return {
      ...workspace,
      currencyDisplayMode: 'code' as const,
      supportedCurrencies: SUPPORTED_CURRENCIES,
    };
  }

  async updateSettings(userId: string, dto: UpdateCurrencySettingsDto) {
    if (dto.primaryCurrency === dto.secondaryCurrency) {
      throw new BadRequestException(
        'Primary and secondary currencies must be different',
      );
    }
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const workspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        primaryCurrency: dto.primaryCurrency,
        secondaryCurrency: dto.secondaryCurrency,
      },
      select: {
        primaryCurrency: true,
        secondaryCurrency: true,
      },
    });

    try {
      await this.syncRatesForWorkspace(workspaceId, workspace.primaryCurrency);
    } catch (error) {
      this.logger.warn(
        `Currency settings updated for workspace ${workspaceId}, but auto-sync failed: ${(error as Error).message}`,
      );
    }

    return {
      ...workspace,
      currencyDisplayMode: dto.currencyDisplayMode ?? 'code',
      supportedCurrencies: SUPPORTED_CURRENCIES,
    };
  }

  async getRates(userId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.exchangeRate.findMany({
      where: { workspaceId },
      orderBy: { date: 'desc' },
    });
  }

  async createRate(userId: string, dto: CreateCurrencyRateDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.exchangeRate.create({
      data: {
        ...dto,
        baseCurrency: dto.baseCurrency.toUpperCase(),
        targetCurrency: dto.targetCurrency.toUpperCase(),
        workspaceId,
        date: new Date(dto.date),
      },
    });
  }

  async updateRate(userId: string, id: string, dto: UpdateCurrencyRateDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.exchangeRate.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Exchange rate not found');
    return this.prisma.exchangeRate.update({
      where: { id },
      data: { ...dto, date: dto.date ? new Date(dto.date) : undefined },
    });
  }

  async removeRate(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.exchangeRate.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Exchange rate not found');
    return this.prisma.exchangeRate.delete({ where: { id } });
  }

  async syncRates(userId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { primaryCurrency: true },
    });

    try {
      const updated = await this.syncRatesForWorkspace(
        workspaceId,
        workspace.primaryCurrency,
      );
      return { success: true, updated };
    } catch {
      throw new BadGatewayException(
        'Failed to sync exchange rates. Manual rates remain available.',
      );
    }
  }

  async syncRatesForAllWorkspaces() {
    const workspaces = await this.prisma.workspace.findMany({
      select: { id: true, primaryCurrency: true },
    });

    let synced = 0;
    for (const workspace of workspaces) {
      try {
        await this.syncRatesForWorkspace(
          workspace.id,
          workspace.primaryCurrency,
        );
        synced += 1;
      } catch (error) {
        this.logger.warn(
          `Daily auto-sync failed for workspace ${workspace.id}: ${(error as Error).message}`,
        );
      }
    }

    return { synced, total: workspaces.length };
  }

  private async syncRatesForWorkspace(
    workspaceId: string,
    primaryCurrency: string,
  ) {
    const response = await fetch(
      `https://open.er-api.com/v6/latest/${primaryCurrency}`,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
      error_type?: string;
    };

    if (payload.result !== 'success' || !payload.rates) {
      throw new Error(payload.error_type || 'invalid_api_response');
    }

    const now = new Date();
    const usedCurrencies = await this.getWorkspaceCurrencyCodes(workspaceId);
    const rows = [...new Set([...SUPPORTED_CURRENCIES, ...usedCurrencies])]
      .filter((currency) => currency !== primaryCurrency)
      .map((targetCurrency) => ({
        workspaceId,
        baseCurrency: primaryCurrency,
        targetCurrency,
        rate: payload.rates?.[targetCurrency],
        date: now,
        source: 'open.er-api.com',
      }))
      .filter((row) => row.rate && row.rate > 0) as Array<{
      workspaceId: string;
      baseCurrency: string;
      targetCurrency: string;
      rate: number;
      date: Date;
      source: string;
    }>;

    if (!rows.length) return 0;

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.exchangeRate.deleteMany({
          where: {
            workspaceId,
            baseCurrency: row.baseCurrency,
            targetCurrency: row.targetCurrency,
          },
        });
      }

      await tx.exchangeRate.createMany({ data: rows });
    });

    return rows.length;
  }

  private async getWorkspaceCurrencyCodes(workspaceId: string) {
    const [workspace, accounts, campaigns] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { primaryCurrency: true, secondaryCurrency: true },
      }),
      this.prisma.account.findMany({
        where: { workspaceId },
        select: { currency: true },
      }),
      this.prisma.adCampaign.findMany({
        where: { workspaceId },
        select: { currency: true },
      }),
    ]);
    return [
      workspace?.primaryCurrency,
      workspace?.secondaryCurrency,
      ...accounts.map((row) => row.currency),
      ...campaigns.map((row) => row.currency),
    ].filter((currency): currency is string => Boolean(currency));
  }
}
