import { Module } from '@nestjs/common';
import { AdvertisingSourcesController } from './advertising-sources.controller';
import { AdvertisingSourcesService } from './advertising-sources.service';

@Module({
  controllers: [AdvertisingSourcesController],
  providers: [AdvertisingSourcesService],
})
export class AdvertisingSourcesModule {}
