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
  getLatestFeatures(@Param('id') id: string) {
    return this.branchService.getLatestFeatures(id);
  }

  @Get(':id/export/geojson')
  @Header('Content-Type', 'application/geo+json')
  async exportGeoJson(
    @Param('id') branchId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    // Get branch details to validate access
    const branch = await this.branchService.findOne(branchId, user);

    // Get all latest features from the branch
    const features = await this.branchService.getLatestFeatures(branchId);

    // Convert to GeoJSON format
    const geojson = this.geoJsonService.exportToGeoJson(features);

    // Set download headers
    const filename = `${branch.name.replace(/[^a-z0-9]/gi, '_')}_export.geojson`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send GeoJSON with pretty formatting
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

    const features = await this.branchService.getLatestFeatures(branchId);

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

    const tile = await this.mvtService.generateBranchTile(
      branchId,
      parseInt(z),
      parseInt(x),
      parseInt(y),
    );

    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Don't set Content-Encoding as we're not compressing the tiles
    // The raw MVT protobuf data is sent as-is

    return res.send(tile);
  }

  @Get(':id/bounds')
  async getBounds(@Param('id') branchId: string, @CurrentUser() user: User) {
    await this.branchService.findOne(branchId, user);

    const bounds = await this.mvtService.getBranchBounds(branchId);

    return { bounds };
  }
}
