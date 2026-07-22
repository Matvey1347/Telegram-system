import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPaginatedResponse, normalizePagination } from '../common/pagination/pagination.utils';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreatePromoDto, PromoQueryDto, UpdatePromoDto } from './dto';

@Injectable()
export class PromosService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private configService: ConfigService,
  ) {}
  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }
  async findAll(userId: string, query: PromoQueryDto = {}) {
    const workspaceId = await this.workspace(userId);
    const where = {
      workspaceId,
      telegramChannelId: query.telegramChannelId || undefined,
      assignedMemberId: query.assignedMemberId || undefined,
    };
    const pagination = normalizePagination(query);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.promo.findMany({
        where,
        include: {
          telegramChannel: true,
          icon: true,
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.promo.count({ where }),
    ]);
    return createPaginatedResponse(items, totalItems, pagination);
  }
  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.promo.findFirst({
      where: { id, workspaceId },
      include: { telegramChannel: true, icon: true, assignedMember: WorkspaceService.assignedMemberInclude, createdByUser: WorkspaceService.createdByUserInclude },
    });
    if (!row) throw new NotFoundException('Promo not found');
    return row;
  }
  async create(userId: string, dto: CreatePromoDto) {
    const { workspaceId, assignedMemberId } = await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId);
    const iconId = await this.resolveIconId(workspaceId, dto.iconId);
    return this.prisma.promo.create({
      data: { workspaceId, ...dto, iconId, assignedMemberId, createdByUserId: userId, text: dto.text ?? '' },
      include: { telegramChannel: true, icon: true, assignedMember: WorkspaceService.assignedMemberInclude, createdByUser: WorkspaceService.createdByUserInclude },
    });
  }
  async update(userId: string, id: string, dto: UpdatePromoDto) {
    const existing = await this.findOne(userId, id);
    const assignedMemberId = dto.assignedMemberId === undefined ? undefined : (await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId)).assignedMemberId;
    const iconId = dto.iconId === undefined ? undefined : await this.resolveIconId(existing.workspaceId, dto.iconId);
    return this.prisma.promo.update({ where: { id }, data: { ...dto, iconId, assignedMemberId }, include: { telegramChannel: true, icon: true, assignedMember: WorkspaceService.assignedMemberInclude, createdByUser: WorkspaceService.createdByUserInclude } });
  }
  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.promo.delete({ where: { id } });
  }

  async uploadPromoImage(file: Express.Multer.File) {
    const keyId = this.configService.get<string>('B2_KEY_ID')?.trim();
    const appKey = this.configService.get<string>('B2_APP_KEY')?.trim();
    const bucketName = this.configService.get<string>('B2_BUCKET_NAME')?.trim();
    const endpoint = this.configService.get<string>('B2_ENDPOINT')?.trim();

    if (!keyId || !appKey || !bucketName) {
      throw new InternalServerErrorException(
        'B2 env vars missing: B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME',
      );
    }

    const authHeader = Buffer.from(`${keyId}:${appKey}`).toString('base64');
    const authRes = await fetch(
      'https://api.backblazeb2.com/b2api/v2/b2_authorize_account',
      {
        method: 'GET',
        headers: { Authorization: `Basic ${authHeader}` },
      },
    );
    if (!authRes.ok) {
      throw new InternalServerErrorException(
        'Failed to authorize Backblaze B2',
      );
    }
    const authData = (await authRes.json()) as {
      apiUrl: string;
      authorizationToken: string;
      downloadUrl: string;
      accountId: string;
    };

    const listBucketsRes = await fetch(
      `${authData.apiUrl}/b2api/v2/b2_list_buckets`,
      {
        method: 'POST',
        headers: {
          Authorization: authData.authorizationToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: authData.accountId,
          bucketName,
        }),
      },
    );
    if (!listBucketsRes.ok) {
      throw new InternalServerErrorException('Failed to resolve B2 bucket');
    }
    const listBucketsData = (await listBucketsRes.json()) as {
      buckets?: Array<{ bucketId: string; bucketName: string }>;
    };
    const bucket = listBucketsData.buckets?.find(
      (b) => b.bucketName === bucketName,
    );
    if (!bucket?.bucketId) {
      throw new InternalServerErrorException(
        `B2 bucket not found: ${bucketName}`,
      );
    }

    const uploadUrlRes = await fetch(
      `${authData.apiUrl}/b2api/v2/b2_get_upload_url`,
      {
        method: 'POST',
        headers: {
          Authorization: authData.authorizationToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bucketId: bucket.bucketId }),
      },
    );
    if (!uploadUrlRes.ok) {
      throw new InternalServerErrorException('Failed to get B2 upload URL');
    }
    const uploadUrlData = (await uploadUrlRes.json()) as {
      uploadUrl: string;
      authorizationToken: string;
    };

    const extension =
      file.originalname
        ?.split('.')
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'bin';
    const fileName = `promos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

    const uploadRes = await fetch(uploadUrlData.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadUrlData.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': file.mimetype || 'b2/x-auto',
        'Content-Length': String(file.size),
        'X-Bz-Content-Sha1': 'do_not_verify',
      },
      body: new Uint8Array(file.buffer),
    });
    if (!uploadRes.ok) {
      throw new InternalServerErrorException('Failed to upload image to B2');
    }

    if (!endpoint) {
      return `${authData.downloadUrl}/file/${bucketName}/${fileName}`;
    }

    const cleanEndpoint = endpoint.replace(/\/+$/, '');
    const s3HostLike = /(^https?:\/\/)?s3\./i.test(cleanEndpoint);
    const hasBucketInPath = new RegExp(`/${bucketName}(/|$)`, 'i').test(
      cleanEndpoint,
    );

    // Backblaze S3 endpoint usually needs bucket in URL path.
    if (s3HostLike && !hasBucketInPath) {
      return `${cleanEndpoint}/${bucketName}/${fileName}`;
    }

    return `${cleanEndpoint}/${fileName}`;
  }

  private async resolveIconId(
    workspaceId: string,
    rawIconId: string | null | undefined,
  ) {
    const iconId = rawIconId?.trim() || null;
    if (!iconId) return null;
    const icon = await this.prisma.icon.findFirst({
      where: {
        id: iconId,
        OR: [{ workspaceId }, { workspaceId: null }],
      },
      select: { id: true },
    });
    if (!icon) throw new NotFoundException('Icon not found');
    return iconId;
  }
}
