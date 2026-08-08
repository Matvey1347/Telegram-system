import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  AttachPlacementManagedPostDto,
  TelegramAdAlertsQueryDto,
  TelegramAdAnalyticsQueryDto,
  TelegramAdAnalyticsSeriesQueryDto,
  TelegramAdInventoryDetailsQueryDto,
  TelegramAdInventoryRebuildDto,
  TelegramAdNetworkAnalyticsQueryDto,
  TelegramAdPriceFillCorrelationQueryDto,
  TelegramAdRevenueScenarioDto,
  CancelPlacementDto,
  CompletePermanentPlacementDto,
  CreateTelegramAdProductDto,
  CreateTelegramAdQuoteDto,
  CreateTelegramAdvertiserActivityDto,
  CreateTelegramAdvertiserContactDto,
  CreateTelegramAdvertiserDto,
  CreateTelegramAdSaleDto,
  CreateTelegramAdSalePlacementDto,
  CreateTelegramAdSalePaymentDto,
  CreateTelegramAdvertiserTaskDto,
  CreatePlacementManagedPostDto,
  RecommendTelegramAdPolicyDto,
  PublishPlacementDto,
  ReserveTelegramAdSaleDto,
  ReschedulePlacementDto,
  RetryPlacementDeletionDto,
  SchedulePlacementDto,
  ScheduleSaleDto,
  TelegramAdAvailabilityQueryDto,
  TelegramAdPriceHistoryQueryDto,
  TelegramAdProductsQueryDto,
  TelegramAdSalesBulkCreateDto,
  TelegramAdSalesQueryDto,
  TelegramAdvertiserActivitiesQueryDto,
  TelegramAdvertiserSearchDto,
  TelegramAdvertiserTasksQueryDto,
  TelegramAdvertisersQueryDto,
  TelegramAdCrmMemberSettingsDto,
  TelegramAdCrmWorkspaceSettingsDto,
  CompleteTelegramAdvertiserTaskDto,
  SkipTelegramAdvertiserTaskDto,
  UpdateTelegramAdChannelPricingDto,
  UpdateTelegramAdSalesMemberPreferencesDto,
  UpdateTelegramAdSalesWorkspaceSettingsDto,
  UpdateTelegramAdSalePaymentDto,
  UpdateTelegramAdvertiserContactDto,
  UpdateTelegramAdvertiserDto,
  UpdateTelegramAdvertiserTaskDto,
  UpdateTelegramAdPolicyDto,
  UpdateTelegramAdProductDto,
  UpdateTelegramAdSaleDto,
  UpdateTelegramAdSalePlacementDto,
  VoidTelegramAdSalePaymentDto,
} from './dto';
import { TelegramAdSalesBulkService } from './telegram-ad-sales-bulk.service';
import { TelegramAdSalesCrmAdvertisersService } from './telegram-ad-sales-crm-advertisers.service';
import { TelegramAdSalesCrmSettingsService } from './telegram-ad-sales-crm-settings.service';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-ad-sales')
export class TelegramAdSalesController {
  constructor(
    private readonly service: TelegramAdSalesService,
    private readonly bulkService: TelegramAdSalesBulkService,
    private readonly crmAdvertisersService: TelegramAdSalesCrmAdvertisersService,
    private readonly crmSettingsService: TelegramAdSalesCrmSettingsService,
  ) {}

  @Get('settings/workspace')
  getWorkspaceSettings(@CurrentUser() user: JwtUser) {
    return this.service.getAdSalesWorkspaceSettings(user.sub);
  }

