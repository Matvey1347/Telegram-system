import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AdCampaignsService } from './ad-campaigns.service';
import {
  CreateAdCampaignDto,
  AdCampaignQueryDto,
  UpdateAdCampaignDto,
} from './dto';

@UseGuards(JwtAuthGuard)
@Controller('ad-campaigns')
export class AdCampaignsController {
  constructor(private service: AdCampaignsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtUser, @Query() query: AdCampaignQueryDto) {
    return this.service.findAll(user.sub, query);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateAdCampaignDto) {
    return this.service.create(user.sub, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdCampaignDto,
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
