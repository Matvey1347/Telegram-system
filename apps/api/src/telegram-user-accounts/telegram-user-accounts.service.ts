import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelegramChannelDataType,
  TelegramSourceType,
  TelegramUserAccountStatus,
} from '@prisma/client';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../telegram/shared/telegram-source-access.service';
import { normalizeTelegramChannelId } from '../telegram/shared/telegram-post-url';
import {
  Confirm2faPasswordDto,
  ConfirmLoginCodeDto,
  CreateTelegramUserAccountDto,
  ImportUserAccountChannelsDto,
  StartLoginDto,
  UpdateTelegramUserAccountDto,
} from './dto';
import { ConfigService } from '@nestjs/config';
import { TelegramChannelsService } from '../telegram-channels/telegram-channels.service';
import { ApplicationLoggerService } from '../application-logs/application-logger.service';
import type { TelegramAccountCapabilities } from '@telegram-system/shared';
import type { TelegramAccountProfile } from '../telegram/shared/telegram-mtproto.client';

type ProgressCallback = (
  item: { message: string },
  current: number,
  total: number,
) => void | Promise<void>;

@Injectable()
export class TelegramUserAccountsService {
  private readonly logger = new Logger(TelegramUserAccountsService.name);
  private readonly defaultCapabilityTtlHours = 24;
  private readonly defaultCapabilityRefreshConcurrency = 2;
  private readonly defaultCapabilityCheckTimeoutMs = 20_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly encryptionService: TokenEncryptionService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly configService: ConfigService,
    private readonly telegramChannelsService: TelegramChannelsService,
    private readonly applicationLogger: ApplicationLoggerService = ({
      info: () => undefined,
      writeStructured: () => undefined,
    } as unknown) as ApplicationLoggerService,
  ) {}

  private async notifyProgress(
    onProgress: ProgressCallback | undefined,
    current: number,
    total: number,
    message: string,
  ) {
    if (!onProgress) return;
    await onProgress({ message }, current, total);
  }

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

  private capabilityTtlMs() {
    const ttlHours = Math.max(
      1,
      Number(
        this.configService.get<string>('TELEGRAM_ACCOUNT_CAPABILITY_TTL_HOURS') ??
          this.defaultCapabilityTtlHours,
      ) || this.defaultCapabilityTtlHours,
    );
    return ttlHours * 60 * 60 * 1000;
  }

  private capabilityRefreshConcurrency() {
    return Math.max(
      1,
      Number(
        this.configService.get<string>(
          'TELEGRAM_ACCOUNT_CAPABILITY_REFRESH_CONCURRENCY',
        ) ?? this.defaultCapabilityRefreshConcurrency,
      ) || this.defaultCapabilityRefreshConcurrency,
    );
  }

  private capabilityCheckTimeoutMs() {
    return Math.max(
      1_000,
      Number(
        this.configService.get<string>(
          'TELEGRAM_ACCOUNT_CAPABILITY_CHECK_TIMEOUT_MS',
        ) ?? this.defaultCapabilityCheckTimeoutMs,
      ) || this.defaultCapabilityCheckTimeoutMs,
    );
  }

  private accountCapabilityUpdate(profile: TelegramAccountProfile) {
    return {
      isPremium: profile.capabilities.isPremium,
      premiumCheckedAt: new Date(profile.capabilities.checkedAt),
      captionLengthMax: profile.capabilities.captionLengthMax,
      messageLengthMax: profile.capabilities.messageLengthMax,
      premiumCapabilities: {
        maxUploadFileSizeMb: profile.capabilities.maxUploadFileSizeMb,
        supportsCustomEmoji: profile.capabilities.supportsCustomEmoji,
        limitsSource: profile.capabilities.limitsSource,
      } as Prisma.InputJsonValue,
    };
  }

  private isCapabilityStale(account: {
    premiumCheckedAt?: Date | null;
  }) {
    if (!account.premiumCheckedAt) return true;
    return (
      Date.now() - account.premiumCheckedAt.getTime() > this.capabilityTtlMs()
    );
  }

  private hasConnectedSession(account: {
    sessionEncrypted?: string | null;
    sessionIv?: string | null;
    sessionAuthTag?: string | null;
  }) {
    return Boolean(
      account.sessionEncrypted && account.sessionIv && account.sessionAuthTag,
    );
  }

  private accountCredentials(account: {
    apiId: string;
    apiHashEncrypted: string;
    apiHashIv: string;
    apiHashAuthTag: string;
    sessionEncrypted?: string | null;
    sessionIv?: string | null;
    sessionAuthTag?: string | null;
  }) {
    return {
      apiId: account.apiId,
      apiHash: this.encryptionService.decrypt({
        encrypted: account.apiHashEncrypted,
        iv: account.apiHashIv,
        authTag: account.apiHashAuthTag,
      }),
      session: this.encryptionService.decrypt({
        encrypted: account.sessionEncrypted || '',
        iv: account.sessionIv || '',
        authTag: account.sessionAuthTag || '',
      }),
    };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private async refreshAccountCapabilities(
    account: {
      id: string;
      workspaceId: string;
      label: string;
      status: TelegramUserAccountStatus;
      isPremium: boolean;
      premiumCheckedAt: Date | null;
      captionLengthMax: number;
      messageLengthMax: number;
      sessionEncrypted?: string | null;
      sessionIv?: string | null;
      sessionAuthTag?: string | null;
      apiId: string;
      apiHashEncrypted: string;
      apiHashIv: string;
      apiHashAuthTag: string;
    },
    options?: { force?: boolean },
  ) {
    if (account.status !== TelegramUserAccountStatus.connected) return null;
    if (!this.hasConnectedSession(account)) return null;
    if (!options?.force && !this.isCapabilityStale(account)) return null;

    try {
      const profile = await this.withTimeout(
        this.mtprotoClient.getAccountProfile(this.accountCredentials(account)),
        this.capabilityCheckTimeoutMs(),
        `Telegram capability check for account ${account.id}`,
      );
      return await this.prisma.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          telegramUserId: profile.id,
          username: profile.username,
          firstName: profile.firstName,
          lastName: profile.lastName,
          photoUrl: profile.photoUrl ?? null,
          nameColor: profile.nameColor ?? null,
          label:
            (profile.username &&
              `@${String(profile.username).replace('@', '')}`) ||
            profile.firstName ||
            account.label,
          status: TelegramUserAccountStatus.connected,
          lastCheckedAt: new Date(),
          lastErrorMessage: null,
          ...this.accountCapabilityUpdate(profile),
        },
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      });
    } catch (error) {
      this.applicationLogger.writeStructured({
        level: 'warn',
        kind: 'integration',
        source: TelegramUserAccountsService.name,
        event: 'telegram.account_capabilities.refresh_failed',
        message:
          error instanceof Error
            ? error.message
            : 'Telegram account capability refresh failed',
        workspaceId: account.workspaceId,
        errorName: error instanceof Error ? error.name : 'Error',
        stack: error instanceof Error ? error.stack || null : null,
        metadata: { accountId: account.id, forced: Boolean(options?.force) },
      });
      return null;
    }
  }

  private async refreshAccountsCapabilities(
    rows: Array<{
      id: string;
      workspaceId: string;
      label: string;
      isActive?: boolean;
      status: TelegramUserAccountStatus;
      isPremium: boolean;
      premiumCheckedAt: Date | null;
      captionLengthMax: number;
      messageLengthMax: number;
      sessionEncrypted?: string | null;
      sessionIv?: string | null;
      sessionAuthTag?: string | null;
      apiId: string;
      apiHashEncrypted: string;
      apiHashIv: string;
      apiHashAuthTag: string;
    }>,
  ) {
    const pending = rows.filter(
      (row) =>
        row.status === TelegramUserAccountStatus.connected &&
        row.isActive !== false &&
        this.hasConnectedSession(row) &&
        this.isCapabilityStale(row),
    );
    if (!pending.length) return new Map<string, unknown>();

    const concurrency = this.capabilityRefreshConcurrency();
    const updated = new Map<string, unknown>();
    let index = 0;
    const worker = async () => {
      while (index < pending.length) {
        const current = pending[index++];
        const refreshed = await this.refreshAccountCapabilities(current);
        if (refreshed) updated.set(current.id, refreshed);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, pending.length) }, () =>
        worker(),
      ),
    );
    return updated;
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

  private async syncDialogsAfterConnect(userId: string, id: string) {
    try {
      return await this.syncDialogs(userId, id);
    } catch (error) {
      this.logger.warn(
        `MTProto channel access auto-sync skipped for account=${id}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        success: false,
        message:
          'Account connected, but channel access auto-sync failed. Run Sync channels manually.',
        channels: [],
      };
    }
  }

  private normalizeUsername(value: string | null | undefined) {
    return (value || '').replace('@', '').trim().toLowerCase();
  }

  private normalizeChatId(value: string | null | undefined) {
    return normalizeTelegramChannelId(value);
  }

  private sourceDisplayName(account: {
    username?: string | null;
    firstName?: string | null;
    label: string;
  }) {
    return (
      (account.username && `@${String(account.username).replace('@', '')}`) ||
      account.firstName ||
      account.label
    );
  }

  private channelRawPermissions(channel: {
    isCreator?: boolean;
    adminRights?: Record<string, unknown> | null;
  }) {
    return {
      isCreator: Boolean(channel.isCreator),
      adminRights: channel.adminRights || null,
    };
  }

  private channelAccessPayload(channel: {
    isCreator?: boolean;
    adminRights?: Record<string, unknown> | null;
  }) {
    const rawPermissions = this.channelRawPermissions(channel);
    const normalized =
      this.sourceAccessService.normalizeMtprotoPermissions(rawPermissions);
    return { rawPermissions, normalized };
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
      include: { assignedMember: WorkspaceService.assignedMemberInclude, createdByUser: WorkspaceService.createdByUserInclude },
      orderBy: { createdAt: 'desc' },
    });
    const refreshed = await this.refreshAccountsCapabilities(rows as never);
    return rows.map((row) =>
      this.safe((refreshed.get(row.id) as Record<string, unknown>) || row),
    );
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const row = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId },
      include: { assignedMember: WorkspaceService.assignedMemberInclude, createdByUser: WorkspaceService.createdByUserInclude },
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
    const { workspaceId, assignedMemberId } = await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId);
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
        assignedMemberId,
        createdByUserId: userId,
      },
      include: { assignedMember: WorkspaceService.assignedMemberInclude, createdByUser: WorkspaceService.createdByUserInclude },
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
    if (dto.assignedMemberId !== undefined) {
      data.assignedMemberId = (await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId)).assignedMemberId;
    }
    if (dto.apiHash) {
      const encrypted = this.encryptionService.encrypt(dto.apiHash);
      data.apiHashEncrypted = encrypted.encrypted;
      data.apiHashIv = encrypted.iv;
      data.apiHashAuthTag = encrypted.authTag;
    }
    const row = await this.prisma.telegramUserAccountIntegration.update({
      where: { id },
      data,
      include: { assignedMember: WorkspaceService.assignedMemberInclude, createdByUser: WorkspaceService.createdByUserInclude },
    });
    return this.safe(row);
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.getWorkspaceId(userId);
    const existing = await this.prisma.telegramUserAccountIntegration.findFirst(
      {
        where: { id, workspaceId },
      },
    );
    if (!existing)
      throw new NotFoundException('Telegram user account not found');
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.telegramChannelAdminLink.deleteMany({
        where: { workspaceId, telegramUserAccountIntegrationId: id },
      });
      await tx.telegramChannelSourceAccess.deleteMany({
        where: {
          workspaceId,
          sourceId: id,
          sourceType: TelegramSourceType.MTPROTO,
        },
      });
      await tx.telegramChannelDataSource.deleteMany({
        where: {
          workspaceId,
          sourceId: id,
          sourceType: TelegramSourceType.MTPROTO,
        },
      });
      return tx.telegramUserAccountIntegration.delete({ where: { id } });
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
          ...(result.tempSession
            ? this.encryptLoginTempSession(result.tempSession)
            : {}),
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
        ...this.accountCapabilityUpdate(result.me),
      },
    });
    const channelSync = await this.syncDialogsAfterConnect(userId, account.id);
    const safeRow = this.safe(row as unknown as Record<string, unknown>);
    return { ...safeRow, channelSync };
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
        ...this.accountCapabilityUpdate(result.me),
      },
    });
    const channelSync = await this.syncDialogsAfterConnect(userId, account.id);
    const safeRow = this.safe(row as unknown as Record<string, unknown>);
    return { ...safeRow, channelSync };
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

    const row =
      (await this.refreshAccountCapabilities(
        account as never,
        { force: true },
      )) ||
      (await this.prisma.telegramUserAccountIntegration.findFirstOrThrow({
        where: { id: account.id, workspaceId },
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      }));
    return this.safe(row);
  }

  async syncDialogs(
    userId: string,
    id: string,
    onProgress?: ProgressCallback,
  ) {
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

    await this.notifyProgress(
      onProgress,
      1,
      3,
      'Loading admin channels from Telegram',
    );
    const { channels, profile } =
      await this.mtprotoClient.getAdminChannelsWithProfile(
        this.accountCredentials(account),
      );

    await this.notifyProgress(
      onProgress,
      2,
      3,
      'Matching Telegram channels with workspace channels',
    );
    const workspaceChannels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, isActive: true },
      select: { id: true, username: true, telegramChatId: true },
    });
    const channelByUsername = new Map(
      workspaceChannels
        .map((c) => [this.normalizeUsername(c.username), c.id] as const)
        .filter(([username]) => !!username),
    );
    const channelByChatId = new Map(
      workspaceChannels
        .map((c) => [this.normalizeChatId(c.telegramChatId), c.id] as const)
        .filter(([chatId]) => !!chatId),
    );
    const matchedChannels = channels
      .map((channel) => ({
        channel,
        id:
          channelByUsername.get(this.normalizeUsername(channel.username)) ||
          channelByChatId.get(this.normalizeChatId(channel.id)),
      }))
      .filter(
        (row): row is { channel: (typeof channels)[number]; id: string } =>
          !!row.id,
      );
    const matchedChannelIds = new Set(matchedChannels.map(({ channel }) => channel.id));
    const formatSyncedChannel = ({
      channel,
      id: workspaceChannelId,
    }: {
      channel: (typeof channels)[number];
      id: string;
    }) => {
      const access = this.channelAccessPayload(channel);
      return {
        channelId: channel.id,
        workspaceChannelId,
        telegramChannelId: channel.id,
        title: channel.title,
        username: channel.username,
        role: access.normalized.role,
        permissions: access.normalized.permissions,
        canBeUsedForAnalytics: this.sourceAccessService.canBeUsedForAnalytics(
          access.normalized.permissions,
          access.normalized.role,
        ),
      };
    };
    const formatAvailableChannel = (channel: (typeof channels)[number]) => {
      const access = this.channelAccessPayload(channel);
      return {
        channelId: channel.id,
        telegramChannelId: channel.id,
        title: channel.title,
        username: channel.username,
        role: access.normalized.role,
        permissions: access.normalized.permissions,
        canBeUsedForAnalytics: this.sourceAccessService.canBeUsedForAnalytics(
          access.normalized.permissions,
          access.normalized.role,
        ),
      };
    };

    await this.notifyProgress(
      onProgress,
      3,
      3,
      'Saving channel access links',
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          telegramUserId: profile.id,
          username: profile.username,
          firstName: profile.firstName,
          lastName: profile.lastName,
          photoUrl: profile.photoUrl ?? null,
          nameColor: profile.nameColor ?? null,
          label:
            (profile.username &&
              `@${String(profile.username).replace('@', '')}`) ||
            profile.firstName ||
            account.label,
          lastSyncedAt: new Date(),
          lastCheckedAt: new Date(),
          status: TelegramUserAccountStatus.connected,
          lastErrorMessage: null,
          ...this.accountCapabilityUpdate(profile),
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
      const { rawPermissions, normalized } = this.channelAccessPayload(channel);
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
      syncedChannels: matchedChannels.map(formatSyncedChannel),
      availableChannels: channels
        .filter((channel) => !matchedChannelIds.has(channel.id))
        .map(formatAvailableChannel),
      matchedChannels: matchedChannels.length,
      message:
        matchedChannels.length > 0
          ? `Linked admin to ${matchedChannels.length} workspace channels`
          : 'No matching workspace channels by username',
    };
  }

  async importChannels(
    userId: string,
    id: string,
    dto: ImportUserAccountChannelsDto,
    onProgress?: ProgressCallback,
  ) {
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
    const dialogs = await this.mtprotoClient.getAdminChannels({
      apiId: account.apiId,
      apiHash,
      session,
    });
    const selectedIds = new Set(
      dto.channels.map((value) => String(value.telegramChannelId)),
    );
    const requestedPolicies = new Map(
      dto.channels.map((value) => [String(value.telegramChannelId), value] as const),
    );
    const selectedChannels = dialogs.filter((channel) =>
      selectedIds.has(channel.id),
    );
    if (!selectedChannels.length) {
      return { success: true, channels: [], message: 'No channels selected' };
    }
    const totalSteps = 1 + selectedChannels.length * 2;
    let currentStep = 1;
    await this.notifyProgress(
      onProgress,
      currentStep,
      totalSteps,
      'Preparing selected Telegram channels',
    );
    await this.telegramChannelsService.ensureTelegramChannelImportPolicyColumnsAvailable();

    const existingChannels = (await this.prisma.$queryRaw(Prisma.sql`
      SELECT
        "id",
        "username",
        "telegramChatId",
        "acquisitionType",
        "postsSyncFrom",
        "inviteLinksSyncFrom",
        "purchaseTransactionId"
      FROM "TelegramChannel"
      WHERE "workspaceId" = ${workspaceId}
        AND "isActive" = true
    `)) as Array<{
      id: string;
      username: string | null;
      telegramChatId: string | null;
      acquisitionType: 'CREATED' | 'PURCHASED' | null;
      postsSyncFrom: Date | null;
      inviteLinksSyncFrom: Date | null;
      purchaseTransactionId: string | null;
    }>;
    const findExistingId = (channel: (typeof dialogs)[number]) =>
      existingChannels.find(
        (existing) =>
          (this.normalizeUsername(existing.username) &&
            this.normalizeUsername(existing.username) ===
              this.normalizeUsername(channel.username)) ||
          (this.normalizeChatId(existing.telegramChatId) &&
            this.normalizeChatId(existing.telegramChatId) ===
              this.normalizeChatId(channel.id)),
      )?.id;

    const imported: Array<{
      channelId: string;
      workspaceChannelId: string;
      title: string;
      username: string | null;
      role: ReturnType<
        TelegramSourceAccessService['normalizeMtprotoPermissions']
      >['role'];
      permissions: ReturnType<
        TelegramSourceAccessService['normalizeMtprotoPermissions']
      >['permissions'];
      canBeUsedForAnalytics: boolean;
    }> = [];
    const defaultCutoff = new Date();
    for (const channel of selectedChannels) {
      currentStep += 1;
      await this.notifyProgress(
        onProgress,
        currentStep,
        totalSteps,
        `Adding ${channel.title} to workspace`,
      );
      const { rawPermissions, normalized } = this.channelAccessPayload(channel);
      const existingId = findExistingId(channel);
      const existingChannel =
        existingChannels.find((candidate) => candidate.id === existingId) ?? null;
      const importPolicy =
        await this.telegramChannelsService.resolveChannelImportPolicy({
          workspaceId,
          channelId: existingId ?? null,
          input: requestedPolicies.get(channel.id),
          existing: existingChannel,
          defaultNow: defaultCutoff,
        });
      const workspaceChannel = existingId
        ? await (this.prisma.telegramChannel as any).update({
            where: { id: existingId },
            data: {
              title: channel.title,
              username: this.normalizeUsername(channel.username),
              telegramChatId: channel.id,
              isActive: true,
            },
          })
        : await (this.prisma.telegramChannel as any).create({
            data: {
              workspaceId,
              title: channel.title,
              username: this.normalizeUsername(channel.username),
              telegramChatId: channel.id,
              sourceType: 'telegram',
              lastPublicSyncedAt: new Date(),
            },
          });
      await this.prisma.$executeRaw(
        Prisma.sql`
          UPDATE "TelegramChannel"
          SET
            "acquisitionType" = ${importPolicy.acquisitionType}::"TelegramChannelAcquisitionType",
            "postsSyncFrom" = ${importPolicy.postsSyncFrom},
            "inviteLinksSyncFrom" = ${importPolicy.inviteLinksSyncFrom},
            "purchaseTransactionId" = ${importPolicy.purchaseTransactionId}
          WHERE "id" = ${workspaceChannel.id}
        `,
      );
      await this.prisma.telegramChannelAdminLink.upsert({
        where: {
          workspaceId_telegramChannelId_telegramUserAccountIntegrationId: {
            workspaceId,
            telegramChannelId: workspaceChannel.id,
            telegramUserAccountIntegrationId: account.id,
          },
        },
        create: {
          workspaceId,
          telegramChannelId: workspaceChannel.id,
          telegramUserAccountIntegrationId: account.id,
          source: 'mtproto',
        },
        update: { source: 'mtproto' },
      });
      await this.sourceAccessService.upsertAccess({
        workspaceId,
        channelId: workspaceChannel.id,
        sourceId: account.id,
        sourceType: TelegramSourceType.MTPROTO,
        role: normalized.role,
        permissions: normalized.permissions,
        rawPermissions,
      });
      await this.sourceAccessService.recordDataSource({
        workspaceId,
        channelId: workspaceChannel.id,
        sourceId: account.id,
        sourceType: TelegramSourceType.MTPROTO,
        dataType: TelegramChannelDataType.CHANNEL_INFO,
        sourceDisplayName: this.sourceDisplayName(account),
        metadata: {
          source: 'mtproto_dialog_import',
          telegramDialogChannelId: channel.id,
        },
      });
      imported.push({
        channelId: channel.id,
        workspaceChannelId: workspaceChannel.id,
        title: workspaceChannel.title,
        username: workspaceChannel.username,
        role: normalized.role,
        permissions: normalized.permissions,
        canBeUsedForAnalytics: this.sourceAccessService.canBeUsedForAnalytics(
          normalized.permissions,
          normalized.role,
        ),
      });
      currentStep += 1;
      await this.notifyProgress(
        onProgress,
        currentStep,
        totalSteps,
        `Importing data for ${workspaceChannel.title}`,
      );
      await this.telegramChannelsService.syncNow(userId, workspaceChannel.id);
    }

    return {
      success: true,
      channels: imported,
      message: `Added and synced ${imported.length} channels from ${this.sourceDisplayName(account)}`,
    };
  }
}