  @Put('settings/workspace')
  updateWorkspaceSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateTelegramAdSalesWorkspaceSettingsDto,
  ) {
    return this.service.updateAdSalesWorkspaceSettings(user.sub, dto);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: JwtUser) {
    return this.service.getAdSalesMemberPreferences(user.sub);
  }

  @Put('preferences')
  updatePreferences(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateTelegramAdSalesMemberPreferencesDto,
  ) {
    return this.service.updateAdSalesMemberPreferences(user.sub, dto);
  }

  @Get('products')
  listProducts(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdProductsQueryDto,
  ) {
    return this.service.listProducts(user.sub, query);
  }

  @Get('channels/:channelId/products')
  listChannelProducts(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
  ) {
    return this.service.listChannelProducts(user.sub, channelId);
  }

  @Post('channels/:channelId/products')
  createProduct(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreateTelegramAdProductDto,
  ) {
    return this.service.createProduct(user.sub, channelId, dto);
  }

  @Patch('products/:id')
  updateProduct(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramAdProductDto,
  ) {
    return this.service.updateProduct(user.sub, id, dto);
  }

  @Delete('products/:id')
  deactivateProduct(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deactivateProduct(user.sub, id);
  }

  @Get('channels/:channelId/policy')
  getPolicy(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
  ) {
    return this.service.getPolicy(user.sub, channelId);
  }

  @Get('channels/:channelId/baseline')
  getChannelBaseline(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
  ) {
    return this.service.getChannelBaseline(user.sub, channelId);
  }

  @Put('channels/:channelId/pricing')
  updateChannelPricing(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateTelegramAdChannelPricingDto,
  ) {
    return this.service.updateChannelPricing(user.sub, channelId, dto);
  }

  @Put('channels/:channelId/policy')
  upsertPolicy(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateTelegramAdPolicyDto,
  ) {
    return this.service.upsertPolicy(user.sub, channelId, dto);
  }

  @Post('channels/:channelId/policy/recommend')
  recommendPolicy(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: RecommendTelegramAdPolicyDto,
  ) {
    return this.service.recommendPolicy(user.sub, channelId, dto);
  }

  @Post('quotes')
  createQuote(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramAdQuoteDto,
  ) {
    return this.service.createQuote(user.sub, dto);
  }

  @Get('channels/:channelId/price-history')
  priceHistory(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Query() query: TelegramAdPriceHistoryQueryDto,
  ) {
    return this.service.priceHistory(user.sub, channelId, query);
  }

  @Post('availability')
  availability(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdAvailabilityQueryDto,
  ) {
    return this.service.availability(user.sub, dto);
  }

  @Post('bulk')
  bulkCreate(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdSalesBulkCreateDto,
  ) {
    return this.bulkService.create(user.sub, dto);
  }

  @Get('analytics/summary')
  analyticsSummary(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAnalyticsQueryDto,
  ) {
    return this.service.analyticsSummary(user.sub, query);
  }

  @Get('analytics/overview')
  analyticsOverview(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    return this.service.analyticsOverview(user.sub, query);
  }

  @Get('analytics/channels/:channelId')
  channelAnalytics(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Query() query: TelegramAdAnalyticsQueryDto,
  ) {
    return this.service.channelAnalytics(user.sub, channelId, query);
  }

  @Get('analytics/networks/:networkId')
  networkAnalytics(
    @CurrentUser() user: JwtUser,
    @Param('networkId') networkId: string,
    @Query() query: TelegramAdNetworkAnalyticsQueryDto,
  ) {
    return this.service.networkAnalytics(user.sub, networkId, query);
  }

  @Get('analytics/revenue-series')
  revenueSeries(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    return this.service.revenueSeries(user.sub, query);
  }

  @Get('analytics/pricing-series')
  pricingSeries(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    return this.service.pricingSeries(user.sub, query);
  }

  @Get('analytics/inventory')
  inventory(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    return this.service.inventoryAnalytics(user.sub, query);
  }

  @Get('analytics/alerts')
  alerts(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAlertsQueryDto,
  ) {
    return this.service.analyticsAlerts(user.sub, query);
  }

  @Post('analytics/inventory/rebuild')
  rebuildInventory(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdInventoryRebuildDto,
  ) {
    return this.service.rebuildInventorySnapshots(user.sub, dto);
  }

  @Get('analytics/price-fill-correlation')
  priceFillCorrelation(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdPriceFillCorrelationQueryDto,
  ) {
    return this.service.priceFillCorrelation(user.sub, query);
  }

  @Post('analytics/revenue-scenario')
  revenueScenario(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdRevenueScenarioDto,
  ) {
    return this.service.revenueScenario(user.sub, dto);
  }

  @Get('analytics/inventory/details')
  inventoryDetails(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdInventoryDetailsQueryDto,
  ) {
    return this.service.inventoryDetails(user.sub, query);
  }

  @Get('advertisers')
  listAdvertisers(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdvertisersQueryDto,
  ) {
    return this.service.listAdvertisers(user.sub, query);
  }

  @Get('advertisers/search')
  advertiserSearch(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdvertiserSearchDto,
  ) {
    return this.service.advertiserSearch(user.sub, query);
  }

  @Get('advertisers/:id')
  getAdvertiser(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.getAdvertiserDetails(user.sub, id);
  }

  @Post('advertisers')
  createAdvertiser(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramAdvertiserDto,
  ) {
    return this.service.createAdvertiser(user.sub, dto);
  }

  @Patch('advertisers/:id')
  updateAdvertiser(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramAdvertiserDto,
  ) {
    return this.service.updateAdvertiser(user.sub, id, dto);
  }

  @Post('advertisers/:id/archive')
  archiveAdvertiser(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.archiveAdvertiser(user.sub, id);
  }

  @Post('advertisers/:id/restore')
  restoreAdvertiser(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.restoreAdvertiser(user.sub, id);
  }

  @Post('advertisers/:id/contacts')
  addAdvertiserContact(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramAdvertiserContactDto,
  ) {
    return this.service.addAdvertiserContact(user.sub, id, dto);
  }

  @Patch('advertisers/:id/contacts/:contactId')
  updateAdvertiserContact(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateTelegramAdvertiserContactDto,
  ) {
    return this.service.updateAdvertiserContact(user.sub, id, contactId, dto);
  }

  @Delete('advertisers/:id/contacts/:contactId')
  deleteAdvertiserContact(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.service.deleteAdvertiserContact(user.sub, id, contactId);
  }

  @Post('advertisers/:id/contacts/:contactId/set-primary')
  setPrimaryAdvertiserContact(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.service.setPrimaryAdvertiserContact(user.sub, id, contactId);
  }

  @Get('advertisers/:id/activities')
  listAdvertiserActivities(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: TelegramAdvertiserActivitiesQueryDto,
  ) {
    return this.service.listAdvertiserActivities(user.sub, id, query);
  }

  @Post('advertisers/:id/activities')
  createAdvertiserActivity(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramAdvertiserActivityDto,
  ) {
    return this.service.createAdvertiserActivityEntry(user.sub, id, dto);
  }

  @Post('advertisers/:id/notes')
  createAdvertiserNote(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramAdvertiserActivityDto,
  ) {
    return this.service.createAdvertiserNote(user.sub, id, dto);
  }

  @Get('crm/tasks')
  listCrmTasks(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdvertiserTasksQueryDto,
  ) {
    return this.service.listCrmTasks(user.sub, query);
  }

  @Get('crm/advertisers')
  listCrmAdvertisers(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdvertisersQueryDto,
  ) {
    return this.crmAdvertisersService.listCrmAdvertisers(user.sub, query);
  }

  @Post('advertisers/:id/tasks')
  createAdvertiserTask(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramAdvertiserTaskDto,
  ) {
    return this.service.createAdvertiserTask(user.sub, id, dto);
  }

  @Patch('crm/tasks/:taskId')
  updateCrmTask(
    @CurrentUser() user: JwtUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTelegramAdvertiserTaskDto,
  ) {
    return this.service.updateCrmTask(user.sub, taskId, dto);
  }

  @Post('crm/tasks/:taskId/complete')
  completeCrmTask(
    @CurrentUser() user: JwtUser,
    @Param('taskId') taskId: string,
    @Body() dto: CompleteTelegramAdvertiserTaskDto,
  ) {
    return this.service.completeCrmTask(user.sub, taskId, dto);
  }

  @Post('crm/tasks/:taskId/snooze')
  snoozeCrmTask(
    @CurrentUser() user: JwtUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTelegramAdvertiserTaskDto,
  ) {
    return this.service.snoozeCrmTask(user.sub, taskId, dto);
  }

  @Post('crm/tasks/:taskId/skip')
  skipCrmTask(
    @CurrentUser() user: JwtUser,
    @Param('taskId') taskId: string,
    @Body() dto: SkipTelegramAdvertiserTaskDto,
  ) {
    return this.service.skipCrmTask(user.sub, taskId, dto);
  }

  @Get('crm/settings/workspace')
  getCrmWorkspaceSettings(@CurrentUser() user: JwtUser) {
    return this.crmSettingsService.getCrmWorkspaceSettings(user.sub);
  }

  @Put('crm/settings/workspace')
  updateCrmWorkspaceSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdCrmWorkspaceSettingsDto,
  ) {
    return this.crmSettingsService.updateCrmWorkspaceSettings(user.sub, dto);
  }

  @Get('crm/settings/member')
  getCrmMemberSettings(@CurrentUser() user: JwtUser) {
    return this.crmSettingsService.getCrmMemberSettings(user.sub);
  }

  @Put('crm/settings/member')
  updateCrmMemberSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdCrmMemberSettingsDto,
  ) {
    return this.crmSettingsService.updateCrmMemberSettings(user.sub, dto);
  }

  @Get()
  listSales(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdSalesQueryDto,
  ) {
    return this.service.listSales(user.sub, query);
  }

  @Get(':id')
  getSale(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.getSale(user.sub, id);
  }

  @Post()
  createSale(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramAdSaleDto,
  ) {
    return this.service.createSale(user.sub, dto);
  }

  @Patch(':id')
  updateSale(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramAdSaleDto,
  ) {
    return this.service.updateSale(user.sub, id, dto);
  }

  @Post(':id/placements')
  addPlacement(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramAdSalePlacementDto,
  ) {
    return this.service.addPlacement(user.sub, id, dto);
  }

  @Patch(':saleId/placements/:placementId')
  updatePlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: UpdateTelegramAdSalePlacementDto,
  ) {
    return this.service.updatePlacement(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/payments')
  createPayment(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Body() dto: CreateTelegramAdSalePaymentDto,
  ) {
    return this.service.createPayment(user.sub, saleId, dto);
  }

  @Get(':saleId/payments')
  listPayments(@CurrentUser() user: JwtUser, @Param('saleId') saleId: string) {
    return this.service.listPayments(user.sub, saleId);
  }

  @Patch(':saleId/payments/:paymentId')
  updatePayment(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateTelegramAdSalePaymentDto,
  ) {
    return this.service.updatePayment(user.sub, saleId, paymentId, dto);
  }

  @Post(':saleId/payments/:paymentId/void')
  voidPayment(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: VoidTelegramAdSalePaymentDto,
  ) {
    return this.service.voidPayment(user.sub, saleId, paymentId, dto);
  }

  @Post(':id/reserve')
  reserve(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ReserveTelegramAdSaleDto,
  ) {
    return this.service.reserveSale(user.sub, id, dto);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.confirmSale(user.sub, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.cancelSale(user.sub, id);
  }

  @Post(':saleId/placements/:placementId/managed-post')
  createManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: CreatePlacementManagedPostDto,
  ) {
    return this.service.createManagedPostFromPlacement(
      user.sub,
      saleId,
      placementId,
      dto,
    );
  }

  @Post(':saleId/placements/:placementId/attach-managed-post')
  attachManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: AttachPlacementManagedPostDto,
  ) {
    return this.service.attachManagedPost(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/placements/:placementId/detach-managed-post')
  detachManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
  ) {
    return this.service.detachManagedPost(user.sub, saleId, placementId);
  }

  @Post(':saleId/placements/:placementId/schedule')
  schedulePlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: SchedulePlacementDto,
  ) {
    return this.service.schedulePlacement(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/schedule')
  scheduleSale(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Body() dto: ScheduleSaleDto,
  ) {
    return this.service.scheduleSale(user.sub, saleId, dto);
  }

  @Post(':saleId/placements/:placementId/publish')
  publishPlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: PublishPlacementDto,
  ) {
    return this.service.publishPlacement(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/placements/:placementId/reschedule')
  reschedulePlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: ReschedulePlacementDto,
  ) {
    return this.service.reschedulePlacement(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/placements/:placementId/cancel')
  cancelPlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: CancelPlacementDto,
  ) {
    return this.service.cancelPlacement(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/placements/:placementId/complete-permanent')
  completePermanentPlacement(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: CompletePermanentPlacementDto,
  ) {
    return this.service.completePermanentPlacement(
      user.sub,
      saleId,
      placementId,
      dto,
    );
  }

  @Post(':saleId/placements/:placementId/retry-deletion')
  retryDeletion(
    @CurrentUser() user: JwtUser,
    @Param('saleId') saleId: string,
    @Param('placementId') placementId: string,
    @Body() dto: RetryPlacementDeletionDto,
  ) {
    return this.service.retryDeletion(user.sub, saleId, placementId, dto);
  }

  @Post(':saleId/reconcile')
  reconcileSale(@CurrentUser() user: JwtUser, @Param('saleId') saleId: string) {
    return this.service.reconcileSale(user.sub, saleId);
  }

  @Get(':saleId/metrics')
  saleMetrics(@CurrentUser() user: JwtUser, @Param('saleId') saleId: string) {
    return this.service.saleMetrics(user.sub, saleId);
  }
}
