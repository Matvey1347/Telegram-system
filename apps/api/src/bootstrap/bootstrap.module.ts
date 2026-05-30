import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminBootstrapService } from './admin-bootstrap.service';

@Module({
  imports: [PrismaModule],
  providers: [AdminBootstrapService],
})
export class BootstrapModule {}
