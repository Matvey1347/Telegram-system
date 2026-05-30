import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateTransferDto, UpdateTransferDto } from './dto';
import { TransfersService } from './transfers.service';

@UseGuards(JwtAuthGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private service: TransfersService) {}
  @Get() findAll(@CurrentUser() user: JwtUser) { return this.service.findAll(user.sub); }
  @Post() create(@CurrentUser() user: JwtUser, @Body() dto: CreateTransferDto) { return this.service.create(user.sub, dto); }
  @Get(':id') findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.service.findOne(user.sub, id); }
  @Patch(':id') update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateTransferDto) { return this.service.update(user.sub, id, dto); }
  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.service.remove(user.sub, id); }
}
