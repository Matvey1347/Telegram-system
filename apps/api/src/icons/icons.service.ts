import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import {
  CreateCustomIconDto,
  CreateEmojiIconDto,
  CreateTemporaryImageIconDto,
  ListIconsQueryDto,
} from './dto';

@Injectable()
export class IconsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly configService: ConfigService,
  ) {}

  private iconSelect = {
    id: true,
    workspaceId: true,
    type: true,
    name: true,
    emoji: true,
    imageUrl: true,
    createdByUserId: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private async workspaceId(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  async findAll(userId: string, query: ListIconsQueryDto = {}) {
    const workspaceId = await this.workspaceId(userId);
    const search = query.search?.trim();

    return this.prisma.icon.findMany({
      where: {
        workspaceId,
        NOT: { name: { startsWith: 'temporary:' } },
        ...(search
          ? {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: this.iconSelect,
    });
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspaceId(userId);
    const icon = await this.prisma.icon.findFirst({
      where: { id, workspaceId },
      select: this.iconSelect,
    });
    if (!icon) throw new NotFoundException('Icon not found');
    return icon;
  }

  async createCustom(userId: string, dto: CreateCustomIconDto) {
    const workspaceId = await this.workspaceId(userId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    const imageUrl = dto.imageUrl.trim();
    if (!imageUrl) throw new BadRequestException('Image URL is required');

    return this.prisma.icon.upsert({
      where: {
        workspaceId_type_name: {
          workspaceId,
          type: 'image',
          name,
        },
      },
      update: {
        imageUrl,
        createdByUserId: userId,
      },
      create: {
        workspaceId,
        type: 'image',
        name,
        imageUrl,
        createdByUserId: userId,
      },
      select: this.iconSelect,
    });
  }

  async createTemporaryImage(userId: string, dto: CreateTemporaryImageIconDto) {
    const workspaceId = await this.workspaceId(userId);
    const imageUrl = dto.imageUrl.trim();
    if (!imageUrl) throw new BadRequestException('Image URL is required');
    const fileName = dto.fileName?.trim() || 'uploaded image';

    return this.prisma.icon.create({
      data: {
        workspaceId,
        type: 'image',
        name: `temporary:${Date.now()}:${fileName}`.slice(0, 80),
        imageUrl,
        createdByUserId: userId,
      },
      select: this.iconSelect,
    });
  }

  async createEmoji(userId: string, dto: CreateEmojiIconDto) {
    const workspaceId = await this.workspaceId(userId);
    const name = dto.name.trim();
    const emoji = dto.emoji.trim();
    if (!name) throw new BadRequestException('Name is required');
    if (!emoji) throw new BadRequestException('Emoji is required');

    const existingByEmoji = await this.prisma.icon.findFirst({
      where: { workspaceId, type: 'emoji', emoji },
    });
    if (existingByEmoji) {
      return this.prisma.icon.update({
        where: { id: existingByEmoji.id },
        data: { name, createdByUserId: userId },
        select: this.iconSelect,
      });
    }

    return this.prisma.icon.upsert({
      where: {
        workspaceId_type_name: {
          workspaceId,
          type: 'emoji',
          name,
        },
      },
      update: {
        emoji,
        createdByUserId: userId,
      },
      create: {
        workspaceId,
        type: 'emoji',
        name,
        emoji,
        createdByUserId: userId,
      },
      select: this.iconSelect,
    });
  }

  async uploadImage(file: Express.Multer.File) {
    const keyId = this.configService.get<string>('B2_KEY_ID')?.trim();
    const appKey = this.configService.get<string>('B2_APP_KEY')?.trim();
    const bucketName = this.configService.get<string>('B2_BUCKET_NAME')?.trim();
    const endpoint = this.configService.get<string>('B2_ENDPOINT')?.trim();

    if (!keyId || !appKey || !bucketName) {
      throw new InternalServerErrorException(
        'B2 env vars missing: B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME',
      );
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Image file is required');
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
    const fileName = `icons/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

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

    if (s3HostLike && !hasBucketInPath) {
      return `${cleanEndpoint}/${bucketName}/${fileName}`;
    }

    return `${cleanEndpoint}/${fileName}`;
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspaceId(userId);
    const icon = await this.prisma.icon.findFirst({
      where: { id, workspaceId },
    });
    if (!icon) throw new NotFoundException('Icon not found');
    return this.prisma.icon.delete({ where: { id } });
  }
}
