import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Commit } from './commit.entity';

export enum SpatialFeatureType {
  POINT = 'Point',
  LINE = 'Line',
  POLYGON = 'Polygon',
  MULTI_POINT = 'MultiPoint',
  MULTI_LINE = 'MultiLine',
  MULTI_POLYGON = 'MultiPolygon',
}

export enum FeatureOperation {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

@Entity('spatial_features')
export class SpatialFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'feature_id', nullable: true })
  featureId: string;

  @Column({
    name: 'geometry_type',
    type: 'enum',
    enum: SpatialFeatureType,
  })
  geometryType: SpatialFeatureType;

  @Column({ type: 'jsonb' })
  geometry: any;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Geometry',
    srid: 4326,
    nullable: true,
  })
  geom: string;

  @Column({ type: 'jsonb', nullable: true })
  properties: any;

  @Column({
    type: 'enum',
    enum: FeatureOperation,
    default: FeatureOperation.CREATE,
  })
  operation: FeatureOperation;

  @ManyToOne(() => Commit, (commit) => commit.features)
  @JoinColumn({ name: 'commit_id' })
  commit: Commit;

  @Column({ name: 'commit_id' })
  commitId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
