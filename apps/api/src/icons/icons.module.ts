import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { IconsController } from './icons.controller';
import { IconsService } from './icons.service';

@Module({
  imports: [CommonModule],
  controllers: [IconsController],
  providers: [IconsService],
})
export class IconsModule {}
