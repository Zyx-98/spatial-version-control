import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateDatasetDto, UpdateDatasetDto } from 'src/dto/dataset.dto';
import { Branch, Dataset, User, UserRole } from 'src/entities';
import { Repository } from 'typeorm';

@Injectable()
export class DatasetService {
  constructor(
    @InjectRepository(Dataset)
    private datasetRepository: Repository<Dataset>,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
  ) {}

  async create(
    createDatasetDto: CreateDatasetDto,
    user: User,
  ): Promise<Dataset> {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Only admins can create datasets');
    }

    const dataset = this.datasetRepository.create({
      ...createDatasetDto,
      departmentId: user.departmentId,
    });

    const savedDataset = await this.datasetRepository.save(dataset);

    const mainBranch = this.branchRepository.create({
      name: 'main',
      isMain: true,
      datasetId: savedDataset.id,
      createdById: user.id,
    });

    await this.branchRepository.save(mainBranch);

    return savedDataset;
  }

  async findAll(user: User): Promise<Dataset[]> {
    return await this.datasetRepository.find({
      where: { departmentId: user.departmentId },
      relations: ['branches'],
    });
  }

  async findOne(id: string, user: User): Promise<Dataset> {
    const dataset = await this.datasetRepository.findOne({
      where: {
        id,
      },
      relations: ['branches', 'department'],
    });

    if (!dataset) {
      throw new NotFoundException('Dataset not found');
    }

    if (dataset.departmentId !== user.departmentId) {
      throw new NotFoundException('Access denied to this dataset');
    }

    return dataset;
  }

  async update(
    id: string,
    updateDatasetDto: UpdateDatasetDto,
    user: User,
  ): Promise<Dataset> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can update datasets');
    }

    const dataset = await this.findOne(id, user);

    Object.assign(dataset, updateDatasetDto);

    return await this.datasetRepository.save(dataset);
  }

  async remove(id: string, user: User): Promise<void> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can delete datasets');
    }

    const dataset = await this.findOne(id, user);

    await this.datasetRepository.remove(dataset);
  }
}
