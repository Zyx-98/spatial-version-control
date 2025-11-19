import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BranchService } from '../services/branch.service';
import { CreateBranchDto, ResolveBranchConflictsDto } from '../dto/branch.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { User } from '../entities';
import { CurrentUser } from 'src/decorators/user.decorator';

@Controller('branches')
@UseGuards(JwtAuthGuard)
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

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
}
