import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramSourceType, TelegramUserAccountStatus } from '@prisma/client';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../telegram/shared/telegram-source-access.service';
import {
  Confirm2faPasswordDto,
  ConfirmLoginCodeDto,
  CreateTelegramUserAccountDto,
  StartLoginDto,
  UpdateTelegramUserAccountDto,
} from './dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramUserAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly encryptionService: TokenEncryptionService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly configService: ConfigService,
  ) {}

  private maskPhone(phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return '***';
    return `+${digits.slice(0, 2)}***${digits.slice(-2)}`;
  }

  private safe<T extends Record<string, unknown>>(row: T) {
    return {
      ...row,
      phoneEncrypted: undefined,
      phoneIv: undefined,
      phoneAuthTag: undefined,
      apiHashEncrypted: undefined,
      apiHashIv: undefined,
      apiHashAuthTag: undefined,
      sessionEncrypted: undefined,
      sessionIv: undefined,
      sessionAuthTag: undefined,
      loginPhoneCodeHash: undefined,
      loginTempSessionEncrypted: undefined,
      loginTempSessionIv: undefined,
      loginTempSessionAuthTag: undefined,
      loginStartedAt: undefined,
    };
  }

  private encryptLoginTempSession(tempSession?: string | null) {
    if (!tempSession) return null;
    const encrypted = this.encryptionService.encrypt(tempSession);
    return {
      loginTempSessionEncrypted: encrypted.encrypted,
      loginTempSessionIv: encrypted.iv,
      loginTempSessionAuthTag: encrypted.authTag,
    };
  }

  private decryptLoginTempSession(account: {
    loginTempSessionEncrypted?: string | null;
    loginTempSessionIv?: string | null;
    loginTempSessionAuthTag?: string | null;
  }) {
    if (
      !account.loginTempSessionEncrypted ||
      !account.loginTempSessionIv ||
      !account.loginTempSessionAuthTag
    ) {
      return null;
    }
    return this.encryptionService.decrypt({
      encrypted: account.loginTempSessionEncrypted,
      iv: account.loginTempSessionIv,
      authTag: account.loginTempSessionAuthTag,
    });
  }

  private decryptPhone(account: {
    phoneEncrypted?: string | null;
    phoneIv?: string | null;
    phoneAuthTag?: string | null;
  }) {
    if (!account.phoneEncrypted || !account.phoneIv || !account.phoneAuthTag) {
      return null;
    }
    return this.encryptionService.decrypt({
      encrypted: account.phoneEncrypted,
      iv: account.phoneIv,
      authTag: account.phoneAuthTag,
    });
  }

  private async getWorkspaceId(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private normalizeUsername(value: string | null | undefined) {
    return (value || '').replace('@', '').trim().toLowerCase();
  }

  private resolveApiCredentials(dto: CreateTelegramUserAccountDto) {
    const apiId = this.configService.get<string>('TELEGRAM_API_ID');
    const apiHash = this.configService.get<string>('TELEGRAM_API_HASH');
    if (!apiId || !apiHash) {
      throw new BadRequestException(
        'API ID/API Hash not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env',
      );
    }
    return { apiId, apiHash };
  }

  async findAll(userId: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const rows = await this.prisma.telegramUserAccountIntegration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.safe(row));
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const row = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Telegram user account not found');
    return this.safe(row);
  }

  async channels(userId: string, id: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');
    return this.sourceAccessService.channelsForSource(
      workspaceId,
      id,
      TelegramSourceType.MTPROTO,
    );
  }

  async create(userId: string, dto: CreateTelegramUserAccountDto) {
    const workspaceId = await this.getWorkspaceId(userId);
    const creds = this.resolveApiCredentials(dto);
    const apiHash = this.encryptionService.encrypt(creds.apiHash);
    const encryptedPhone = this.encryptionService.encrypt(dto.phone);
    const row = await this.prisma.telegramUserAccountIntegration.create({
      data: {
        workspaceId,
        label: dto.label?.trim() || `TG ${this.maskPhone(dto.phone)}`,
        apiId: creds.apiId,
        apiHashEncrypted: apiHash.encrypted,
        apiHashIv: apiHash.iv,
        apiHashAuthTag: apiHash.authTag,
        phoneEncrypted: encryptedPhone.encrypted,
        phoneIv: encryptedPhone.iv,
        phoneAuthTag: encryptedPhone.authTag,
        phoneMasked: this.maskPhone(dto.phone),
        status: TelegramUserAccountStatus.pending,
      },
    });
    return this.safe(row);
  }

  async update(userId: string, id: string, dto: UpdateTelegramUserAccountDto) {
    const workspaceId = await this.getWorkspaceId(userId);
    const existing = await this.prisma.telegramUserAccountIntegration.findFirst(
      { where: { id, workspaceId } },
    );
    if (!existing)
      throw new NotFoundException('Telegram user account not found');
    const data: Record<string, unknown> = {
      label: dto.label,
      apiId: dto.apiId,
      isActive: dto.isActive,
    };
    if (dto.apiHash) {
      const encrypted = this.encryptionService.encrypt(dto.apiHash);
      data.apiHashEncrypted = encrypted.encrypted;
      data.apiHashIv = encrypted.iv;
      data.apiHashAuthTag = encrypted.authTag;
    }
    const row = await this.prisma.telegramUserAccountIntegration.update({
      where: { id },
      data,
    });
    return this.safe(row);
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    const row = await this.prisma.telegramUserAccountIntegration.delete({
      where: { id },
    });
    return this.safe(row);
  }

  async startLogin(userId: string, id: string, dto: StartLoginDto) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');

    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const phone =
      dto.phone ||
      (account.phoneEncrypted && account.phoneIv && account.phoneAuthTag
        ? this.encryptionService.decrypt({
            encrypted: account.phoneEncrypted,
            iv: account.phoneIv,
            authTag: account.phoneAuthTag,
          })
        : null);
    if (!phone)
      throw new BadRequestException('Phone is required to start login.');
    const started = await this.mtprotoClient.startLogin(
      account.apiId,
      apiHash,
      phone,
    );
    const loginTempSession = this.encryptLoginTempSession(started.tempSession);

    await this.prisma.telegramUserAccountIntegration.update({
      where: { id: account.id },
      data: {
        status: TelegramUserAccountStatus.needs_code,
        lastErrorMessage: null,
        lastCheckedAt: new Date(),
        phoneMasked: this.maskPhone(phone),
        loginPhoneCodeHash: started.phoneCodeHash,
        loginStartedAt: new Date(),
        loginTempSessionEncrypted: loginTempSession?.loginTempSessionEncrypted,
        loginTempSessionIv: loginTempSession?.loginTempSessionIv,
        loginTempSessionAuthTag: loginTempSession?.loginTempSessionAuthTag,
      },
    });
    return { success: true, status: TelegramUserAccountStatus.needs_code };
  }

  async confirmCode(userId: string, id: string, dto: ConfirmLoginCodeDto) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');

    const statePhoneCodeHash = account.loginPhoneCodeHash;
    const stateTempSession = this.decryptLoginTempSession(account);
    if (!statePhoneCodeHash) {
      await this.prisma.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          status: TelegramUserAccountStatus.error,
          lastErrorMessage: 'Login session expired. Start login again.',
          loginPhoneCodeHash: null,
          loginTempSessionEncrypted: null,
          loginTempSessionIv: null,
          loginTempSessionAuthTag: null,
          loginStartedAt: null,
        },
      });
      return { success: false, status: TelegramUserAccountStatus.error };
    }

    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const phone = this.decryptPhone(account);
    if (!phone) {
      throw new BadRequestException('Phone is required to confirm login code.');
    }
    const result = await this.mtprotoClient.signInWithCode({
      apiId: account.apiId,
      apiHash,
      phone,
      phoneCodeHash: statePhoneCodeHash,
      code: dto.code,
      tempSession: stateTempSession ?? undefined,
    });

    if (result.needsPassword) {
      await this.prisma.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          status: TelegramUserAccountStatus.needs_password,
          lastErrorMessage: null,
          loginPhoneCodeHash: statePhoneCodeHash,
          ...(result.tempSession ? this.encryptLoginTempSession(result.tempSession) : {}),
        },
      });
      return {
        success: true,
        status: TelegramUserAccountStatus.needs_password,
      };
    }
    if (!result.me || !result.session) {
      throw new BadRequestException('Telegram authorization failed');
    }

    const encryptedSession = this.encryptionService.encrypt(result.session);
    const row = await this.prisma.telegramUserAccountIntegration.update({
      where: { id: account.id },
      data: {
        sessionEncrypted: encryptedSession.encrypted,
        sessionIv: encryptedSession.iv,
        sessionAuthTag: encryptedSession.authTag,
        telegramUserId: result.me.id,
        username: result.me.username,
        firstName: result.me.firstName,
        lastName: result.me.lastName,
        photoUrl: result.me.photoUrl ?? null,
        nameColor: result.me.nameColor ?? null,
        label:
          (result.me.username &&
            `@${String(result.me.username).replace('@', '')}`) ||
          result.me.firstName ||
          account.label,
        status: TelegramUserAccountStatus.connected,
        lastSyncedAt: new Date(),
        lastCheckedAt: new Date(),
        lastErrorMessage: null,
        loginPhoneCodeHash: null,
        loginTempSessionEncrypted: null,
        loginTempSessionIv: null,
        loginTempSessionAuthTag: null,
        loginStartedAt: null,
      },
    });
    return this.safe(row);
  }

  async confirmPassword(
    userId: string,
    id: string,
    dto: Confirm2faPasswordDto,
  ) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');

    const statePhoneCodeHash = account.loginPhoneCodeHash;
    const stateTempSession = this.decryptLoginTempSession(account);
    if (!statePhoneCodeHash) {
      await this.prisma.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          status: TelegramUserAccountStatus.error,
          lastErrorMessage: 'Login session expired. Start login again.',
          loginPhoneCodeHash: null,
          loginTempSessionEncrypted: null,
          loginTempSessionIv: null,
          loginTempSessionAuthTag: null,
          loginStartedAt: null,
        },
      });
      return { success: false, status: TelegramUserAccountStatus.error };
    }

    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const result = await this.mtprotoClient.signInWithPassword({
      apiId: account.apiId,
      apiHash,
      password: dto.password,
      tempSession: stateTempSession ?? undefined,
    });
    const encryptedSession = this.encryptionService.encrypt(result.session);
    const row = await this.prisma.telegramUserAccountIntegration.update({
      where: { id: account.id },
      data: {
        sessionEncrypted: encryptedSession.encrypted,
        sessionIv: encryptedSession.iv,
        sessionAuthTag: encryptedSession.authTag,
        telegramUserId: result.me.id,
        username: result.me.username,
        firstName: result.me.firstName,
        lastName: result.me.lastName,
        photoUrl: result.me.photoUrl ?? null,
        nameColor: result.me.nameColor ?? null,
        label:
          (result.me.username &&
            `@${String(result.me.username).replace('@', '')}`) ||
          result.me.firstName ||
          account.label,
        status: TelegramUserAccountStatus.connected,
        lastSyncedAt: new Date(),
        lastCheckedAt: new Date(),
        lastErrorMessage: null,
        loginPhoneCodeHash: null,
        loginTempSessionEncrypted: null,
        loginTempSessionIv: null,
        loginTempSessionAuthTag: null,
        loginStartedAt: null,
      },
    });
    return this.safe(row);
  }

  async check(userId: string, id: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');

    if (
      !account.sessionEncrypted ||
      !account.sessionIv ||
      !account.sessionAuthTag
    ) {
      const row = await this.prisma.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          status: TelegramUserAccountStatus.pending,
          lastCheckedAt: new Date(),
          lastErrorMessage: 'Account is not connected yet',
        },
      });
      return this.safe(row);
    }

    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const session = this.encryptionService.decrypt({
      encrypted: account.sessionEncrypted,
      iv: account.sessionIv,
      authTag: account.sessionAuthTag,
    });
    const me = await this.mtprotoClient.getMe({
      apiId: account.apiId,
      apiHash,
      session,
    });
    const row = await this.prisma.telegramUserAccountIntegration.update({
      where: { id: account.id },
      data: {
        telegramUserId: me.id,
        username: me.username,
        firstName: me.firstName,
        lastName: me.lastName,
        photoUrl: me.photoUrl ?? null,
        nameColor: me.nameColor ?? null,
        label:
          (me.username && `@${String(me.username).replace('@', '')}`) ||
          me.firstName ||
          account.label,
        status: TelegramUserAccountStatus.connected,
        lastCheckedAt: new Date(),
        lastErrorMessage: null,
      },
    });
    return this.safe(row);
  }

  async syncDialogs(userId: string, id: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId, isActive: true },
    });
    if (!account)
      throw new NotFoundException('Telegram user account not found');
    if (
      !account.sessionEncrypted ||
      !account.sessionIv ||
      !account.sessionAuthTag
    ) {
      return { success: false, message: 'Connect account first', channels: [] };
    }

    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const session = this.encryptionService.decrypt({
      encrypted: account.sessionEncrypted,
      iv: account.sessionIv,
      authTag: account.sessionAuthTag,
    });
    const [channels, me] = await Promise.all([
      this.mtprotoClient.getAdminChannels({
        apiId: account.apiId,
        apiHash,
        session,
      }),
      this.mtprotoClient.getMe({ apiId: account.apiId, apiHash, session }),
    ]);

    const workspaceChannels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, isActive: true },
      select: { id: true, username: true },
    });
    const channelByUsername = new Map(
      workspaceChannels
        .map((c) => [this.normalizeUsername(c.username), c.id] as const)
        .filter(([username]) => !!username),
    );
    const matchedChannels = channels
      .map((channel) => ({
        channel,
        id: channelByUsername.get(this.normalizeUsername(channel.username)),
      }))
      .filter(
        (row): row is { channel: (typeof channels)[number]; id: string } =>
          !!row.id,
      );

    await this.prisma.$transaction(async (tx) => {
      await tx.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          telegramUserId: me.id,
          username: me.username,
          firstName: me.firstName,
          lastName: me.lastName,
          photoUrl: me.photoUrl ?? null,
          nameColor: me.nameColor ?? null,
          label:
            (me.username && `@${String(me.username).replace('@', '')}`) ||
            me.firstName ||
            account.label,
          lastSyncedAt: new Date(),
          lastCheckedAt: new Date(),
          status: TelegramUserAccountStatus.connected,
          lastErrorMessage: null,
        },
      });
      await tx.telegramChannelAdminLink.deleteMany({
        where: { workspaceId, telegramUserAccountIntegrationId: account.id },
      });
      if (matchedChannels.length) {
        await tx.telegramChannelAdminLink.createMany({
          data: matchedChannels.map(({ id: telegramChannelId }) => ({
            workspaceId,
            telegramChannelId,
            telegramUserAccountIntegrationId: account.id,
            source: 'mtproto',
          })),
          skipDuplicates: true,
        });
      }
    });
    for (const { channel, id: telegramChannelId } of matchedChannels) {
      const rawPermissions = {
        isCreator: channel.isCreator,
        adminRights: channel.adminRights || null,
      };
      const normalized =
        this.sourceAccessService.normalizeMtprotoPermissions(rawPermissions);
      await this.sourceAccessService.upsertAccess({
        workspaceId,
        channelId: telegramChannelId,
        sourceId: account.id,
        sourceType: TelegramSourceType.MTPROTO,
        role: normalized.role,
        permissions: normalized.permissions,
        rawPermissions,
      });
    }

    return {
      success: true,
      channels,
      matchedChannels: matchedChannels.length,
      message:
        matchedChannels.length > 0
          ? `Linked admin to ${matchedChannels.length} workspace channels`
          : 'No matching workspace channels by username',
    };
  }
}
