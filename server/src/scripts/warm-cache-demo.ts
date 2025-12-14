import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TileCacheService } from '../services/tile-cache.service';
import { MvtService } from '../services/mvt.service';

async function warmCacheForDemo() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const tileCacheService = app.get(TileCacheService);
  const mvtService = app.get(MvtService);

  const branchId =
    process.env.BRANCH_ID || 'a79025b5-c7e4-47e1-905e-2a274cb02998';
  if (!branchId) {
    process.exit(1);
  }

  try {
    const bounds = await mvtService.getBranchBounds(branchId);

    if (!bounds) {
      process.exit(1);
    }

    const [minLng, minLat, maxLng, maxLat] = bounds;
    const width = maxLng - minLng;
    const height = maxLat - minLat;
    console.log(
      `Coverage: ${width.toFixed(2)}° × ${height.toFixed(2)}° (lng × lat)\n`,
    );

    const zoomLevels = [5, 6, 7, 8, 9];
    let totalTilesWarmed = 0;
    const overallStart = Date.now();

    for (const zoom of zoomLevels) {
      const tiles = getTilesInBounds(minLng, minLat, maxLng, maxLat, zoom);

      let tilesToGenerate = tiles;
      if (tiles.length > 100) {
        tilesToGenerate = tiles.slice(0, 100);
      }

      let completed = 0;
      let fromCache = 0;
      let fromDb = 0;
      let failed = 0;
      const zoomStart = Date.now();

      const BATCH_SIZE = 3;

      for (let i = 0; i < tilesToGenerate.length; i += BATCH_SIZE) {
        const batch = tilesToGenerate.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async ([x, y]) => {
            try {
              const tileStart = Date.now();
              await tileCacheService.getBranchTile(branchId, zoom, x, y);
              const duration = Date.now() - tileStart;

              if (duration < 100) {
                fromCache++;
              } else {
                fromDb++;

                if (duration > 1000) {
                  console.log(
                    `   Tile ${zoom}/${x}/${y}: ${duration}ms (slow)`,
                  );
                }
              }
            } catch (err: any) {
              failed++;
              console.error(
                `  Failed ${zoom}/${x}/${y}: ${err?.message || 'Unknown error'}`,
              );
            }
          }),
        );

        completed += batch.length;

        if (completed % 10 === 0 || completed === tilesToGenerate.length) {
          const elapsed = (Date.now() - zoomStart) / 1000;
          const rate = completed / elapsed;
          const remaining = (tilesToGenerate.length - completed) / rate;

          console.log(
            `  Progress: ${completed}/${tilesToGenerate.length} ` +
              `(${((completed / tilesToGenerate.length) * 100).toFixed(1)}%) ` +
              `| Rate: ${rate.toFixed(1)} tiles/s ` +
              `| Cache: ${fromCache} | DB: ${fromDb} | Failed: ${failed} ` +
              (remaining > 0 ? `| ETA: ${remaining.toFixed(0)}s` : ''),
          );
        }
      }

      const zoomDuration = (Date.now() - zoomStart) / 1000;
      totalTilesWarmed += completed - fromCache;

      console.log(`\nZoom ${zoom} complete:`);
      console.log(`   • Total processed: ${completed} tiles`);
      console.log(`   • From cache: ${fromCache} (already cached)`);
      console.log(`   • From database: ${fromDb} (newly generated)`);
      console.log(`   • Failed: ${failed}`);
      console.log(`   • Duration: ${zoomDuration.toFixed(1)}s`);
      console.log(
        `   • Rate: ${(completed / zoomDuration).toFixed(2)} tiles/s`,
      );
    }

    const overallDuration = (Date.now() - overallStart) / 1000;

    console.log(`\n${'='.repeat(60)}`);
    console.log('Cache Warming Complete!');
    console.log(`${'='.repeat(60)}\n`);

    console.log(`Summary:`);
    console.log(`   • Total tiles warmed: ${totalTilesWarmed}`);
    console.log(
      `   • Total duration: ${(overallDuration / 60).toFixed(1)} minutes`,
    );
    console.log(
      `   • Average rate: ${(totalTilesWarmed / overallDuration).toFixed(2)} tiles/s`,
    );

    console.log(`\nRedis Memory Usage:`);
    try {
      const store = (tileCacheService as any).cacheManager?.store;
      if (store && typeof store.getClient === 'function') {
        const client = store.getClient();
        const info: string = await client.info('memory');
        const usedMemoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
        const usedMemory = usedMemoryMatch ? usedMemoryMatch[1] : 'unknown';

        const dbSize: number = await client.dbsize();

        console.log(`   • Memory used: ${usedMemory}`);
        console.log(`   • Total keys: ${dbSize}`);
      }
    } catch (err: any) {
      console.log(
        `   • Could not fetch Redis stats: ${err?.message || 'Unknown error'}`,
      );
    }
  } catch (err) {
    console.error('\nError during cache warming:', err);
    throw err;
  } finally {
    await app.close();
  }
}

function getTilesInBounds(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  zoom: number,
): [number, number][] {
  const tiles: [number, number][] = [];

  const minX = lngToTileX(minLng, zoom);
  const maxX = lngToTileX(maxLng, zoom);
  const minY = latToTileY(maxLat, zoom);
  const maxY = latToTileY(minLat, zoom);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push([x, y]);
    }
  }

  return tiles;
}

function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
}

warmCacheForDemo()
  .then(() => {
    console.log('Exiting...\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nFatal error:', err);
    process.exit(1);
  });
