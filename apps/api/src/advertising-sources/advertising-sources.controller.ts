import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateAdvertisingSourceDto, UpdateAdvertisingSourceDto } from './dto';
import { AdvertisingSourcesService } from './advertising-sources.service';

@UseGuards(JwtAuthGuard)
@Controller(['advertising-channels', 'ad-sources'])
export class AdvertisingSourcesController {
  constructor(private service: AdvertisingSourcesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtUser) {
    return this.service.findAll(user.sub);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateAdvertisingSourceDto) {
    return this.service.create(user.sub, dto);
  }

  @Get('analytics/summary')
  summary(@CurrentUser() user: JwtUser) {
    return this.service.analyticsSummary(user.sub);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdvertisingSourceDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }

  @Get(':id/analytics')
  analytics(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.analytics(user.sub, id);
  }
}
