import { Global, Module } from '@nestjs/common';
import { StreamResponseService } from './stream-response.service';

@Global()
@Module({
  providers: [StreamResponseService],
  exports: [StreamResponseService],
})
export class StreamModule {}
