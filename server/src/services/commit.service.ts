import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Branch,
  Commit,
  FeatureOperation,
  SpatialFeature,
  User,
} from 'src/entities';
import { Repository } from 'typeorm';
import { BranchService } from './branch.service';
import { CreateCommitDto } from 'src/dto/commit.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CommitService {
  constructor(
    @InjectRepository(Commit)
    private commitRepository: Repository<Commit>,
    @InjectRepository(SpatialFeature)
    private spatialFeatureRepository: Repository<SpatialFeature>,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    private branchService: BranchService,
  ) {}

  async create(createCommitDto: CreateCommitDto, user: User): Promise<Commit> {
    const { message, branchId, features } = createCommitDto;

    const branch = await this.branchService.findOne(branchId, user);

    if (!this.branchService.canEditBranch(branch, user)) {
      throw new ForbiddenException(
        'You do not have permission to edit this branch',
      );
    }

    const commit = this.commitRepository.create({
      message,
      branchId,
      authorId: user.id,
      parentCommitId: branch.headCommitId,
    });

    const savedCommit = await this.commitRepository.save(commit);

    const spatialFeatures = features.map((featureDto) => {
      const feature = this.spatialFeatureRepository.create({
        featureId: featureDto.featureId || uuidv4(),
        geometryType: featureDto.geometryType,
        geometry: featureDto.geometry,
        properties: featureDto.properties,
        operation: featureDto.operation,
        commitId: savedCommit.id,
      });

      if (featureDto.geometry) {
        feature.geom = featureDto.geometry;
      }
      return feature;
    });

    await this.spatialFeatureRepository.save(spatialFeatures);

    await this.branchRepository.update(branch.id, {
      headCommitId: savedCommit.id,
    });

    return savedCommit;
  }

  findAll(branchId: string): Promise<Commit[]> {
    return this.commitRepository.find({
      where: { branchId },
      relations: {
        features: true,
        author: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Commit> {
    const commit = await this.commitRepository.findOne({
      where: { id },
      relations: {
        features: true,
        author: true,
        branch: true,
      },
    });

    if (!commit) {
      throw new NotFoundException('Commit not found');
    }

    return commit;
  }

  async getBranchHistory(branchId: string): Promise<Commit[]> {
    const commits = await this.findAll(branchId);

    return commits;
  }

  async getFeatureHistory(branchId: string, featureId: string) {
    const commits = await this.commitRepository.find({
      where: { branchId },
      relations: { features: true },
      order: { createdAt: 'ASC' },
    });

    const featureHistory: SpatialFeature[] = [];

    for (const commit of commits) {
      const feature = commit.features.find((f) => f.featureId === featureId);
      if (feature) {
        featureHistory.push(feature);
      }
    }

    return featureHistory;
  }

  async getCommitChanges(commitId: string) {
    const commit = await this.findOne(commitId);

    const changes = {
      created: commit.features.filter(
        (f) => f.operation === FeatureOperation.CREATE,
      ),
      updated: commit.features.filter(
        (f) => f.operation === FeatureOperation.UPDATE,
      ),
      deleted: commit.features.filter(
        (f) => f.operation === FeatureOperation.DELETE,
      ),
      total: commit.features.length,
    };

    return {
      commit: {
        id: commit.id,
        message: commit.message,
        author: commit.author,
        createdAt: commit.createdAt,
      },
      changes,
    };
  }

  async compareBranches(sourceBranchId: string, targetBranchId: string) {
    const sourceFeatures =
      await this.branchService.getLatestFeatures(sourceBranchId);
    const targetFeatures =
      await this.branchService.getLatestFeatures(targetBranchId);

    const sourceMap = new Map(sourceFeatures.map((f) => [f.featureId, f]));
    const targetMap = new Map(targetFeatures.map((f) => [f.featureId, f]));

    const comparison = {
      added: [] as SpatialFeature[],
      modified: [] as { source: SpatialFeature; target: SpatialFeature }[],
      deleted: [] as SpatialFeature[],
      unchanged: [] as SpatialFeature[],
    };

    for (const [featureId, sourceFeature] of sourceMap) {
      const targetFeature = targetMap.get(featureId);

      if (!targetFeature) {
        comparison.added.push(sourceFeature);
      } else if (
        JSON.stringify(sourceFeature.geometry) !==
          JSON.stringify(targetFeature.geometry) ||
        JSON.stringify(sourceFeature.properties) !==
          JSON.stringify(targetFeature.properties)
      ) {
        comparison.modified.push({
          source: sourceFeature,
          target: targetFeature,
        });
      } else {
        comparison.unchanged.push(sourceFeature);
      }
    }

    for (const [featureId, targetFeature] of targetMap) {
      if (!sourceMap.has(featureId)) {
        comparison.deleted.push(targetFeature);
      }
    }

    return {
      sourceBranchId,
      targetBranchId,
      summary: {
        added: comparison.added.length,
        modified: comparison.modified.length,
        deleted: comparison.deleted.length,
        unchanged: comparison.unchanged.length,
      },
      changes: comparison,
    };
  }
}
