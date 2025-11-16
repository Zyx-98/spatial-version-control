import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BranchConflictsDto,
  ConflictDetail,
  CreateBranchDto,
} from 'src/dto/branch.dto';
import {
  Branch,
  Commit,
  FeatureOperation,
  SpatialFeature,
  User,
  UserRole,
} from 'src/entities';
import { Repository } from 'typeorm';

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Commit)
    private commitRepository: Repository<Commit>,
    @InjectRepository(SpatialFeature)
    private spatialFeatureRepository: Repository<SpatialFeature>,
  ) {}

  async create(createBranchDto: CreateBranchDto, user: User): Promise<Branch> {
    const { name, datasetId } = createBranchDto;

    const mainBranch = await this.branchRepository.findOne({
      where: {
        datasetId,
        isMain: true,
      },
    });

    if (!mainBranch) {
      throw new NotFoundException('Main branch not found for the dataset');
    }

    const existingBranch = await this.branchRepository.findOne({
      where: { name, datasetId },
    });

    if (existingBranch) {
      throw new Error(
        'Branch with the same name already exists in the dataset',
      );
    }

    const branch = this.branchRepository.create({
      name,
      isMain: false,
      datasetId,
      createdById: user.id,
      headCommitId: mainBranch.headCommitId,
    });

    return await this.branchRepository.save(branch);
  }

  async findAll(datasetId: string, user: User): Promise<Branch[]> {
    return await this.branchRepository.find({
      where: {
        datasetId,
        dataset: {
          departmentId: user.departmentId,
        },
      },
      relations: {
        createdBy: true,
        commits: true,
      },
    });
  }

  async findOne(id: string, user: User): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: {
        id,
        dataset: {
          departmentId: user.departmentId,
        },
      },
      relations: {
        dataset: true,
        createdBy: true,
        commits: true,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  async fetchMainBranch(
    branchId: string,
    user: User,
  ): Promise<BranchConflictsDto> {
    const branch = await this.findOne(branchId, user);

    if (branch.isMain) {
      throw new BadRequestException('Branch is already the main branch');
    }

    const mainBranch = await this.branchRepository.findOne({
      where: {
        datasetId: branch.datasetId,
        isMain: true,
      },
    });

    if (!mainBranch) {
      throw new NotFoundException('Main branch not found for the dataset');
    }

    const conflicts = await this.detectConflicts(branch, mainBranch);

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }

  async detectConflicts(
    sourceBranch: Branch,
    targetBranch: Branch,
  ): Promise<ConflictDetail[]> {
    const conflicts: ConflictDetail[] = [];

    const sourceCommit = await this.commitRepository.findOne({
      where: { id: sourceBranch.headCommitId },
      relations: {
        features: true,
      },
    });

    const targetCommit = await this.commitRepository.findOne({
      where: { id: targetBranch.headCommitId },
      relations: {
        features: true,
      },
    });

    if (!sourceCommit || !targetCommit) {
      return conflicts;
    }

    const sourceFeatures = await this.getLatestFeatures(sourceBranch.id);
    const targetFeatures = await this.getLatestFeatures(targetBranch.id);

    const sourceFeatureMap = new Map(
      sourceFeatures.map((f) => [f.featureId, f]),
    );

    const targetFeatureMap = new Map(
      targetFeatures.map((f) => [f.featureId, f]),
    );

    for (const [featureId, sourceFeature] of sourceFeatureMap) {
      const targetFeature = targetFeatureMap.get(featureId);

      if (targetFeature) {
        if (
          JSON.stringify(sourceFeature.geometry) !==
          JSON.stringify(targetFeature.geometry)
        ) {
          conflicts.push({
            featureId,
            mainVersion: targetFeature,
            branchVersion: sourceFeature,
            conflictType: 'both_modified',
          });
        }
      }
    }

    return conflicts;
  }

  async getLatestFeatures(branchId: string): Promise<SpatialFeature[]> {
    const commits = await this.commitRepository.find({
      where: { branchId },
      order: { createdAt: 'DESC' },
      relations: { features: true },
    });

    const featureMap = new Map<string, SpatialFeature>();

    for (const commit of commits.reverse()) {
      for (const feature of commit.features) {
        if (feature.operation === FeatureOperation.DELETE) {
          featureMap.delete(feature.featureId);
        } else {
          featureMap.set(feature.featureId, feature);
        }
      }
    }

    return Array.from(featureMap.values());
  }

  canEditBranch(branch: Branch, user: User): boolean {
    if (branch.isMain) {
      return user.role === UserRole.ADMIN;
    }

    return branch.createdById === user.id;
  }
}
