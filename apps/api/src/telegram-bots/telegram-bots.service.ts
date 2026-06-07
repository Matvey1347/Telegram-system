import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTelegramBotDto, UpdateTelegramBotDto } from './dto';

@Injectable()
export class TelegramBotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly encryptionService: TokenEncryptionService,
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private safe(row: Record<string, unknown>) {
    return {
      ...row,
      botTokenEncrypted: undefined,
      botTokenIv: undefined,
      botTokenAuthTag: undefined,
    };
  }

  private maskToken(token: string) {
    const [id] = token.split(':');
    return id ? `${id}:***` : '***';
  }

  private async getMe(token: string) {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const payload = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { id?: number; username?: string; first_name?: string };
    };
    if (!response.ok || !payload.ok || !payload.result?.id) {
      throw new BadRequestException(payload.description || 'Invalid Telegram bot token');
    }
    return payload.result;
  }

  async findAll(userId: string) {
    const workspaceId = await this.workspace(userId);
    const rows = await this.prisma.telegramBotIntegration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.safe(row));
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.telegramBotIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Telegram bot not found');
    return row;
  }

  async create(userId: string, dto: CreateTelegramBotDto) {
    const workspaceId = await this.workspace(userId);
    const bot = await this.getMe(dto.botToken);
    const encrypted = this.encryptionService.encrypt(dto.botToken);
    const row = await this.prisma.telegramBotIntegration.create({
      data: {
        workspaceId,
        label: bot.first_name || bot.username || 'Telegram bot',
        botTokenEncrypted: encrypted.encrypted,
        botTokenIv: encrypted.iv,
        botTokenAuthTag: encrypted.authTag,
        botTokenMasked: this.maskToken(dto.botToken),
        botId: String(bot.id),
        username: bot.username || null,
        firstName: bot.first_name || null,
        lastCheckedAt: new Date(),
        lastErrorMessage: null,
      },
    });
    return this.safe(row);
  }

  async update(userId: string, id: string, dto: UpdateTelegramBotDto) {
    const existing = await this.findOne(userId, id);
    const data: Record<string, unknown> = { label: dto.label };
    if (dto.botToken) {
      const bot = await this.getMe(dto.botToken);
      const encrypted = this.encryptionService.encrypt(dto.botToken);
      Object.assign(data, {
        botTokenEncrypted: encrypted.encrypted,
        botTokenIv: encrypted.iv,
        botTokenAuthTag: encrypted.authTag,
        botTokenMasked: this.maskToken(dto.botToken),
        botId: String(bot.id),
        username: bot.username || null,
        firstName: bot.first_name || null,
        lastCheckedAt: new Date(),
        lastErrorMessage: null,
      });
    }
    const row = await this.prisma.telegramBotIntegration.update({
      where: { id: existing.id },
      data,
    });
    return this.safe(row);
  }

  async check(userId: string, id: string) {
    const existing = await this.findOne(userId, id);
    const token = this.encryptionService.decrypt({
      encrypted: existing.botTokenEncrypted,
      iv: existing.botTokenIv,
      authTag: existing.botTokenAuthTag,
    });
    const bot = await this.getMe(token);
    const row = await this.prisma.telegramBotIntegration.update({
      where: { id },
      data: {
        botId: String(bot.id),
        username: bot.username || null,
        firstName: bot.first_name || null,
        lastCheckedAt: new Date(),
        lastErrorMessage: null,
      },
    });
    return this.safe(row);
  }

  async remove(userId: string, id: string) {
    const existing = await this.findOne(userId, id);
    const row = await this.prisma.telegramBotIntegration.delete({
      where: { id: existing.id },
    });
    return this.safe(row);
  }
}
