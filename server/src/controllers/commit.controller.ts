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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
      },
    }),
  )
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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
      },
    }),
  )
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
  async findAll(
    @Query('branchId') branchId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 20;

    const { commits, total } = await this.commitService.findAll(
      branchId,
      pageNum,
      limitNum,
    );

    return {
      data: commits,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPreviousPage: pageNum > 1,
      },
    };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commitService.findOne(id);
  }

  @Get('branch/:branchId/history')
  async getBranchHistory(
    @Param('branchId') branchId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 50;

    const { commits, total } = await this.commitService.getBranchHistory(
      branchId,
      pageNum,
      limitNum,
    );

    return {
      data: commits,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPreviousPage: pageNum > 1,
      },
    };
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
