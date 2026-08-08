import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScheduledTaskLockService {
  constructor(private readonly prisma: PrismaService) {}

  async acquire(params: {
    lockKey: string;
    taskKey: string;
    workspaceId: string | null;
    ownerId: string;
    ttlMs?: number;
  }) {
    const expiresAt = new Date(Date.now() + (params.ttlMs ?? 10 * 60_000));
    try {
      await this.prisma.scheduledTaskLease.create({
        data: {
          lockKey: params.lockKey,
          taskKey: params.taskKey,
          workspaceId: params.workspaceId,
          ownerId: params.ownerId,
          expiresAt,
        },
      });
      return true;
    } catch {
      const result = await this.prisma.scheduledTaskLease.updateMany({
        where: {
          lockKey: params.lockKey,
          expiresAt: { lt: new Date() },
        },
        data: { ownerId: params.ownerId, expiresAt },
      });
      return result.count === 1;
    }
  }

  async release(lockKey: string, ownerId: string) {
    await this.prisma.scheduledTaskLease.deleteMany({
      where: { lockKey, ownerId },
    });
  }

  async renew(lockKey: string, ownerId: string, ttlMs = 10 * 60_000) {
    await this.prisma.scheduledTaskLease.updateMany({
      where: { lockKey, ownerId },
      data: { expiresAt: new Date(Date.now() + ttlMs) },
    });
  }
}
