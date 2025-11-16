import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from './branch.entity';
import { User } from './user.entity';

export enum MergeRequestStatus {
  OPEN = 'open',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  MERGED = 'merged',
  CLOSED = 'closed',
}

@Entity('merge_requests')
export class MergeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => Branch, (branch) => branch.mergeRequestsAsSource)
  @JoinColumn({ name: 'source_branch_id' })
  sourceBranch: Branch;

  @Column({ name: 'source_branch_id' })
  sourceBranchId: string;

  @ManyToOne(() => Branch, (branch) => branch.mergeRequestsAsTarget)
  @JoinColumn({ name: 'target_branch_id' })
  targetBranch: Branch;

  @Column({ name: 'target_branch_id' })
  targetBranchId: string;

  @ManyToOne(() => User, (user) => user.mergeRequests)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column({ name: 'created_by_id' })
  createdById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy: User;

  @Column({ name: 'reviewed_by_id', nullable: true })
  reviewedById: string;

  @Column({
    type: 'enum',
    enum: MergeRequestStatus,
    default: MergeRequestStatus.OPEN,
  })
  status: MergeRequestStatus;

  @Column({ type: 'jsonb', nullable: true })
  conflicts: any;

  @Column({ name: 'has_conflicts', default: false })
  hasConflicts: boolean;

  @Column({ name: 'review_comment', nullable: true })
  reviewComment: string;

  @Column({ nullable: true })
  mergedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
