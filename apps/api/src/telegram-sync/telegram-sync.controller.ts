import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { TelegramSyncService } from './telegram-sync.service';

@Controller()
export class TelegramSyncController {
  constructor(private readonly syncService: TelegramSyncService) {}

  @Post('telegram/webhook/:botIntegrationId')
  webhook(
    @Param('botIntegrationId') botIntegrationId: string,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string | undefined,
    @Body() update: Record<string, any>,
  ) {
    return this.syncService.handleWebhook(botIntegrationId, secretToken, update);
  }

  @UseGuards(JwtAuthGuard)
  @Post('telegram-bots/:id/webhook/enable')
  enableWebhook(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.syncService.enableWebhook(user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('telegram-bots/:id/webhook/disable')
  disableWebhook(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.syncService.disableWebhook(user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('telegram-bots/:id/webhook/status')
  webhookStatus(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.syncService.getWebhookStatus(user.sub, id);
  }
}
