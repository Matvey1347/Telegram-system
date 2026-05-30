import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_ADMIN_SEED_KEY = 'default-admin';
const DEFAULT_WORKSPACE_ID = 'default-workspace';
const DEFAULT_WORKSPACE_NAME = 'Default Workspace';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const emailRaw = this.configService.get<string>('ADMIN_EMAIL');
    const password = this.configService.get<string>('ADMIN_PASSWORD');
    const nameRaw = this.configService.get<string>('ADMIN_NAME');

    const email = emailRaw?.toLowerCase().trim();
    const name = nameRaw?.trim();

    if (!email || !password || !name) {
      throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME are required for admin bootstrap');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.$transaction(async (tx) => {
      const seededAdmin = await tx.user.findUnique({
        where: { seedKey: DEFAULT_ADMIN_SEED_KEY },
      });

      let adminUserId: string;

      if (seededAdmin) {
        const updated = await tx.user.update({
          where: { id: seededAdmin.id },
          data: {
            email,
            name,
            passwordHash,
          },
        });
        adminUserId = updated.id;
      } else {
        const byEmail = await tx.user.findUnique({
          where: { email },
        });

        if (byEmail) {
          const updated = await tx.user.update({
            where: { id: byEmail.id },
            data: {
              email,
              name,
              passwordHash,
              seedKey: DEFAULT_ADMIN_SEED_KEY,
            },
          });
          adminUserId = updated.id;
        } else {
          const created = await tx.user.create({
            data: {
              email,
              name,
              passwordHash,
              seedKey: DEFAULT_ADMIN_SEED_KEY,
            },
          });
          adminUserId = created.id;
        }
      }

      const workspace = await tx.workspace.upsert({
        where: { id: DEFAULT_WORKSPACE_ID },
        update: { name: DEFAULT_WORKSPACE_NAME },
        create: { id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME },
      });

      await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: workspace.id,
            userId: adminUserId,
          },
        },
        update: {
          role: 'owner',
        },
        create: {
          workspaceId: workspace.id,
          userId: adminUserId,
          role: 'owner',
        },
      });
    });

    this.logger.log('Default admin initialized');
  }
}
