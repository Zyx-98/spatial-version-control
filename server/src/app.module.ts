import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  User,
  Department,
  Dataset,
  Branch,
  Commit,
  SpatialFeature,
  MergeRequest,
} from './entities';
import { AuthService } from './services/auth.service';
import { DatasetService } from './services/dataset.service';
import { BranchService } from './services/branch.service';
import { CommitService } from './services/commit.service';
import { MergeRequestService } from './services/merge-request.service';
import { GeoJsonService } from './services/geojson.service';
import { ShapefileService } from './services/shapefile.service';
import { MvtService } from './services/mvt.service';
import { DiffService } from './services/diff.service';
import { AuthController } from './controllers/auth.controller';
import { DatasetController } from './controllers/dataset.controller';
import { BranchController } from './controllers/branch.controller';
import { CommitController } from './controllers/commit.controller';
import { MergeRequestController } from './controllers/merge-request.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', 'postgres'),
        database: configService.get('DB_DATABASE', 'spatial_version_control'),
        entities: [
          User,
          Department,
          Dataset,
          Branch,
          Commit,
          SpatialFeature,
          MergeRequest,
        ],
        synchronize: false,
        logging: true,
        autoLoadEntities: true,
      }),
    }),
    TypeOrmModule.forFeature([
      User,
      Department,
      Dataset,
      Branch,
      Commit,
      SpatialFeature,
      MergeRequest,
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET', 'your-secret-key'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRATION', '7d'),
        },
      }),
    }),
  ],
  controllers: [
    AuthController,
    DatasetController,
    BranchController,
    CommitController,
    MergeRequestController,
  ],
  providers: [
    AuthService,
    DatasetService,
    BranchService,
    CommitService,
    MergeRequestService,
    GeoJsonService,
    ShapefileService,
    MvtService,
    DiffService,
    JwtStrategy,
    JwtAuthGuard,
  ],
})
export class AppModule {}
