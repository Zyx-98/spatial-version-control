import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommitService } from '../services/commit.service';
import { CreateCommitDto } from '../dto/commit.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { User } from '../entities';
import { CurrentUser } from 'src/decorators/user.decorator';

@Controller('commits')
@UseGuards(JwtAuthGuard)
export class CommitController {
  constructor(private readonly commitService: CommitService) {}

  @Post()
  create(@Body() createCommitDto: CreateCommitDto, @CurrentUser() user: User) {
    return this.commitService.create(createCommitDto, user);
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
}
