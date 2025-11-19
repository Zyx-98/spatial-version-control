import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Dataset } from './dataset.entity';
import { Commit } from './commit.entity';
import { MergeRequest } from './merge-request.entity';

@Entity('branches')
export class Branch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'is_main', default: false })
  isMain: boolean;

  @Column({ name: 'is_disabled', default: false })
  isDisabled: boolean;

  @Column({ name: 'has_unresolved_conflicts', default: false })
  hasUnresolvedConflicts: boolean;

  @ManyToOne(() => Dataset, (dataset) => dataset.branches)
  @JoinColumn({ name: 'dataset_id' })
  dataset: Dataset;

  @Column({ name: 'dataset_id' })
  datasetId: string;

  @ManyToOne(() => User, (user) => user.branches)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column({ name: 'created_by_id' })
  createdById: string;

  @Column({ name: 'head_commit_id', nullable: true })
  headCommitId: string;

  @OneToMany(() => Commit, (commit) => commit.branch)
  commits: Commit[];

  @OneToMany(() => MergeRequest, (mr) => mr.sourceBranch)
  mergeRequestsAsSource: MergeRequest[];

  @OneToMany(() => MergeRequest, (mr) => mr.targetBranch)
  mergeRequestsAsTarget: MergeRequest[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
