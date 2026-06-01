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
import { TransactionType } from '@prisma/client';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateFinanceCategoryDto, UpdateFinanceCategoryDto } from './dto';
import { FinanceCategoriesService } from './finance-categories.service';

@UseGuards(JwtAuthGuard)
@Controller('finance/categories')
export class FinanceCategoriesController {
  constructor(private readonly service: FinanceCategoriesService) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('type') type?: TransactionType,
  ) {
    return this.service.list(user.sub, type);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateFinanceCategoryDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceCategoryDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}
