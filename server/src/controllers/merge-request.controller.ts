import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { MergeRequestService } from '../services/merge-request.service';
import {
  CreateMergeRequestDto,
  ReviewMergeRequestDto,
  ResolveMergeConflictsDto,
} from '../dto/merge-request.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { User } from '../entities';
import { CurrentUser } from 'src/decorators/user.decorator';

@Controller('merge-requests')
@UseGuards(JwtAuthGuard)
export class MergeRequestController {
  constructor(private readonly mergeRequestService: MergeRequestService) {}

  @Post()
  create(
    @Body() createMergeRequestDto: CreateMergeRequestDto,
    @CurrentUser() user: User,
  ) {
    return this.mergeRequestService.create(createMergeRequestDto, user);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.mergeRequestService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.mergeRequestService.findOne(id, user);
  }

  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body() reviewDto: ReviewMergeRequestDto,
    @CurrentUser() user: User,
  ) {
    return this.mergeRequestService.review(id, reviewDto, user);
  }

  @Post('resolve-conflicts')
  resolveConflicts(
    @Body() resolveDto: ResolveMergeConflictsDto,
    @CurrentUser() user: User,
  ) {
    return this.mergeRequestService.resolveConflicts(resolveDto, user);
  }

  @Get(':id/conflicts')
  getConflicts(@Param('id') id: string, @CurrentUser() user: User) {
    return this.mergeRequestService.getConflicts(id, user);
  }
}
