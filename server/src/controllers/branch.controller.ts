import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { BranchService } from '../services/branch.service';
import { GeoJsonService } from '../services/geojson.service';
import { ShapefileService } from '../services/shapefile.service';
import { MvtService } from '../services/mvt.service';
import { TileCacheService } from '../services/tile-cache.service';
import { DiffService } from '../services/diff.service';
import { CreateBranchDto, ResolveBranchConflictsDto } from '../dto/branch.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { User } from '../entities';
import { CurrentUser } from 'src/decorators/user.decorator';

@Controller('branches')
@UseGuards(JwtAuthGuard)
export class BranchController {
  constructor(
    private readonly branchService: BranchService,
    private readonly geoJsonService: GeoJsonService,
    private readonly shapefileService: ShapefileService,
    private readonly mvtService: MvtService,
    private readonly tileCacheService: TileCacheService,
    private readonly diffService: DiffService,
  ) {}

  @Post()
  create(@Body() createBranchDto: CreateBranchDto, @CurrentUser() user: User) {
    return this.branchService.create(createBranchDto, user);
  }

  @Get()
  findAll(@Query('datasetId') datasetId: string, @CurrentUser() user: User) {
    return this.branchService.findAll(datasetId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.branchService.findOne(id, user);
  }

  @Get(':id/permissions')
  getBranchWithPermissions(@Param('id') id: string, @CurrentUser() user: User) {
    return this.branchService.getBranchWithPermissions(id, user);
  }

  @Post(':id/fetch')
  fetchMainBranch(@Param('id') id: string, @CurrentUser() user: User) {
    return this.branchService.fetchMainBranch(id, user);
  }

  @Post(':id/resolve-conflicts')
  resolveBranchConflicts(
    @Param('id') id: string,
    @Body() resolveDto: ResolveBranchConflictsDto,
    @CurrentUser() user: User,
  ) {
    resolveDto.branchId = id;
    return this.branchService.resolveBranchConflicts(resolveDto, user);
  }

  @Get(':id/features')
  async getLatestFeatures(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('bbox') bbox?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 1000) : undefined;

    const result = await this.branchService.getLatestFeatures(
      id,
      pageNum,
      limitNum,
      bbox,
    );

    if (pageNum && limitNum) {
      return {
        data: result.features,
        meta: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          totalPages: Math.ceil(result.total / limitNum),
          hasNextPage: pageNum < Math.ceil(result.total / limitNum),
          hasPreviousPage: pageNum > 1,
        },
      };
    }

    return result.features;
  }

  @Get(':id/export/geojson')
  @Header('Content-Type', 'application/geo+json')
  async exportGeoJson(
    @Param('id') branchId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const branch = await this.branchService.findOne(branchId, user);

    const { features } = await this.branchService.getLatestFeatures(branchId);

    const geojson = this.geoJsonService.exportToGeoJson(features);

    const filename = `${branch.name.replace(/[^a-z0-9]/gi, '_')}_export.geojson`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.send(JSON.stringify(geojson, null, 2));
  }

  @Get(':id/export/shapefile')
  @Header('Content-Type', 'application/zip')
  async exportShapefile(
    @Param('id') branchId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const branch = await this.branchService.findOne(branchId, user);

    const { features } = await this.branchService.getLatestFeatures(branchId);

    const filename = branch.name.replace(/[^a-z0-9]/gi, '_');
    const zipBuffer = await this.shapefileService.exportToShapefile(
      features,
      filename,
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}_export.zip"`,
    );

    return res.send(zipBuffer);
  }

  @Get(':id/tiles/:z/:x/:y.mvt')
  @Header('Content-Type', 'application/x-protobuf')
  async getTile(
    @Param('id') branchId: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    await this.branchService.findOne(branchId, user);

    const tile = await this.tileCacheService.getBranchTile(
      branchId,
      parseInt(z),
      parseInt(x),
      parseInt(y),
    );

    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.send(tile);
  }

  @Get(':id/bounds')
  async getBounds(@Param('id') branchId: string, @CurrentUser() user: User) {
    await this.branchService.findOne(branchId, user);

    const bounds = await this.mvtService.getBranchBounds(branchId);

    return { bounds };
  }

  @Get(':id/diff/:targetId/summary')
  async getDiffSummary(
    @Param('id') sourceBranchId: string,
    @Param('targetId') targetBranchId: string,
    @Query('bbox') bbox: string | undefined,
    @CurrentUser() user: User,
  ) {
    await Promise.all([
      this.branchService.findOne(sourceBranchId, user),
      this.branchService.findOne(targetBranchId, user),
    ]);

    return this.diffService.getDiffSummary(
      sourceBranchId,
      targetBranchId,
      bbox,
    );
  }

  @Get(':id/diff/:targetId/tiles/:z/:x/:y.mvt')
  @Header('Content-Type', 'application/x-protobuf')
  async getDiffTile(
    @Param('id') sourceBranchId: string,
    @Param('targetId') targetBranchId: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    await Promise.all([
      this.branchService.findOne(sourceBranchId, user),
      this.branchService.findOne(targetBranchId, user),
    ]);

    // Use cached tile service for better performance
    const tile = await this.tileCacheService.getDiffTile(
      sourceBranchId,
      targetBranchId,
      parseInt(z),
      parseInt(x),
      parseInt(y),
    );

    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(tile);
  }
}
