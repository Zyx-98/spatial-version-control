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
        'Dataset demonstrating all spatial feature types: Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon',
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

    console.log('Creating second commit on main branch...');
    const mainSecondCommit = await dataSource.getRepository(Commit).save({
      message: 'Update City Hall status to under construction',
      branchId: mainBranch.id,
      authorId: adminUser.id,
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
          importance: 'high',
          status: 'under_construction',
          construction_year: 2024,
        },
        operation: FeatureOperation.UPDATE,
        commitId: mainSecondCommit.id,
      },
    ]);

    mainBranch.headCommitId = mainSecondCommit.id;
    await dataSource.getRepository(Branch).save(mainBranch);

    console.log('Created second commit on main branch');

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

    console.log('Creating merge request with conflicts...');
    const conflictsData = [
      {
        featureId: 'point-001',
        conflictType: 'MODIFY_MODIFY',
        mainVersion: {
          featureId: 'point-001',
          geometryType: 'Point',
          geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          properties: {
            name: 'City Hall',
            type: 'landmark',
            importance: 'high',
            status: 'under_construction',
            construction_year: 2024,
          },
        },
        branchVersion: {
          featureId: 'point-001',
          geometryType: 'Point',
          geometry: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          properties: {
            name: 'City Hall',
            type: 'landmark',
            importance: 'critical',
            renovated: 2024,
          },
        },
      },
    ];

    await dataSource.getRepository(MergeRequest).save({
      title: 'Update City Hall and add new commercial zone',
      description:
        'This PR updates City Hall properties to mark it as critical and adds a new commercial zone polygon. WARNING: This will have conflicts with main branch changes.',
      sourceBranchId: featureBranch.id,
      targetBranchId: mainBranch.id,
      createdById: normalUser.id,
      status: MergeRequestStatus.OPEN,
      hasConflicts: true,
      conflicts: conflictsData,
    });

    console.log('Created 1 merge request with conflicts data');

    console.log('Creating additional datasets...');

    const transportDataset = await dataSource.getRepository(Dataset).save({
      name: 'Transportation Network',
      description: 'City roads, highways, and transit infrastructure',
      departmentId: department.id,
    });

    const transportMainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: transportDataset.id,
      createdById: adminUser.id,
    });

    const transportCommit = await dataSource.getRepository(Commit).save({
      message: 'Add major highways and arterial roads',
      branchId: transportMainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'highway-001',
        geometryType: SpatialFeatureType.MULTI_LINE,
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [-122.45, 37.76],
              [-122.44, 37.77],
              [-122.43, 37.78],
            ],
            [
              [-122.43, 37.78],
              [-122.42, 37.79],
              [-122.41, 37.8],
            ],
          ],
        },
        properties: { name: 'I-80 Corridor', lanes: 6, speed_limit: 65 },
        operation: FeatureOperation.CREATE,
        commitId: transportCommit.id,
      },
      {
        featureId: 'intersection-001',
        geometryType: SpatialFeatureType.POINT,
        geometry: { type: 'Point', coordinates: [-122.43, 37.78] },
        properties: {
          name: 'Highway Junction',
          type: 'interchange',
          traffic_lights: true,
        },
        operation: FeatureOperation.CREATE,
        commitId: transportCommit.id,
      },
    ]);

    transportMainBranch.headCommitId = transportCommit.id;
    await dataSource.getRepository(Branch).save(transportMainBranch);

    // Add second scenario: Geometry/Feature conflict on Transportation dataset
    console.log('Creating feature conflict scenario...');

    // Main branch updates highway geometry
    const transportMainUpdate = await dataSource.getRepository(Commit).save({
      message: 'Adjust highway route for new construction',
      branchId: transportMainBranch.id,
      authorId: adminUser.id,
      parentCommitId: transportCommit.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'highway-001',
        geometryType: SpatialFeatureType.MULTI_LINE,
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [-122.45, 37.76],
              [-122.445, 37.765], // Changed coordinates
              [-122.44, 37.77],
              [-122.43, 37.78],
            ],
            [
              [-122.43, 37.78],
              [-122.42, 37.79],
              [-122.41, 37.8],
            ],
          ],
        },
        properties: { name: 'I-80 Corridor', lanes: 6, speed_limit: 65 },
        operation: FeatureOperation.UPDATE,
        commitId: transportMainUpdate.id,
      },
      {
        featureId: 'exit-ramp-001',
        geometryType: SpatialFeatureType.LINE,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.43, 37.78],
            [-122.435, 37.782],
            [-122.44, 37.784],
          ],
        },
        properties: { name: 'Exit 42 Ramp', type: 'exit_ramp' },
        operation: FeatureOperation.CREATE,
        commitId: transportMainUpdate.id,
      },
    ]);

    transportMainBranch.headCommitId = transportMainUpdate.id;
    await dataSource.getRepository(Branch).save(transportMainBranch);

    // Feature branch also updates highway with different geometry
    const transportFeatureBranch = await dataSource.getRepository(Branch).save({
      name: 'feature/highway-expansion',
      isMain: false,
      datasetId: transportDataset.id,
      createdById: normalUser.id,
      headCommitId: transportCommit.id, // Branched before main's update
    });

    const transportFeatureCommit = await dataSource.getRepository(Commit).save({
      message: 'Expand highway to 8 lanes',
      branchId: transportFeatureBranch.id,
      authorId: normalUser.id,
      parentCommitId: transportCommit.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'highway-001',
        geometryType: SpatialFeatureType.MULTI_LINE,
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [-122.45, 37.76],
              [-122.44, 37.77],
              [-122.435, 37.775], // Different path
              [-122.43, 37.78],
            ],
            [
              [-122.43, 37.78],
              [-122.42, 37.79],
              [-122.41, 37.8],
            ],
          ],
        },
        properties: { name: 'I-80 Corridor', lanes: 8, speed_limit: 70 }, // Different properties
        operation: FeatureOperation.UPDATE,
        commitId: transportFeatureCommit.id,
      },
      {
        featureId: 'service-road-001',
        geometryType: SpatialFeatureType.LINE,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.43, 37.78],
            [-122.425, 37.781],
            [-122.42, 37.782],
          ],
        },
        properties: { name: 'Service Road', type: 'service' },
        operation: FeatureOperation.CREATE,
        commitId: transportFeatureCommit.id,
      },
    ]);

    transportFeatureBranch.headCommitId = transportFeatureCommit.id;
    await dataSource.getRepository(Branch).save(transportFeatureBranch);

    // Create merge request with geometry and feature conflicts
    const geometryConflictsData = [
      {
        featureId: 'highway-001',
        conflictType: 'MODIFY_MODIFY',
        mainVersion: {
          featureId: 'highway-001',
          geometryType: 'MultiLineString',
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [-122.45, 37.76],
                [-122.445, 37.765],
                [-122.44, 37.77],
                [-122.43, 37.78],
              ],
              [
                [-122.43, 37.78],
                [-122.42, 37.79],
                [-122.41, 37.8],
              ],
            ],
          },
          properties: { name: 'I-80 Corridor', lanes: 6, speed_limit: 65 },
        },
        branchVersion: {
          featureId: 'highway-001',
          geometryType: 'MultiLineString',
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [-122.45, 37.76],
                [-122.44, 37.77],
                [-122.435, 37.775],
                [-122.43, 37.78],
              ],
              [
                [-122.43, 37.78],
                [-122.42, 37.79],
                [-122.41, 37.8],
              ],
            ],
          },
          properties: { name: 'I-80 Corridor', lanes: 8, speed_limit: 70 },
        },
      },
    ];

    await dataSource.getRepository(MergeRequest).save({
      title: 'Highway expansion to 8 lanes',
      description:
        'Expands I-80 corridor from 6 to 8 lanes with updated geometry. Conflicts: Main branch adjusted route, feature branch expanded lanes.',
      sourceBranchId: transportFeatureBranch.id,
      targetBranchId: transportMainBranch.id,
      createdById: normalUser.id,
      status: MergeRequestStatus.OPEN,
      hasConflicts: true,
      conflicts: geometryConflictsData,
    });

    console.log('Created geometry conflict scenario');

    // Dataset 3: Water Infrastructure
    const waterDataset = await dataSource.getRepository(Dataset).save({
      name: 'Water Infrastructure',
      description: 'Water supply, treatment plants, and distribution network',
      departmentId: department.id,
    });

    const waterMainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: waterDataset.id,
      createdById: adminUser.id,
    });

    const waterCommit = await dataSource.getRepository(Commit).save({
      message: 'Add water treatment facilities and main pipelines',
      branchId: waterMainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'plant-001',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.48, 37.75],
              [-122.475, 37.75],
              [-122.475, 37.755],
              [-122.48, 37.755],
              [-122.48, 37.75],
            ],
          ],
        },
        properties: {
          name: 'Central Treatment Plant',
          capacity_mgd: 150,
          status: 'operational',
        },
        operation: FeatureOperation.CREATE,
        commitId: waterCommit.id,
      },
      {
        featureId: 'pipeline-001',
        geometryType: SpatialFeatureType.LINE,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.48, 37.753],
            [-122.46, 37.76],
            [-122.44, 37.77],
          ],
        },
        properties: { diameter_inches: 48, material: 'steel', year: 2015 },
        operation: FeatureOperation.CREATE,
        commitId: waterCommit.id,
      },
    ]);

    waterMainBranch.headCommitId = waterCommit.id;
    await dataSource.getRepository(Branch).save(waterMainBranch);

    // Dataset 4: Emergency Services
    const emergencyDataset = await dataSource.getRepository(Dataset).save({
      name: 'Emergency Services',
      description: 'Fire stations, hospitals, and emergency response zones',
      departmentId: department.id,
    });

    const emergencyMainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: emergencyDataset.id,
      createdById: adminUser.id,
    });

    const emergencyCommit = await dataSource.getRepository(Commit).save({
      message: 'Add emergency service locations',
      branchId: emergencyMainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'fire-001',
        geometryType: SpatialFeatureType.MULTI_POINT,
        geometry: {
          type: 'MultiPoint',
          coordinates: [
            [-122.42, 37.76],
            [-122.45, 37.78],
            [-122.41, 37.79],
          ],
        },
        properties: {
          name: 'Fire Stations District 1',
          type: 'fire_station',
          units: 3,
        },
        operation: FeatureOperation.CREATE,
        commitId: emergencyCommit.id,
      },
      {
        featureId: 'response-zone-001',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.44, 37.75],
              [-122.4, 37.75],
              [-122.4, 37.79],
              [-122.44, 37.79],
              [-122.44, 37.75],
            ],
          ],
        },
        properties: {
          zone: 'District 1',
          response_time_min: 5,
          population: 45000,
        },
        operation: FeatureOperation.CREATE,
        commitId: emergencyCommit.id,
      },
    ]);

    emergencyMainBranch.headCommitId = emergencyCommit.id;
    await dataSource.getRepository(Branch).save(emergencyMainBranch);

    // Dataset 5: Parks and Recreation
    const parksDataset = await dataSource.getRepository(Dataset).save({
      name: 'Parks and Recreation',
      description: 'Public parks, playgrounds, and recreational facilities',
      departmentId: department.id,
    });

    const parksMainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: parksDataset.id,
      createdById: adminUser.id,
    });

    const parksCommit = await dataSource.getRepository(Commit).save({
      message: 'Add major parks and trails',
      branchId: parksMainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'park-001',
        geometryType: SpatialFeatureType.MULTI_POLYGON,
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-122.47, 37.76],
                [-122.46, 37.76],
                [-122.46, 37.77],
                [-122.47, 37.77],
                [-122.47, 37.76],
              ],
            ],
            [
              [
                [-122.44, 37.78],
                [-122.43, 37.78],
                [-122.43, 37.79],
                [-122.44, 37.79],
                [-122.44, 37.78],
              ],
            ],
          ],
        },
        properties: {
          name: 'City Parks Network',
          total_area_sqm: 150000,
          facilities: ['trails', 'playgrounds', 'sports_fields'],
        },
        operation: FeatureOperation.CREATE,
        commitId: parksCommit.id,
      },
    ]);

    parksMainBranch.headCommitId = parksCommit.id;
    await dataSource.getRepository(Branch).save(parksMainBranch);

    // Dataset 6: Land Use Planning
    const landUseDataset = await dataSource.getRepository(Dataset).save({
      name: 'Land Use Planning',
      description: 'Zoning districts and land use classifications',
      departmentId: department.id,
    });

    const landUseMainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: landUseDataset.id,
      createdById: adminUser.id,
    });

    const landUseCommit = await dataSource.getRepository(Commit).save({
      message: 'Add residential and commercial zones',
      branchId: landUseMainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'zone-r1',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.46, 37.74],
              [-122.44, 37.74],
              [-122.44, 37.76],
              [-122.46, 37.76],
              [-122.46, 37.74],
            ],
          ],
        },
        properties: {
          zone_type: 'R1',
          description: 'Single Family Residential',
          max_density: 8,
        },
        operation: FeatureOperation.CREATE,
        commitId: landUseCommit.id,
      },
      {
        featureId: 'zone-c1',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.43, 37.76],
              [-122.41, 37.76],
              [-122.41, 37.78],
              [-122.43, 37.78],
              [-122.43, 37.76],
            ],
          ],
        },
        properties: {
          zone_type: 'C1',
          description: 'Commercial District',
          max_height_ft: 120,
        },
        operation: FeatureOperation.CREATE,
        commitId: landUseCommit.id,
      },
    ]);

    landUseMainBranch.headCommitId = landUseCommit.id;
    await dataSource.getRepository(Branch).save(landUseMainBranch);

    // Dataset 7: Utility Networks
    const utilityDataset = await dataSource.getRepository(Dataset).save({
      name: 'Utility Networks',
      description: 'Electric power grid and telecommunications infrastructure',
      departmentId: department.id,
    });

    const utilityMainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: utilityDataset.id,
      createdById: adminUser.id,
    });

    const utilityCommit = await dataSource.getRepository(Commit).save({
      message: 'Add power substations and transmission lines',
      branchId: utilityMainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'substation-001',
        geometryType: SpatialFeatureType.POINT,
        geometry: { type: 'Point', coordinates: [-122.45, 37.77] },
        properties: {
          name: 'North Substation',
          voltage_kv: 230,
          capacity_mw: 500,
        },
        operation: FeatureOperation.CREATE,
        commitId: utilityCommit.id,
      },
      {
        featureId: 'transmission-001',
        geometryType: SpatialFeatureType.LINE,
        geometry: {
          type: 'LineString',
          coordinates: [
            [-122.45, 37.77],
            [-122.44, 37.775],
            [-122.43, 37.78],
            [-122.42, 37.785],
          ],
        },
        properties: { voltage_kv: 230, type: 'overhead', conductor: 'ACSR' },
        operation: FeatureOperation.CREATE,
        commitId: utilityCommit.id,
      },
    ]);

    utilityMainBranch.headCommitId = utilityCommit.id;
    await dataSource.getRepository(Branch).save(utilityMainBranch);

    // Dataset 8: Environmental Monitoring
    const envDataset = await dataSource.getRepository(Dataset).save({
      name: 'Environmental Monitoring',
      description: 'Air quality sensors and environmental protection zones',
      departmentId: department.id,
    });

    const envMainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: envDataset.id,
      createdById: adminUser.id,
    });

    const envCommit = await dataSource.getRepository(Commit).save({
      message: 'Add air quality monitoring network',
      branchId: envMainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'sensor-network-001',
        geometryType: SpatialFeatureType.MULTI_POINT,
        geometry: {
          type: 'MultiPoint',
          coordinates: [
            [-122.42, 37.75],
            [-122.44, 37.77],
            [-122.46, 37.79],
            [-122.41, 37.78],
          ],
        },
        properties: {
          name: 'Air Quality Sensor Array',
          parameters: ['PM2.5', 'O3', 'NO2'],
          status: 'active',
        },
        operation: FeatureOperation.CREATE,
        commitId: envCommit.id,
      },
    ]);

    envMainBranch.headCommitId = envCommit.id;
    await dataSource.getRepository(Branch).save(envMainBranch);

    // Dataset 9: Property Boundaries
    const propertyDataset = await dataSource.getRepository(Dataset).save({
      name: 'Property Boundaries',
      description: 'Cadastral parcels and property ownership data',
      departmentId: department.id,
    });

    const propertyMainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: propertyDataset.id,
      createdById: adminUser.id,
    });

    const propertyCommit = await dataSource.getRepository(Commit).save({
      message: 'Add downtown property parcels',
      branchId: propertyMainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'parcel-001',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.42, 37.775],
              [-122.419, 37.775],
              [-122.419, 37.776],
              [-122.42, 37.776],
              [-122.42, 37.775],
            ],
          ],
        },
        properties: {
          apn: '012-345-678',
          owner: 'City Properties Inc',
          area_sqft: 5000,
          zoning: 'C1',
        },
        operation: FeatureOperation.CREATE,
        commitId: propertyCommit.id,
      },
      {
        featureId: 'parcel-002',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.421, 37.775],
              [-122.42, 37.775],
              [-122.42, 37.776],
              [-122.421, 37.776],
              [-122.421, 37.775],
            ],
          ],
        },
        properties: {
          apn: '012-345-679',
          owner: 'Downtown Holdings LLC',
          area_sqft: 5200,
          zoning: 'C1',
        },
        operation: FeatureOperation.CREATE,
        commitId: propertyCommit.id,
      },
    ]);

    propertyMainBranch.headCommitId = propertyCommit.id;
    await dataSource.getRepository(Branch).save(propertyMainBranch);

    // Dataset 10: Agricultural Zones
    const agricultureDataset = await dataSource.getRepository(Dataset).save({
      name: 'Agricultural Zones',
      description: 'Farmland, crop types, and irrigation systems',
      departmentId: department.id,
    });

    const agricultureMainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: agricultureDataset.id,
      createdById: adminUser.id,
    });

    const agricultureCommit = await dataSource.getRepository(Commit).save({
      message: 'Add agricultural parcels and irrigation',
      branchId: agricultureMainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'farm-001',
        geometryType: SpatialFeatureType.POLYGON,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.5, 37.72],
              [-122.48, 37.72],
              [-122.48, 37.74],
              [-122.5, 37.74],
              [-122.5, 37.72],
            ],
          ],
        },
        properties: {
          name: 'Green Valley Farm',
          crop_type: 'vegetables',
          area_acres: 120,
          irrigation: 'drip',
        },
        operation: FeatureOperation.CREATE,
        commitId: agricultureCommit.id,
      },
    ]);

    agricultureMainBranch.headCommitId = agricultureCommit.id;
    await dataSource.getRepository(Branch).save(agricultureMainBranch);

    // Dataset 11: Public Transit
    const transitDataset = await dataSource.getRepository(Dataset).save({
      name: 'Public Transit',
      description: 'Bus routes, stations, and transit schedules',
      departmentId: department.id,
    });

    const transitMainBranch = await dataSource.getRepository(Branch).save({
      name: 'main',
      isMain: true,
      datasetId: transitDataset.id,
      createdById: adminUser.id,
    });

    const transitCommit = await dataSource.getRepository(Commit).save({
      message: 'Add bus routes and stations',
      branchId: transitMainBranch.id,
      authorId: adminUser.id,
    });

    await dataSource.getRepository(SpatialFeature).save([
      {
        featureId: 'route-001',
        geometryType: SpatialFeatureType.MULTI_LINE,
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [-122.42, 37.76],
              [-122.425, 37.765],
              [-122.43, 37.77],
              [-122.435, 37.775],
            ],
            [
              [-122.41, 37.77],
              [-122.415, 37.775],
              [-122.42, 37.78],
            ],
          ],
        },
        properties: {
          route_number: '22',
          name: 'Fillmore Express',
          frequency_min: 15,
        },
        operation: FeatureOperation.CREATE,
        commitId: transitCommit.id,
      },
      {
        featureId: 'stations-001',
        geometryType: SpatialFeatureType.MULTI_POINT,
        geometry: {
          type: 'MultiPoint',
          coordinates: [
            [-122.42, 37.76],
            [-122.425, 37.765],
            [-122.43, 37.77],
            [-122.435, 37.775],
          ],
        },
        properties: {
          route: '22',
          type: 'bus_stop',
          shelter: true,
        },
        operation: FeatureOperation.CREATE,
        commitId: transitCommit.id,
      },
    ]);

    transitMainBranch.headCommitId = transitCommit.id;
    await dataSource.getRepository(Branch).save(transitMainBranch);

    console.log('Created 10 additional datasets');

    console.log('\nSeeding Summary:');
    console.log('==================');
    console.log('Departments: 1');
    console.log('Users: 2 (1 admin, 1 user)');
    console.log('Datasets: 11');
    console.log('Main Branches: 11');
    console.log('Feature Branches: 2');
    console.log('Commits: 16 (includes 2 conflict scenarios)');
    console.log('Spatial Features: 39');
    console.log('Merge Requests: 2 (both with conflicts)');
    console.log('\nConflict Scenarios:');
    console.log('==================');
    console.log('1. Property Conflict (All Feature Types Demo):');
    console.log('   - Main: City Hall with status="under_construction"');
    console.log('   - Feature: City Hall with importance="critical"');
    console.log('   - Conflict on properties only, same geometry');
    console.log('\n2. Geometry & Feature Conflict (Transportation Network):');
    console.log('   - Main: Highway route adjusted + Exit ramp added');
    console.log(
      '   - Feature: Highway expanded to 8 lanes + Service road added',
    );
    console.log('   - Conflicts on both geometry and properties');
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
