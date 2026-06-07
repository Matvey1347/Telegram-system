import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  CreateCustomIconDto,
  CreateEmojiIconDto,
  ListIconsQueryDto,
} from './dto';
import { IconsService } from './icons.service';

@UseGuards(JwtAuthGuard)
@Controller('icons')
export class IconsController {
  constructor(private readonly service: IconsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtUser, @Query() query: ListIconsQueryDto) {
    return this.service.findAll(user.sub, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }

  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Image file is required');
    const imageUrl = await this.service.uploadImage(file);
    return { imageUrl };
  }

  @Post('custom')
  createCustom(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateCustomIconDto,
  ) {
    return this.service.createCustom(user.sub, dto);
  }

  @Post('emoji')
  createEmoji(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateEmojiIconDto,
  ) {
    return this.service.createEmoji(user.sub, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}
