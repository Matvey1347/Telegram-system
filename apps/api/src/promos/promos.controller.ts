import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreatePromoDto, UpdatePromoDto } from './dto';
import { PromosService } from './promos.service';

@UseGuards(JwtAuthGuard)
@Controller('promos')
export class PromosController {
constructor(private service: PromosService) {}
@Get() findAll(@CurrentUser() user: JwtUser){return this.service.findAll(user.sub)}
@Post() create(@CurrentUser() user: JwtUser,@Body() dto: CreatePromoDto){return this.service.create(user.sub,dto)}
@Get(':id') findOne(@CurrentUser() user: JwtUser,@Param('id') id: string){return this.service.findOne(user.sub,id)}
@Patch(':id') update(@CurrentUser() user: JwtUser,@Param('id') id: string,@Body() dto: UpdatePromoDto){return this.service.update(user.sub,id,dto)}
@Delete(':id') remove(@CurrentUser() user: JwtUser,@Param('id') id: string){return this.service.remove(user.sub,id)}
}
