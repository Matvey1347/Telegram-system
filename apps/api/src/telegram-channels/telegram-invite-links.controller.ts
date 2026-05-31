import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { UpdateInviteLinkDto } from './dto';
import { TelegramChannelsService } from './telegram-channels.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-invite-links')
export class TelegramInviteLinksController {
  constructor(private readonly channelsService: TelegramChannelsService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateInviteLinkDto,
  ) {
    return this.channelsService.updateInviteLink(user.sub, id, dto);
  }

  @Post(':id/revoke')
  revoke(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.channelsService.revokeInviteLink(user.sub, id);
  }
}
