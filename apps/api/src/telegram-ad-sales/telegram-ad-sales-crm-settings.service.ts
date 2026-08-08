import { Injectable } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceService } from '../common/workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TelegramAdCrmMemberSettingsDto,
  TelegramAdCrmWorkspaceSettingsDto,
} from './dto';
import { decimalToString } from './domain/decimal';

@Injectable()
export class TelegramAdSalesCrmSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private mapCrmWorkspaceSettings(settings: any) {
    return {
      ...settings,
      highValueCustomerThreshold: decimalToString(
        settings.highValueCustomerThreshold,
      ),
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  private mapCrmMemberSettings(settings: any) {
    return {
      ...settings,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async getCrmWorkspaceSettings(userId: string) {
    const workspaceId = await this.workspace(userId);
    const settings =
      (await this.prisma.telegramAdCrmWorkspaceSettings.findUnique({
        where: { workspaceId },
      })) ??
      (await this.prisma.telegramAdCrmWorkspaceSettings.create({
        data: { workspaceId },
      }));
    return this.mapCrmWorkspaceSettings(settings);
  }

  async updateCrmWorkspaceSettings(
    userId: string,
    dto: TelegramAdCrmWorkspaceSettingsDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const settings = await this.prisma.telegramAdCrmWorkspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, ...(dto as Record<string, unknown>) },
      update: { ...(dto as Record<string, unknown>) },
    });
    return this.mapCrmWorkspaceSettings(settings);
  }

  async getCrmMemberSettings(userId: string) {
    const membership = await this.workspaceService.requireWorkspaceRole(
      userId,
      [
        WorkspaceRole.owner,
        WorkspaceRole.admin,
        WorkspaceRole.MEDIA_BUYER,
        WorkspaceRole.member,
      ],
    );
    const settings =
      (await this.prisma.telegramAdCrmMemberSettings.findUnique({
        where: { workspaceMemberId: membership.id },
      })) ??
      (await this.prisma.telegramAdCrmMemberSettings.create({
        data: {
          workspaceId: membership.workspaceId,
          workspaceMemberId: membership.id,
        },
      }));
    return this.mapCrmMemberSettings(settings);
  }

  async updateCrmMemberSettings(
    userId: string,
    dto: TelegramAdCrmMemberSettingsDto,
  ) {
    const membership = await this.workspaceService.requireWorkspaceRole(
      userId,
      [
        WorkspaceRole.owner,
        WorkspaceRole.admin,
        WorkspaceRole.MEDIA_BUYER,
        WorkspaceRole.member,
      ],
    );
    const settings = await this.prisma.telegramAdCrmMemberSettings.upsert({
      where: { workspaceMemberId: membership.id },
      create: {
        workspaceId: membership.workspaceId,
        workspaceMemberId: membership.id,
        ...(dto as Record<string, unknown>),
      },
      update: { ...(dto as Record<string, unknown>) },
    });
    return this.mapCrmMemberSettings(settings);
  }
}
