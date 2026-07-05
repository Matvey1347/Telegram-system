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
import { CurrentUser, type JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  CreatePromptNoteDto,
  PromptNotesQueryDto,
  UpdatePromptNoteDto,
} from './dto';
import { PromptNotesService } from './prompt-notes.service';

@UseGuards(JwtAuthGuard)
@Controller('prompt-notes')
export class PromptNotesController {
  constructor(private readonly service: PromptNotesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtUser, @Query() query: PromptNotesQueryDto) {
    return this.service.findAll(user.sub, query);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreatePromptNoteDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdatePromptNoteDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}
