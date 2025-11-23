import {
  ConflictException,
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
import { DataSource, Repository } from 'typeorm';
import { BranchService } from './branch.service';
import { CreateCommitDto } from 'src/dto/commit.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CommitService {
  constructor(
    @InjectRepository(Commit)
    private commitRepository: Repository<Commit>,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    private branchService: BranchService,
    private dataSource: DataSource,
  ) {}

  async create(createCommitDto: CreateCommitDto, user: User): Promise<Commit> {
    const { message, branchId, features } = createCommitDto;

    const branch = await this.branchService.findOne(branchId, user);

    if (!this.branchService.canEditBranch(branch, user)) {
      throw new ForbiddenException(
        'You do not have permission to edit this branch',
      );
    }

    if (branch.hasUnresolvedConflicts) {
      throw new ForbiddenException(
        'Cannot create commit. This branch has unresolved conflicts with main. Please resolve conflicts first.',
      );
    }

    if (!branch.isMain) {
      const mainBranch = await this.branchRepository.findOne({
        where: {
          datasetId: branch.datasetId,
          isMain: true,
        },
      });

      if (mainBranch) {
        const conflicts = await this.branchService.detectConflicts(
          branch,
          mainBranch,
        );

        if (conflicts.length > 0) {
          let hasUnresolvedConflicts = true;

          if (branch.headCommitId) {
            const latestCommit = await this.commitRepository.findOne({
              where: { id: branch.headCommitId },
            });

            if (
              latestCommit?.message.includes(
                'Resolve conflicts with main branch',
              )
            ) {
              const mainLastUpdated = new Date(
                mainBranch.updatedAt || mainBranch.createdAt,
              );
              const resolutionTime = new Date(latestCommit.createdAt);

              if (mainLastUpdated <= resolutionTime) {
                hasUnresolvedConflicts = false;
              }
            }
          }

          if (hasUnresolvedConflicts) {
            await this.branchRepository.update(branchId, {
              hasUnresolvedConflicts: true,
            });

            throw new ForbiddenException(
              'Cannot create commit. This branch has conflicts with main. Please use "Fetch Main" to view and resolve conflicts first.',
            );
          }
        }
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lockedBranch = await queryRunner.manager.findOne(Branch, {
        where: { id: branchId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedBranch) {
        throw new NotFoundException('Branch not found');
      }

      const expectedHeadCommitId =
        createCommitDto.expectedHeadCommitId !== undefined
          ? createCommitDto.expectedHeadCommitId
          : branch.headCommitId;

      if (lockedBranch.headCommitId !== expectedHeadCommitId) {
        throw new ConflictException(
          'Branch has been updated by another user. Please refresh and try again.',
        );
      }

      const commit = queryRunner.manager.create(Commit, {
        message,
        branchId,
        authorId: user.id,
        parentCommitId: branch.headCommitId,
      });

      const savedCommit = await queryRunner.manager.save(commit);

      const spatialFeatures = features.map((featureDto) => {
        const feature = queryRunner.manager.create(SpatialFeature, {
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

      await queryRunner.manager.save(spatialFeatures);

      delete (branch as any).commits;
      delete (branch as any).dataset;
      delete (branch as any).createdBy;
      branch.headCommitId = savedCommit.id;
      await queryRunner.manager.save(branch);

      await queryRunner.commitTransaction();

      return savedCommit;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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
