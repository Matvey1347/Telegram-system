import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';

const dec=(v:unknown)=>Number(v??0);
@Injectable()
export class DashboardService {
constructor(private prisma: PrismaService, private workspaceService: WorkspaceService) {}
async summary(userId: string) {
const workspaceId=await this.workspaceService.resolveWorkspaceIdForUser(userId);
const [accounts, tx, campaigns, channels, investorRows, investorsCount]=await Promise.all([
this.prisma.account.findMany({where:{workspaceId,isActive:true}}),
this.prisma.transaction.findMany({where:{workspaceId}}),
this.prisma.adCampaign.findMany({where:{workspaceId}}),
this.prisma.telegramChannel.count({where:{workspaceId}}),
this.prisma.investment.groupBy({by:['investorId'],where:{workspaceId},_sum:{amountInPrimaryCurrency:true}}),
this.prisma.investor.count({where:{workspaceId}}),
]);
const income=tx.filter(t=>t.type==='income').reduce((a,t)=>a+dec(t.amountInPrimaryCurrency),0);
const expenses=tx.filter(t=>t.type==='expense').reduce((a,t)=>a+dec(t.amountInPrimaryCurrency),0);
const adSpend=campaigns.reduce((a,c)=>a+dec(c.priceInPrimaryCurrency),0);
const totalJoined=campaigns.reduce((a,c)=>a+(c.joinedCount??0),0);
const cpas=campaigns.map(c=>dec(c.cpa)).filter((x)=>x>0);
const totalInvestedPrimary=investorRows.reduce((acc,row)=>acc+dec(row._sum.amountInPrimaryCurrency),0);
const topInvestorRow=[...investorRows].sort((a,b)=>dec(b._sum.amountInPrimaryCurrency)-dec(a._sum.amountInPrimaryCurrency))[0];
const topInvestor=topInvestorRow ? await this.prisma.investor.findFirst({where:{id:topInvestorRow.investorId,workspaceId}}) : null;
return {totalBalancePrimary: income-expenses,totalBalanceSecondary:0,incomeForPeriod:income,expensesForPeriod:expenses,profitForPeriod:income-expenses,adSpendForPeriod:adSpend,totalJoinedFromAds:totalJoined,averageCPA:cpas.length?cpas.reduce((a,b)=>a+b,0)/cpas.length:null,accountsSummary:accounts,campaignsCount:campaigns.length,telegramChannelsCount:channels,bestCampaigns:[...campaigns].sort((a,b)=>dec(a.cpa)-dec(b.cpa)).slice(0,5),worstCampaigns:[...campaigns].sort((a,b)=>dec(b.cpa)-dec(a.cpa)).slice(0,5),totalInvestedPrimary,investorsCount,topInvestor:topInvestorRow&&topInvestor?{id:topInvestor.id,name:topInvestor.name,totalInvestedPrimary:dec(topInvestorRow._sum.amountInPrimaryCurrency),ownershipPercent:totalInvestedPrimary>0?(dec(topInvestorRow._sum.amountInPrimaryCurrency)/totalInvestedPrimary)*100:0}:null};
}
}
