import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateTelegramChannelDto, UpdateTelegramChannelDto } from './dto';

@Injectable()
export class TelegramChannelsService {
constructor(private prisma: PrismaService, private workspaceService: WorkspaceService) {}
async findAll(userId: string){const workspaceId=await this.workspaceService.resolveWorkspaceIdForUser(userId);return this.prisma.telegramChannel.findMany({where:{workspaceId},orderBy:{createdAt:'desc'}})}
async findOne(userId: string,id:string){const workspaceId=await this.workspaceService.resolveWorkspaceIdForUser(userId);const row=await this.prisma.telegramChannel.findFirst({where:{id,workspaceId}});if(!row) throw new NotFoundException('Telegram channel not found'); return row;}
async create(userId:string,dto:CreateTelegramChannelDto){const workspaceId=await this.workspaceService.resolveWorkspaceIdForUser(userId);return this.prisma.telegramChannel.create({data:{workspaceId,...dto}})}
async update(userId:string,id:string,dto:UpdateTelegramChannelDto){await this.findOne(userId,id);return this.prisma.telegramChannel.update({where:{id},data:dto})}
async remove(userId:string,id:string){await this.findOne(userId,id);return this.prisma.telegramChannel.update({where:{id},data:{isActive:false}})}
}
