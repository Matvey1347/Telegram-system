import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreatePromoDto, UpdatePromoDto } from './dto';

@Injectable()
export class PromosService {
constructor(private prisma: PrismaService, private workspaceService: WorkspaceService) {}
private async workspace(userId:string){return this.workspaceService.resolveWorkspaceIdForUser(userId)}
async findAll(userId:string){const workspaceId=await this.workspace(userId);return this.prisma.promo.findMany({where:{workspaceId},include:{telegramChannel:true},orderBy:{createdAt:'desc'}})}
async findOne(userId:string,id:string){const workspaceId=await this.workspace(userId);const row=await this.prisma.promo.findFirst({where:{id,workspaceId}});if(!row) throw new NotFoundException('Promo not found'); return row;}
async create(userId:string,dto:CreatePromoDto){const workspaceId=await this.workspace(userId);return this.prisma.promo.create({data:{workspaceId,...dto}})}
async update(userId:string,id:string,dto:UpdatePromoDto){await this.findOne(userId,id);return this.prisma.promo.update({where:{id},data:dto})}
async remove(userId:string,id:string){await this.findOne(userId,id);return this.prisma.promo.delete({where:{id}})}
}
