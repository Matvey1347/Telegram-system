import { Module } from '@nestjs/common';
import { AdHypothesesController } from './ad-hypotheses.controller';
import { AdHypothesesService } from './ad-hypotheses.service';

@Module({
  controllers: [AdHypothesesController],
  providers: [AdHypothesesService],
})
export class AdHypothesesModule {}
