import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateWorkspaceMemberDto, UpdateWorkspaceMemberDto } from './dto';

@Injectable()
export class WorkspaceMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async requireManager(userId: string) {
    return this.workspaceService.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
      WorkspaceRole.admin,
    ]);
  }

  private toResponse<T extends { userId: string }>(
    row: T,
    currentUserId: string,
  ) {
    return { ...row, isCurrentUser: row.userId === currentUserId };
  }

  private async investmentTransactions(workspaceId: string) {
    return (this.prisma as any).transaction.findMany({
      where: {
        workspaceId,
        type: 'income',
        memberId: { not: null },
        categoryRef: { key: 'investment' },
      },
      select: {
        memberId: true,
        amountInPrimaryCurrency: true,
      },
    });
  }

  async list(userId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const [rows, investments] = await Promise.all([
      this.prisma.workspaceMember.findMany({
        where: { workspaceId: membership.workspaceId },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.investmentTransactions(membership.workspaceId),
    ]);

    const byMember = new Map<string, { total: number; count: number }>();
    for (const tx of investments) {
      const memberId = tx.memberId as string;
      const prev = byMember.get(memberId) ?? { total: 0, count: 0 };
      prev.total += Number(tx.amountInPrimaryCurrency ?? 0);
      prev.count += 1;
      byMember.set(memberId, prev);
    }
    const workspaceTotal = [...byMember.values()].reduce(
      (acc, v) => acc + v.total,
      0,
    );

    return rows.map((row) => ({
      ...this.toResponse(row, userId),
      investmentSummary: {
        isInvestor: (byMember.get(row.id)?.total ?? 0) > 0,
        totalInvestedPrimary: byMember.get(row.id)?.total ?? 0,
        investmentSharePercent:
          workspaceTotal > 0
            ? ((byMember.get(row.id)?.total ?? 0) / workspaceTotal) * 100
            : 0,
        investmentsCount: byMember.get(row.id)?.count ?? 0,
      },
    }));
  }

  async memberInvestments(userId: string, memberId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: membership.workspaceId },
    });
    if (!member) throw new NotFoundException('Workspace member not found');

    return (this.prisma as any).transaction.findMany({
      where: {
        workspaceId: membership.workspaceId,
        memberId,
        type: 'income',
        categoryRef: { key: 'investment' },
      },
      include: { account: true, categoryRef: true },
      orderBy: { date: 'desc' },
    });
  }

  async investmentsSummary(userId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const [investments, members] = await Promise.all([
      this.investmentTransactions(membership.workspaceId),
      this.prisma.workspaceMember.findMany({
        where: { workspaceId: membership.workspaceId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    const byMember = new Map<string, { total: number; count: number }>();
    for (const tx of investments) {
      const memberId = tx.memberId as string;
      const prev = byMember.get(memberId) ?? { total: 0, count: 0 };
      prev.total += Number(tx.amountInPrimaryCurrency ?? 0);
      prev.count += 1;
      byMember.set(memberId, prev);
    }

    const total = [...byMember.values()].reduce((acc, v) => acc + v.total, 0);

    return members
      .filter((m) => byMember.has(m.id))
      .map((member) => {
        const item = byMember.get(member.id)!;
        return {
          member,
          totalInvestedPrimary: item.total,
          investmentsCount: item.count,
          investmentSharePercent: total > 0 ? (item.total / total) * 100 : 0,
        };
      });
  }

  async create(userId: string, dto: CreateWorkspaceMemberDto) {
    const current = await this.requireManager(userId);
    const email = dto.email.toLowerCase().trim();
    const role = dto.role ?? WorkspaceRole.member;

    if (current.role === WorkspaceRole.admin && role !== WorkspaceRole.member) {
      throw new ForbiddenException('Admin can only add member role');
    }
    if (role === WorkspaceRole.owner && current.role !== WorkspaceRole.owner) {
      throw new ForbiddenException('Only owner can add owner role');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    let user = existingUser;
    let temporaryPassword: string | undefined;

    if (!user) {
      temporaryPassword = dto.password || randomBytes(12).toString('base64url');
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      user = await this.prisma.user.create({
        data: {
          email,
          name: dto.name?.trim() || email.split('@')[0],
          passwordHash,
        },
      });
    }

    const already = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: current.workspaceId,
          userId: user.id,
        },
      },
    });
    if (already)
      throw new ConflictException('User is already a member of this workspace');

    const created = await this.prisma.workspaceMember.create({
      data: { workspaceId: current.workspaceId, userId: user.id, role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    return {
      ...this.toResponse(created, userId),
      temporaryPassword: dto.password ? undefined : temporaryPassword,
    };
  }

  async update(
    userId: string,
    memberId: string,
    dto: UpdateWorkspaceMemberDto,
  ) {
    const current = await this.requireManager(userId);
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: current.workspaceId },
    });
    if (!member) throw new NotFoundException('Workspace member not found');

    if (current.role === WorkspaceRole.admin) {
      if (member.role !== WorkspaceRole.member) {
        throw new ForbiddenException('Admin cannot edit owner/admin');
      }
      if (dto.role !== WorkspaceRole.member) {
        throw new ForbiddenException('Admin can only assign member role');
      }
    }

    if (
      dto.role === WorkspaceRole.owner &&
      current.role !== WorkspaceRole.owner
    ) {
      throw new ForbiddenException('Only owner can promote to owner');
    }

    if (
      member.role === WorkspaceRole.owner &&
      dto.role !== WorkspaceRole.owner
    ) {
      const ownersCount = await this.prisma.workspaceMember.count({
        where: { workspaceId: current.workspaceId, role: WorkspaceRole.owner },
      });
      if (ownersCount <= 1)
        throw new ForbiddenException('Cannot demote the last owner');
    }

    const updated = await this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return this.toResponse(updated, userId);
  }

  async remove(userId: string, memberId: string) {
    const current = await this.requireManager(userId);
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: current.workspaceId },
    });
    if (!member) throw new NotFoundException('Workspace member not found');

    if (
      current.role === WorkspaceRole.admin &&
      member.role !== WorkspaceRole.member
    ) {
      throw new ForbiddenException('Admin cannot remove owner/admin');
    }

    if (member.role === WorkspaceRole.owner) {
      const ownersCount = await this.prisma.workspaceMember.count({
        where: { workspaceId: current.workspaceId, role: WorkspaceRole.owner },
      });
      if (ownersCount <= 1)
        throw new ForbiddenException('Cannot remove the last owner');
    }

    if (member.userId === userId && member.role === WorkspaceRole.owner) {
      const ownersCount = await this.prisma.workspaceMember.count({
        where: { workspaceId: current.workspaceId, role: WorkspaceRole.owner },
      });
      if (ownersCount <= 1)
        throw new ForbiddenException(
          'Cannot remove yourself as the last owner',
        );
    }

    return this.prisma.workspaceMember.delete({ where: { id: memberId } });
  }
}
