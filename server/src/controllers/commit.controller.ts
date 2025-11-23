import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommitService } from '../services/commit.service';
import { GeoJsonService } from '../services/geojson.service';
import { ShapefileService } from '../services/shapefile.service';
import { CreateCommitDto } from '../dto/commit.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { User } from '../entities';
import { CurrentUser } from 'src/decorators/user.decorator';

@Controller('commits')
@UseGuards(JwtAuthGuard)
export class CommitController {
  constructor(
    private readonly commitService: CommitService,
    private readonly geoJsonService: GeoJsonService,
    private readonly shapefileService: ShapefileService,
  ) {}

  @Post()
  create(@Body() createCommitDto: CreateCommitDto, @CurrentUser() user: User) {
    return this.commitService.create(createCommitDto, user);
  }

  @Post('import/geojson')
  @UseInterceptors(FileInterceptor('file'))
  async importGeoJson(
    @UploadedFile() file: Express.Multer.File,
    @Body('branchId') branchId: string,
    @Body('message') message: string,
    @CurrentUser() user: User,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!branchId) {
      throw new BadRequestException('Branch ID is required');
    }

    try {
      const fileContent = file.buffer.toString('utf-8');
      const geojsonContent = JSON.parse(fileContent);

      this.geoJsonService.validateGeoJson(geojsonContent);

      const features = this.geoJsonService.parseGeoJson(geojsonContent);

      const commit = await this.commitService.create(
        {
          branchId,
          message: message || `Import GeoJSON: ${file.originalname}`,
          features,
        },
        user,
      );

      return {
        success: true,
        message: `Successfully imported ${features.length} feature(s) from ${file.originalname}`,
        commit,
        featuresImported: features.length,
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new BadRequestException('Invalid JSON format in uploaded file');
      }
      throw error;
    }
  }

  @Post('parse/shapefile')
  @UseInterceptors(FileInterceptor('file'))
  async parseShapefile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const features = await this.shapefileService.parseShapefile(file.buffer);

    return {
      success: true,
      message: `Successfully parsed ${features.length} feature(s) from ${file.originalname}`,
      features,
      featuresCount: features.length,
    };
  }

  @Get()
  findAll(@Query('branchId') branchId: string) {
    return this.commitService.findAll(branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commitService.findOne(id);
  }

  @Get('branch/:branchId/history')
  getBranchHistory(@Param('branchId') branchId: string) {
    return this.commitService.getBranchHistory(branchId);
  }

  @Get('feature-history/:branchId/:featureId')
  getFeatureHistory(
    @Param('branchId') branchId: string,
    @Param('featureId') featureId: string,
  ) {
    return this.commitService.getFeatureHistory(branchId, featureId);
  }

  @Get(':id/changes')
  getCommitChanges(@Param('id') id: string) {
    return this.commitService.getCommitChanges(id);
  }

  @Get('compare/:sourceBranchId/:targetBranchId')
  compareBranches(
    @Param('sourceBranchId') sourceBranchId: string,
    @Param('targetBranchId') targetBranchId: string,
  ) {
    return this.commitService.compareBranches(sourceBranchId, targetBranchId);
  }
}
