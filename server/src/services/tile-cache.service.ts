import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../entities/branch.entity';
import { MvtService } from './mvt.service';
import {
  LOCK_SERVICE,
  LockService,
} from '../interfaces/lock-service.interface';

@Injectable()
export class TileCacheService {
  private readonly logger = new Logger(TileCacheService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(Branch) private branchRepo: Repository<Branch>,
    private mvtService: MvtService,
    @Inject(LOCK_SERVICE) private lockService: LockService,
  ) {}

  async getBranchTile(
    branchId: string,
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer> {
    const isInBounds = await this.isTileInBranchBounds(branchId, z, x, y);
    if (!isInBounds) {
      return Buffer.alloc(0);
    }

    const cacheKey = await this.buildCacheKey(branchId, z, x, y);

    const cachedTile = await this.cacheManager.get<Buffer>(cacheKey);
    if (cachedTile) {
      return cachedTile;
    }

    return await this.lockService.withLock(
      `tile:${cacheKey}`,
      async () => {
        const cached = await this.cacheManager.get<Buffer>(cacheKey);
        if (cached) {
          return cached;
        }

        return await this.generateAndCacheTile(branchId, cacheKey, z, x, y);
      },
      10000, // 10 second lock timeout
    );
  }

  private async generateAndCacheTile(
    branchId: string,
    cacheKey: string,
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer> {
    const tile = await this.mvtService.generateBranchTile(branchId, z, x, y);

    try {
      const ttl = this.getCacheTTL(z);
      await this.cacheManager.set(cacheKey, tile, ttl * 1000);
    } catch (error) {
      this.logger.error(`Cache write failed for ${cacheKey}: ${error.message}`);
    }

    return tile;
  }

  async getDiffTile(
    sourceBranchId: string,
    targetBranchId: string,
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer> {
    const cacheKey = `mvt:diff:${sourceBranchId}:${targetBranchId}:${z}:${x}:${y}`;

    const cachedTile = await this.cacheManager.get<Buffer>(cacheKey);
    if (cachedTile) {
      return cachedTile;
    }

    return await this.lockService.withLock(
      `tile:${cacheKey}`,
      async () => {
        const cached = await this.cacheManager.get<Buffer>(cacheKey);
        if (cached) {
          return cached;
        }

        return await this.generateAndCacheDiffTile(
          sourceBranchId,
          targetBranchId,
          cacheKey,
          z,
          x,
          y,
        );
      },
      10000, // 10 second lock timeout
    );
  }

  private async generateAndCacheDiffTile(
    sourceBranchId: string,
    targetBranchId: string,
    cacheKey: string,
    z: number,
    x: number,
    y: number,
  ): Promise<Buffer> {
    const tile = await this.mvtService.generateDiffTile(
      sourceBranchId,
      targetBranchId,
      z,
      x,
      y,
    );

    try {
      const ttl = Math.min(this.getCacheTTL(z), 300);
      await this.cacheManager.set(cacheKey, tile, ttl * 1000);
    } catch (error) {
      this.logger.error(
        `Cache write failed for diff tile ${cacheKey}: ${error.message}`,
      );
    }

    return tile;
  }

  private async buildCacheKey(
    branchId: string,
    z: number,
    x: number,
    y: number,
  ): Promise<string> {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId },
      select: ['id', 'headCommitId'],
    });

    if (!branch || !branch.headCommitId) {
      return `mvt:v2:${branchId}:none:${z}:${x}:${y}`;
    }

    const commitHash = branch.headCommitId.substring(0, 8);

    return `mvt:v2:${branchId}:${commitHash}:${z}:${x}:${y}`;
  }

  private getCacheTTL(zoom: number): number {
    if (zoom < 6) {
      return 86400; // 24 hours for low zoom
    } else if (zoom < 9) {
      return 3600; // 1 hour for medium zoom
    } else if (zoom < 12) {
      return 1800; // 30 minutes for high zoom
    } else {
      return 600; // 10 minutes for very high zoom
    }
  }

