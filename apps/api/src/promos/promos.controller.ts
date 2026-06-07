import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreatePromoDto, PromoQueryDto, UpdatePromoDto } from './dto';
import { PromosService } from './promos.service';

@UseGuards(JwtAuthGuard)
@Controller('promos')
export class PromosController {
  constructor(private service: PromosService) {}
  @Get() findAll(@CurrentUser() user: JwtUser, @Query() query: PromoQueryDto) {
    return this.service.findAll(user.sub, query);
  }
  @Post() create(@CurrentUser() user: JwtUser, @Body() dto: CreatePromoDto) {
    return this.service.create(user.sub, dto);
  }
  @Post('upload-image')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Image file is required');
    const imageUrl = await this.service.uploadPromoImage(file);
    return { imageUrl };
  }
  @Get(':id') findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }
  @Patch(':id') update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdatePromoDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}
