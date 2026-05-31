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
import {
  CreateCurrencyRateDto,
  UpdateCurrencySettingsDto,
  UpdateCurrencyRateDto,
} from './dto';
import { CurrenciesService } from './currencies.service';

@UseGuards(JwtAuthGuard)
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly service: CurrenciesService) {}

  @Get('settings')
  getSettings(@CurrentUser() user: JwtUser) {
    return this.service.getSettings(user.sub);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateCurrencySettingsDto,
  ) {
    return this.service.updateSettings(user.sub, dto);
  }

  @Get('rates')
  getRates(@CurrentUser() user: JwtUser) {
    return this.service.getRates(user.sub);
  }

  @Post('rates')
  createRate(@CurrentUser() user: JwtUser, @Body() dto: CreateCurrencyRateDto) {
    return this.service.createRate(user.sub, dto);
  }

  @Patch('rates/:id')
  updateRate(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateCurrencyRateDto,
  ) {
    return this.service.updateRate(user.sub, id, dto);
  }

  @Delete('rates/:id')
  removeRate(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.removeRate(user.sub, id);
  }

  @Post('sync-rates')
  syncRates(@CurrentUser() user: JwtUser) {
    return this.service.syncRates(user.sub);
  }
}
