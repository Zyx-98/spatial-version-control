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
    console.log('🌱 Starting database seeding...');

    await dataSource.initialize();
    console.log('✅ Database connection established');

    console.log('🗑️  Clearing existing data...');
    await dataSource.createQueryBuilder().delete().from(MergeRequest).execute();
    await dataSource
      .createQueryBuilder()
      .delete()
      .from(SpatialFeature)
      .execute();
    await dataSource.createQueryBuilder().delete().from(Commit).execute();
    await dataSource.createQueryBuilder().delete().from(Branch).execute();
    await dataSource.createQueryBuilder().delete().from(Dataset).execute();
    await dataSource.createQueryBuilder().delete().from(User).execute();
    await dataSource.createQueryBuilder().delete().from(Department).execute();
    console.log('✅ Existing data cleared');

    console.log('🏢 Creating departments...');
    const demoDept = await dataSource.getRepository(Department).save({
      id: uuidv4(),
      name: 'Demo Department',
    });

    console.log(`✅ Created ${1} departments`);

    console.log('👥 Creating users...');
    const hashedPassword = await bcrypt.hash('secret123', 10);

    const adminUser = await dataSource.getRepository(User).save({
      username: 'admin',
      email: 'admin@spatial-vc.com',
      password: hashedPassword,
      role: UserRole.ADMIN,
      departmentId: demoDept.id,
    });

    const normalUser = await dataSource.getRepository(User).save({
      username: 'john_doe',
      email: 'john.doe@spatial-vc.com',
      password: hashedPassword,
      role: UserRole.USER,
      departmentId: demoDept.id,
    });

    console.log(`✅ Created ${2} users (password: password123)`);

    console.log('📊 Creating datasets...');
    const dataset1 = await dataSource.getRepository(Dataset).save({
      name: 'City Infrastructure',
      description: 'Roads, buildings, and utilities for the city',
      departmentId: demoDept.id,
    });

    const dataset2 = await dataSource.getRepository(Dataset).save({
      name: 'Zoning Map',
      description: 'City zoning and land use planning',
      departmentId: demoDept.id,
    });

    const dataset3 = await dataSource.getRepository(Dataset).save({
      name: 'Public Transportation',
      description: 'Bus routes and transit stations',
      departmentId: demoDept.id,
    });

    console.log(`✅ Created ${3} datasets`);

    console.log('🌿 Creating main branches...');
    const mainBranch1 = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: dataset1.id,
      createdById: adminUser.id,
    });

    const mainBranch2 = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: dataset2.id,
      createdById: adminUser.id,
    });

    const _mainBranch3 = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: dataset3.id,
      createdById: adminUser.id,
    });

    console.log(`✅ Created ${3} main branches`);

    console.log('💾 Creating initial commits with spatial features...');

    const commit1 = await dataSource.getRepository(Commit).save({
      message: 'Add downtown office buildings',
      branchId: mainBranch1.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'building-001',
        geometryType: SpatialFeatureType.POINT,
        geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        properties: {
          name: 'City Hall',
          type: 'government',
          floors: 8,
          year_built: 1915,
        },
        operation: FeatureOperation.CREATE,
        commitId: commit1.id,
      },
      {
        featureId: 'building-002',
        geometryType: SpatialFeatureType.POINT,
        geometry: { type: 'Point', coordinates: [-122.4184, 37.7739] },
        properties: {
          name: 'Tech Tower',
          type: 'commercial',
          floors: 25,
          year_built: 2018,
        },
        operation: FeatureOperation.CREATE,
        commitId: commit1.id,
      },
      {
        featureId: 'building-003',
        geometryType: SpatialFeatureType.POINT,
        geometry: { type: 'Point', coordinates: [-122.4204, 37.7759] },
        properties: {
          name: 'Central Library',
          type: 'public',
          floors: 4,
          year_built: 1996,
        },
        operation: FeatureOperation.CREATE,
        commitId: commit1.id,
      },
    ]);

    const commit2 = await dataSource.getRepository(Commit).save({
      message: 'Add downtown street network',
      branchId: mainBranch1.id,
      authorId: adminUser.id,
      parentCommitId: commit1.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'road-001',
        geometryType: SpatialFeatureType.LINE,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.4194, 37.7749],
            [-122.4184, 37.7739],
            [-122.4174, 37.7729],
            [-122.4164, 37.7719],
          ],
        },
        properties: {
          name: 'Market Street',
          type: 'primary',
          lanes: 4,
          speed_limit: 35,
        },
        operation: FeatureOperation.CREATE,
        commitId: commit2.id,
      },
      {
        featureId: 'road-002',
        geometryType: SpatialFeatureType.LINE,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.4214, 37.7749],
            [-122.4194, 37.7749],
            [-122.4174, 37.7749],
          ],
        },
        properties: {
          name: 'Mission Street',
          type: 'secondary',
          lanes: 2,
          speed_limit: 25,
        },
        operation: FeatureOperation.CREATE,
        commitId: commit2.id,
      },
    ]);

    const commit3 = await dataSource.getRepository(Commit).save({
      message: 'Add city parks and green spaces',
      branchId: mainBranch1.id,
      authorId: adminUser.id,
      parentCommitId: commit2.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'park-001',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.5107, 37.7694],
              [-122.4545, 37.7694],
              [-122.4545, 37.7772],
              [-122.5107, 37.7772],
              [-122.5107, 37.7694],
            ],
          ],
        },
        properties: {
          name: 'Golden Gate Park',
          type: 'regional_park',
          area_sqm: 4100000,
          facilities: ['playground', 'trails', 'picnic_areas'],
        },
        operation: FeatureOperation.CREATE,
        commitId: commit3.id,
      },
      {
        featureId: 'park-002',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.4194, 37.7754],
              [-122.4184, 37.7754],
              [-122.4184, 37.7764],
              [-122.4194, 37.7764],
              [-122.4194, 37.7754],
            ],
          ],
        },
        properties: {
          name: 'Downtown Square',
          type: 'urban_park',
          area_sqm: 5000,
          facilities: ['fountain', 'seating'],
        },
        operation: FeatureOperation.CREATE,
        commitId: commit3.id,
      },
    ]);

    // Update main branch head
    mainBranch1.headCommitId = commit3.id;
    await dataSource.getRepository(Branch).save(mainBranch1);

    // Commit 4: Zoning polygons on dataset 2
    const commit4 = await dataSource.getRepository(Commit).save({
      message: 'Initial zoning map - downtown districts',
      branchId: mainBranch2.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'zone-001',
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
          zone_type: 'commercial',
          max_height: 150,
          density: 'high',
        },
        operation: FeatureOperation.CREATE,
        commitId: commit4.id,
      },
      {
        featureId: 'zone-002',
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
          zone_type: 'residential',
          max_height: 45,
          density: 'medium',
        },
        operation: FeatureOperation.CREATE,
        commitId: commit4.id,
      },
    ]);

    mainBranch2.headCommitId = commit4.id;
    await dataSource.getRepository(Branch).save(mainBranch2);

    console.log(`✅ Created ${4} commits with spatial features`);

    // Create Feature Branches
    console.log('🌿 Creating feature branches...');
    const featureBranch1 = await dataSource.getRepository(Branch).save({
      name: 'feature/new-highway',
      isMain: false,
      datasetId: dataset1.id,
      createdById: normalUser.id,
      headCommitId: commit3.id,
    });

    const featureBranch2 = await dataSource.getRepository(Branch).save({
      name: 'feature/update-buildings',
      isMain: false,
      datasetId: dataset1.id,
      createdById: normalUser.id,
      headCommitId: commit3.id,
    });

    const featureBranch3 = await dataSource.getRepository(Branch).save({
      name: 'feature/residential-zones',
      isMain: false,
      datasetId: dataset2.id,
      createdById: normalUser.id,
      headCommitId: commit4.id,
    });

    console.log(`✅ Created ${3} feature branches`);

    console.log('💾 Creating commits on feature branches...');

    const featureCommit1 = await dataSource.getRepository(Commit).save({
      message: 'Add new highway route',
      branchId: featureBranch1.id,
      authorId: normalUser.id,
      parentCommitId: commit3.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'road-highway-001',
        geometryType: SpatialFeatureType.LINE,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.43, 37.77],
            [-122.425, 37.772],
            [-122.42, 37.774],
            [-122.415, 37.776],
            [-122.41, 37.778],
          ],
        },
        properties: {
          name: 'Interstate 280 Extension',
          type: 'highway',
          lanes: 6,
          speed_limit: 65,
        },
        operation: FeatureOperation.CREATE,
        commitId: featureCommit1.id,
      },
    ]);

    featureBranch1.headCommitId = featureCommit1.id;
    await dataSource.getRepository(Branch).save(featureBranch1);

    const featureCommit2 = await dataSource.getRepository(Commit).save({
      message: 'Update Tech Tower floor count after renovation',
      branchId: featureBranch2.id,
      authorId: normalUser.id,
      parentCommitId: commit3.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'building-002',
        geometryType: SpatialFeatureType.POINT,
        geometry: { type: 'Point', coordinates: [-122.4184, 37.7739] },
        properties: {
          name: 'Tech Tower',
          type: 'commercial',
          floors: 30,
          year_built: 2018,
          renovated: 2024,
        },
        operation: FeatureOperation.UPDATE,
        commitId: featureCommit2.id,
      },
    ]);

    featureBranch2.headCommitId = featureCommit2.id;
    await dataSource.getRepository(Branch).save(featureBranch2);

    const featureCommit3 = await dataSource.getRepository(Commit).save({
      message: 'Add new residential zoning areas',
      branchId: featureBranch3.id,
      authorId: normalUser.id,
      parentCommitId: commit4.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'zone-003',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.43, 37.774],
              [-122.425, 37.774],
              [-122.425, 37.779],
              [-122.43, 37.779],
              [-122.43, 37.774],
            ],
          ],
        },
        properties: {
          zone_type: 'residential',
          max_height: 35,
          density: 'low',
          single_family: true,
        },
        operation: FeatureOperation.CREATE,
        commitId: featureCommit3.id,
      },
    ]);

    featureBranch3.headCommitId = featureCommit3.id;
    await dataSource.getRepository(Branch).save(featureBranch3);

    console.log(`✅ Created ${3} commits on feature branches`);

    console.log('🔀 Creating merge requests...');

    await dataSource.getRepository(MergeRequest).save({
      title: 'Add new highway route to city infrastructure',
      description:
        'This merge request adds the new Interstate 280 extension to connect the downtown area with the suburbs.',
      sourceBranchId: featureBranch1.id,
      targetBranchId: mainBranch1.id,
      createdById: normalUser.id,
      status: MergeRequestStatus.OPEN,
      hasConflicts: false,
    });

    await dataSource.getRepository(MergeRequest).save({
      title: 'Update Tech Tower building information',
      description:
        'Updates the floor count for Tech Tower after recent renovation completed in 2024.',
      sourceBranchId: featureBranch2.id,
      targetBranchId: mainBranch1.id,
      createdById: normalUser.id,
      status: MergeRequestStatus.APPROVED,
      hasConflicts: false,
      reviewedById: adminUser.id,
      reviewComment: 'Looks good! Approved for merge.',
    });

    await dataSource.getRepository(MergeRequest).save({
      title: 'Add residential zoning for west district',
      description:
        'Proposes new low-density residential zoning for the western district.',
      sourceBranchId: featureBranch3.id,
      targetBranchId: mainBranch2.id,
      createdById: normalUser.id,
      status: MergeRequestStatus.OPEN,
      hasConflicts: false,
    });

    console.log(`✅ Created ${3} merge requests`);

    console.log('\n📊 Seeding Summary:');
    console.log('==================');
    console.log(`✅ Departments: 3`);
    console.log(`✅ Users: 2 (1 admins, 1 users)`);
    console.log(`✅ Datasets: 3`);
    console.log(`✅ Main Branches: 3`);
    console.log(`✅ Feature Branches: 3`);
    console.log(`✅ Commits: 7`);
    console.log(`✅ Spatial Features: 14`);
    console.log(`✅ Merge Requests: 3`);
    console.log('\n🔐 Login Credentials:');
    console.log('==================');
    console.log('Admin Users:');
    console.log('  - username: admin, password: password123');
    console.log('\nUsers:');
    console.log('  - username: john_doe, password: password123');
    console.log('\n✅ Database seeding completed successfully!');

    await dataSource.destroy();
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seed();
