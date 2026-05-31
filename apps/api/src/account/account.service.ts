import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { UpdateMeDto, UpdatePasswordDto, UpdateWorkspaceDto } from './dto';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    return {
      ...user,
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        role: membership.role,
      },
    };
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const data: { name?: string; email?: string } = {};

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) throw new ConflictException('Name cannot be empty');
      data.name = trimmed;
    }

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== userId)
        throw new ConflictException('Email already exists');
      data.email = email;
    }

    if (!Object.keys(data).length) return this.me(userId);

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.me(userId);
  }

  async updatePassword(userId: string, dto: UpdatePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid)
      throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { success: true };
  }

  async updateWorkspace(userId: string, dto: UpdateWorkspaceDto) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    if (membership.role !== WorkspaceRole.owner) {
      throw new ForbiddenException('Only owner can update workspace name');
    }

    await this.prisma.workspace.update({
      where: { id: membership.workspaceId },
      data: { name: dto.name.trim() },
    });

    return this.me(userId);
  }
}
