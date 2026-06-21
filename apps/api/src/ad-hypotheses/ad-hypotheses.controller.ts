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
import { AdHypothesesService } from './ad-hypotheses.service';
import { CreateAdHypothesisDto } from './dto/create-ad-hypothesis.dto';
import { UpdateAdHypothesisDto } from './dto/update-ad-hypothesis.dto';

@UseGuards(JwtAuthGuard)
@Controller('ad-hypotheses')
export class AdHypothesesController {
  constructor(private service: AdHypothesesService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.sub);
  }

  @Get(':id/summary')
  summary(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.getHypothesisSummary(user.sub, id);
  }

  @Get(':id')
  getById(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.getById(user.sub, id);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateAdHypothesisDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdHypothesisDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}
