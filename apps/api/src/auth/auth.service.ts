import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { LoginDto, RegisterDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async authResponse(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    const membership = await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const accessToken = await this.jwtService.signAsync({ sub: user.id, email: user.email });

    return {
      accessToken,
      user,
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        role: membership.role,
      },
    };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const name = dto.name.trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({ data: { email, name, passwordHash } });
      const workspaceName = dto.workspaceName?.trim() || `${name}'s Workspace`;
      const workspace = await tx.workspace.create({ data: { name: workspaceName } });
      await tx.workspaceMember.create({
        data: { userId: createdUser.id, workspaceId: workspace.id, role: 'owner' },
      });
      return createdUser;
    });

    return this.authResponse(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    return this.authResponse(user.id);
  }

  async me(userId: string) {
    try {
      const auth = await this.authResponse(userId);
      return { user: auth.user, workspace: auth.workspace };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new UnauthorizedException('Session is invalid. Please sign in again.');
      }
      throw error;
    }
  }
}
