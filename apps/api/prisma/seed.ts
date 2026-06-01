import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

config({ path: '../../.env', override: true });

const DEFAULT_ADMIN_SEED_KEY = 'default-admin';
const DEFAULT_WORKSPACE_ID = 'default-workspace';
const DEFAULT_WORKSPACE_NAME = 'Default Workspace';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not defined');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim();

  if (!email || !password || !name) {
    console.log('Skipping admin seed: ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME not provided.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    const seededAdmin = await tx.user.findUnique({
      where: { seedKey: DEFAULT_ADMIN_SEED_KEY },
    });

    let adminUserId: string;

    if (seededAdmin) {
      const updated = await tx.user.update({
        where: { id: seededAdmin.id },
        data: { email, name, passwordHash },
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
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: adminUserId } },
      update: { role: 'owner' },
      create: { workspaceId: workspace.id, userId: adminUserId, role: 'owner' },
    });

    await (tx as any).transactionCategory.upsert({
      where: {
        workspaceId_type_key: {
          workspaceId: workspace.id,
          type: 'income',
          key: 'investment',
        },
      },
      update: { isSystem: true, name: 'Investment' },
      create: {
        workspaceId: workspace.id,
        type: 'income',
        key: 'investment',
        name: 'Investment',
        isSystem: true,
      },
    });

    await (tx as any).transactionCategory.upsert({
      where: {
        workspaceId_type_key: {
          workspaceId: workspace.id,
          type: 'expense',
          key: 'advertising',
        },
      },
      update: { isSystem: true, name: 'Advertising' },
      create: {
        workspaceId: workspace.id,
        type: 'expense',
        key: 'advertising',
        name: 'Advertising',
        isSystem: true,
      },
    });
  });
}

main().finally(async () => prisma.$disconnect());
