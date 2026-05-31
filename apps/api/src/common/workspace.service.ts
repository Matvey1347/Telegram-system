import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWorkspaceMembershipForUser(userId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { workspace: true },
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of any workspace');
    }

    return membership;
  }

  async resolveWorkspaceIdForUser(userId: string): Promise<string> {
    const membership = await this.resolveWorkspaceMembershipForUser(userId);
    return membership.workspaceId;
  }

  async requireWorkspaceRole(userId: string, allowedRoles: WorkspaceRole[]) {
    const membership = await this.resolveWorkspaceMembershipForUser(userId);
    if (!allowedRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient workspace role');
    }
    return membership;
  }

  async ensureCanAccessWorkspaceEntity(userId: string, workspaceId: string) {
    const membership = await this.resolveWorkspaceMembershipForUser(userId);
    if (membership.workspaceId !== workspaceId) {
      throw new ForbiddenException('Access denied for this workspace');
    }
    return membership;
  }
}