  async invalidateBranchCache(branchId: string): Promise<number> {
    this.logger.warn(
      `Manual cache invalidation requested for branch: ${branchId}`,
    );

    try {
      const store = (this.cacheManager as any).store;
      const client = store.getClient();

      const pattern = `mvt:v2:${branchId}:*`;
      let deletedKeys = 0;
      let cursor = '0';

      do {
        const [newCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );

        cursor = newCursor;

        if (keys.length > 0) {
          await Promise.all(
            keys.map((key: string) => this.cacheManager.del(key)),
          );
          deletedKeys += keys.length;
        }
      } while (cursor !== '0');

      this.logger.warn(
        `Invalidated ${deletedKeys} tiles for branch ${branchId}`,
      );

      return deletedKeys;
    } catch (error) {
      this.logger.error(`Failed to invalidate cache: ${error.message}`);
      return 0;
    }
  }

  async warmUpCache(
    branchId: string,
    bounds: [number, number, number, number],
    zoomLevels: number[] = [5, 7, 9],
  ): Promise<void> {
    const [minLng, minLat, maxLng, maxLat] = bounds;

    this.logger.log(`Warming up cache for branch ${branchId}`);

    for (const z of zoomLevels) {
      const tiles = this.getTilesInBounds(minLng, minLat, maxLng, maxLat, z);

      this.logger.log(`Zoom ${z}: Pre-generating ${tiles.length} tiles`);

      const BATCH_SIZE = 5;
      for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
        const batch = tiles.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(([x, y]) => this.getBranchTile(branchId, z, x, y)),
        );
      }
    }

    this.logger.log(`Cache warm-up complete for branch ${branchId}`);
  }

  private async isTileInBranchBounds(
    branchId: string,
    z: number,
    x: number,
    y: number,
  ): Promise<boolean> {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId },
      select: ['id', 'minLng', 'minLat', 'maxLng', 'maxLat'],
    });

    if (!branch) {
      return false;
    }

    if (
      branch.minLng === null ||
      branch.minLat === null ||
      branch.maxLng === null ||
      branch.maxLat === null
    ) {
      return true;
    }

    const tileBounds = this.tileToBounds(x, y, z);

    const intersects =
      tileBounds.minLng <= branch.maxLng &&
      tileBounds.maxLng >= branch.minLng &&
      tileBounds.minLat <= branch.maxLat &&
      tileBounds.maxLat >= branch.minLat;

    return intersects;
  }

  private tileToBounds(
    x: number,
    y: number,
    z: number,
  ): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
    const n = Math.pow(2, z);

    const minLng = (x / n) * 360 - 180;
    const maxLng = ((x + 1) / n) * 360 - 180;

    const minLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
    const maxLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));

    const minLat = (minLatRad * 180) / Math.PI;
    const maxLat = (maxLatRad * 180) / Math.PI;

    return { minLng, minLat, maxLng, maxLat };
  }

  private getTilesInBounds(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    zoom: number,
  ): [number, number][] {
    const tiles: [number, number][] = [];

    const minX = this.lngToTileX(minLng, zoom);
    const maxX = this.lngToTileX(maxLng, zoom);
    const minY = this.latToTileY(maxLat, zoom);
    const maxY = this.latToTileY(minLat, zoom);

    const MAX_TILES = 100;
    const rangeX = maxX - minX + 1;
    const rangeY = maxY - minY + 1;

    if (rangeX * rangeY > MAX_TILES) {
      this.logger.warn(
        `Tile range too large at zoom ${zoom}: ${rangeX}×${rangeY} > ${MAX_TILES}`,
      );
      return tiles;
    }

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push([x, y]);
      }
    }

    return tiles;
  }

  private lngToTileX(lng: number, zoom: number): number {
    return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  }

  private latToTileY(lat: number, zoom: number): number {
    const latRad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
        Math.pow(2, zoom),
    );
  }
}
