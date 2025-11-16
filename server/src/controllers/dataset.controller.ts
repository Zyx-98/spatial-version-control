import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { DatasetService } from '../services/dataset.service';
import { CreateDatasetDto, UpdateDatasetDto } from '../dto/dataset.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { User } from '../entities';
import { CurrentUser } from 'src/decorators/user.decorator';

@Controller('datasets')
@UseGuards(JwtAuthGuard)
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  @Post()
  create(
    @Body() createDatasetDto: CreateDatasetDto,
    @CurrentUser() user: User,
  ) {
    return this.datasetService.create(createDatasetDto, user);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.datasetService.findAll(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.datasetService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDatasetDto: UpdateDatasetDto,
    @CurrentUser() user: User,
  ) {
    return this.datasetService.update(id, updateDatasetDto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.datasetService.remove(id, user);
  }
}
