import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { ApplicationLogsService } from './application-logs.service';
import { ApplicationLogsQueryDto } from './dto/application-logs-query.dto';
import { ClientLogDto } from './dto/client-log.dto';

@UseGuards(JwtAuthGuard)
@Controller('application-logs')
export class ApplicationLogsController {
  constructor(private readonly service: ApplicationLogsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: ApplicationLogsQueryDto) {
    return this.service.list(user.sub, query);
  }

  @Get('filter-options')
  filterOptions(@CurrentUser() user: JwtUser) {
    return this.service.filterOptions(user.sub);
  }

  @Get(':id')
  detail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.detail(user.sub, id);
  }

  @Delete()
  clear(@CurrentUser() user: JwtUser) {
    return this.service.clearWorkspaceLogs(user.sub);
  }

  @Post('client')
  createClientLog(@CurrentUser() user: JwtUser, @Body() dto: ClientLogDto) {
    return this.service.createClientLog(user.sub, dto);
  }
}
