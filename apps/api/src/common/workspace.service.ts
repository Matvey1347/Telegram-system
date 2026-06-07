import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { WorkspaceRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable({ scope: Scope.REQUEST })
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  private selectedWorkspaceId() {
    const raw = this.request.headers['x-workspace-id'];
    return Array.isArray(raw) ? raw[0] : raw;
  }

  private workspaceSelect = {
    id: true,
    name: true,
    primaryCurrency: true,
    secondaryCurrency: true,
    avatarIcon: {
      select: {
        id: true,
        type: true,
        name: true,
        emoji: true,
        imageUrl: true,
      },
    },
  } as const;

  async resolveWorkspaceMembershipForUser(userId: string) {
    const selectedWorkspaceId = this.selectedWorkspaceId();
    if (selectedWorkspaceId) {
      const membership = await this.prisma.workspaceMember.findFirst({
        where: { userId, workspaceId: selectedWorkspaceId },
        select: {
          id: true,
          workspaceId: true,
          role: true,
          workspace: { select: this.workspaceSelect },
        },
      });
      if (!membership) {
        throw new ForbiddenException('Access denied for this workspace');
      }
      return {
        ...membership,
        workspace: membership.workspace,
      };
    }

    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        workspace: { select: this.workspaceSelect },
      },
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of any workspace');
    }

    return {
        ...membership,
      workspace: membership.workspace,
    };
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
