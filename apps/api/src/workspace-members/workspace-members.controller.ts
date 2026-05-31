import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateWorkspaceMemberDto, UpdateWorkspaceMemberDto } from './dto';
import { WorkspaceMembersService } from './workspace-members.service';

@UseGuards(JwtAuthGuard)
@Controller('workspace-members')
export class WorkspaceMembersController {
  constructor(private readonly service: WorkspaceMembersService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateWorkspaceMemberDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':memberId')
  update(@CurrentUser() user: JwtUser, @Param('memberId') memberId: string, @Body() dto: UpdateWorkspaceMemberDto) {
    return this.service.update(user.sub, memberId, dto);
  }

  @Delete(':memberId')
  remove(@CurrentUser() user: JwtUser, @Param('memberId') memberId: string) {
    return this.service.remove(user.sub, memberId);
  }
}
