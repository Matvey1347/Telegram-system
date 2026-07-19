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
import { RequestContextService } from './request-context/request-context.service';

@Injectable({ scope: Scope.REQUEST })
export class WorkspaceService {
  static readonly assignedMemberInclude = {
    include: {
      user: { select: { id: true, email: true, name: true } },
      avatarIcon: {
        select: {
          id: true,
          type: true,
          name: true,
          emoji: true,
          imageUrl: true,
        },
      },
    },
  } as const;

  static readonly createdByUserInclude = {
    select: { id: true, email: true, name: true },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
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
          telegramUsername: true,
          avatarIconId: true,
          avatarIcon: true,
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
        telegramUsername: true,
        avatarIconId: true,
        avatarIcon: true,
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
    this.requestContext.set({
      userId,
      workspaceId: membership.workspaceId,
    });
    return membership.workspaceId;
  }

  async resolveAssignedMemberId(
    userId: string,
    requestedAssignedMemberId?: string | null,
  ) {
    const currentMembership =
      await this.resolveWorkspaceMembershipForUser(userId);
    this.requestContext.set({
      userId,
      workspaceId: currentMembership.workspaceId,
    });
    const canAssignOthers =
      currentMembership.role === WorkspaceRole.owner ||
      currentMembership.role === WorkspaceRole.admin;

    if (requestedAssignedMemberId === undefined) {
      return {
        workspaceId: currentMembership.workspaceId,
        currentMembership,
        assignedMemberId: currentMembership.id,
      };
    }

    if (requestedAssignedMemberId === null) {
      if (!canAssignOthers) {
        throw new ForbiddenException(
          'Only workspace owners and admins can leave an entity unassigned',
        );
      }
      return {
        workspaceId: currentMembership.workspaceId,
        currentMembership,
        assignedMemberId: null,
      };
    }

    const assignedMember = await this.prisma.workspaceMember.findFirst({
      where: {
        id: requestedAssignedMemberId,
        workspaceId: currentMembership.workspaceId,
      },
      select: { id: true },
    });
    if (!assignedMember) {
      throw new NotFoundException('Workspace member not found');
    }
    if (!canAssignOthers && assignedMember.id !== currentMembership.id) {
      throw new ForbiddenException(
        'Workspace members can only assign entities to themselves',
      );
    }

    return {
      workspaceId: currentMembership.workspaceId,
      currentMembership,
      assignedMemberId: assignedMember.id,
    };
  }

  async requireWorkspaceRole(userId: string, allowedRoles: WorkspaceRole[]) {
    const membership = await this.resolveWorkspaceMembershipForUser(userId);
    this.requestContext.set({
      userId,
      workspaceId: membership.workspaceId,
    });
    if (!allowedRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient workspace role');
    }
    return membership;
  }

  async ensureCanAccessWorkspaceEntity(userId: string, workspaceId: string) {
    const membership = await this.resolveWorkspaceMembershipForUser(userId);
    this.requestContext.set({
      userId,
      workspaceId: membership.workspaceId,
    });
    if (membership.workspaceId !== workspaceId) {
      throw new ForbiddenException('Access denied for this workspace');
    }
    return membership;
  }
}
