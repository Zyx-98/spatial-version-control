import dataSource from 'data-source';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import {
  Branch,
  Commit,
  Dataset,
  Department,
  FeatureOperation,
  MergeRequest,
  MergeRequestStatus,
  SpatialFeature,
  SpatialFeatureType,
  User,
  UserRole,
} from 'src/entities';

async function seed() {
  try {
    console.log('Starting database seeding...');

    await dataSource.initialize();
    console.log('Database connection established');

    console.log('Clearing existing data...');
    await dataSource.query(
      'TRUNCATE TABLE merge_requests, spatial_features, commits, branches, datasets, "users", departments CASCADE',
    );
    console.log('Existing data cleared');

    console.log('Creating department...');
    const department = await dataSource.getRepository(Department).save({
      id: uuidv4(),
      name: 'GIS Department',
    });
    console.log('Created 1 department');

    console.log('Creating users...');
    const hashedPassword = await bcrypt.hash('secret123', 10);

    const adminUser = await dataSource.getRepository(User).save({
      username: 'admin',
      email: 'admin@spatial.com',
      password: hashedPassword,
      role: UserRole.ADMIN,
      departmentId: department.id,
    });

    const normalUser = await dataSource.getRepository(User).save({
      username: 'user',
      email: 'user@spatial.com',
      password: hashedPassword,
      role: UserRole.USER,
      departmentId: department.id,
    });

    console.log('Created 2 users (admin and user)');

    console.log('Creating dataset...');
    const dataset = await dataSource.getRepository(Dataset).save({
      name: 'Features Demo',
      description:
        'Dataset demonstrating all spatial feature types: Point, Line, Polygon, MultiPoint, MultiLine, MultiPolygon',
      departmentId: department.id,
    });
    console.log('Created 1 dataset');

    console.log('Creating main branch...');
    const mainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: dataset.id,
      createdById: adminUser.id,
    });
    console.log('Created 1 main branch');

    console.log('Creating initial commit with all feature types...');

    const initialCommit = await dataSource.getRepository(Commit).save({
      message: 'Initial commit - Add all geometry types',
      branchId: mainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'point-001',
        geometryType: SpatialFeatureType.POINT,
        geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        properties: {
          name: 'City Hall',
          type: 'landmark',
          importance: 'high',
        },
        operation: FeatureOperation.CREATE,
        commitId: initialCommit.id,
      },
      {
        featureId: 'line-001',
        geometryType: SpatialFeatureType.LINE,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.4194, 37.7749],
            [-122.4184, 37.7739],
            [-122.4174, 37.7729],
          ],
        },
        properties: {
          name: 'Main Street',
          type: 'road',
          lanes: 4,
        },
        operation: FeatureOperation.CREATE,
        commitId: initialCommit.id,
      },
      {
        featureId: 'polygon-001',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.42, 37.774],
              [-122.415, 37.774],
              [-122.415, 37.779],
              [-122.42, 37.779],
              [-122.42, 37.774],
            ],
          ],
        },
        properties: {
          name: 'Central Park',
          type: 'park',
          area_sqm: 50000,
        },
        operation: FeatureOperation.CREATE,
        commitId: initialCommit.id,
      },
      {
        featureId: 'multipoint-001',
        geometryType: SpatialFeatureType.MULTI_POINT,
        geometry: {
          type: 'MultiPoint',
          coordinates: [
            [-122.4194, 37.7749],
            [-122.4184, 37.7759],
            [-122.4174, 37.7769],
            [-122.4164, 37.7779],
          ],
        },
        properties: {
          name: 'Bus Stops - Route 1',
          type: 'transit',
          route_id: 'BUS-001',
        },
        operation: FeatureOperation.CREATE,
        commitId: initialCommit.id,
      },
      {
        featureId: 'multiline-001',
        geometryType: SpatialFeatureType.MULTI_LINE,
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [-122.43, 37.77],
              [-122.425, 37.772],
              [-122.42, 37.774],
            ],
            [
              [-122.42, 37.774],
              [-122.415, 37.776],
              [-122.41, 37.778],
            ],
          ],
        },
        properties: {
          name: 'River Network',
          type: 'waterway',
          flow_direction: 'south',
        },
        operation: FeatureOperation.CREATE,
        commitId: initialCommit.id,
      },
      {
        featureId: 'multipolygon-001',
        geometryType: SpatialFeatureType.MULTI_POLYGON,
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-122.43, 37.78],
                [-122.425, 37.78],
                [-122.425, 37.785],
                [-122.43, 37.785],
                [-122.43, 37.78],
              ],
            ],
            [
              [
                [-122.42, 37.78],
                [-122.415, 37.78],
                [-122.415, 37.785],
                [-122.42, 37.785],
                [-122.42, 37.78],
              ],
            ],
          ],
        },
        properties: {
          name: 'Industrial Zones',
          type: 'zoning',
          zone_code: 'IND-A',
        },
        operation: FeatureOperation.CREATE,
        commitId: initialCommit.id,
      },
    ]);

    mainBranch.headCommitId = initialCommit.id;
    await dataSource.getRepository(Branch).save(mainBranch);

    console.log('Created 1 commit with 6 spatial features (all types)');

    console.log('Creating feature branch...');
    const featureBranch = await dataSource.getRepository(Branch).save({
      name: 'feature/update-features',
      isMain: false,
      datasetId: dataset.id,
      createdById: normalUser.id,
      headCommitId: initialCommit.id,
    });

    const featureCommit = await dataSource.getRepository(Commit).save({
      message: 'Update City Hall properties and add new polygon',
      branchId: featureBranch.id,
      authorId: normalUser.id,
      parentCommitId: initialCommit.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'point-001',
        geometryType: SpatialFeatureType.POINT,
        geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        properties: {
          name: 'City Hall',
          type: 'landmark',
          importance: 'critical',
          renovated: 2024,
        },
        operation: FeatureOperation.UPDATE,
        commitId: featureCommit.id,
      },
      {
        featureId: 'polygon-002',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.425, 37.774],
              [-122.42, 37.774],
              [-122.42, 37.779],
              [-122.425, 37.779],
              [-122.425, 37.774],
            ],
          ],
        },
        properties: {
          name: 'New Commercial Zone',
          type: 'commercial',
          area_sqm: 25000,
        },
        operation: FeatureOperation.CREATE,
        commitId: featureCommit.id,
      },
    ]);

    featureBranch.headCommitId = featureCommit.id;
    await dataSource.getRepository(Branch).save(featureBranch);

    console.log('Created 1 feature branch with 1 commit');

    console.log('Creating merge request...');
    await dataSource.getRepository(MergeRequest).save({
      title: 'Update City Hall and add new commercial zone',
      description:
        'This PR updates City Hall properties to mark it as critical and adds a new commercial zone polygon.',
      sourceBranchId: featureBranch.id,
      targetBranchId: mainBranch.id,
      createdById: normalUser.id,
      status: MergeRequestStatus.OPEN,
      hasConflicts: false,
    });

    console.log('Created 1 merge request');

    console.log('\nSeeding Summary:');
    console.log('==================');
    console.log('Departments: 1');
    console.log('Users: 2 (1 admin, 1 user)');
    console.log('Datasets: 1');
    console.log('Main Branches: 1');
    console.log('Feature Branches: 1');
    console.log('Commits: 2');
    console.log(
      'Spatial Features: 8 (6 types: Point, Line, Polygon, MultiPoint, MultiLine, MultiPolygon)',
    );
    console.log('Merge Requests: 1');
    console.log('\nLogin Credentials:');
    console.log('==================');
    console.log('Admin: username: admin, password: secret123');
    console.log('User: username: user, password: secret123');
    console.log('\nDatabase seeding completed successfully!');

    await dataSource.destroy();
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seed();
