import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { GlobalSearchService } from './global-search.service';

@UseGuards(JwtAuthGuard)
@Controller('global-search')
export class GlobalSearchController {
  constructor(private readonly service: GlobalSearchService) {}

  @Get()
  search(@CurrentUser() user: JwtUser, @Query('q') query?: string) {
    return this.service.search(user.sub, query);
  }
}
