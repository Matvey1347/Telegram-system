import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApplicationLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(args: Prisma.ApplicationLogFindManyArgs) {
    return this.prisma.applicationLog.findMany(args);
  }

  findFirst(args: Prisma.ApplicationLogFindFirstArgs) {
    return this.prisma.applicationLog.findFirst(args);
  }

  async createClientLog(data: Prisma.ApplicationLogUncheckedCreateInput) {
    return this.prisma.applicationLog.create({ data });
  }

  deleteMany(args: Prisma.ApplicationLogDeleteManyArgs) {
    return this.prisma.applicationLog.deleteMany(args);
  }
}
