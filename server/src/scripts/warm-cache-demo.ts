import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TileCacheService } from '../services/tile-cache.service';
import { MvtService } from '../services/mvt.service';

async function warmCacheForDemo() {
  console.log('🚀 Starting cache warming for M1 16GB demo...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const tileCacheService = app.get(TileCacheService);
  const mvtService = app.get(MvtService);

  const branchId = process.env.BRANCH_ID || 'a79025b5-c7e4-47e1-905e-2a274cb02998';
  if (!branchId) {
    console.error('Error: Please set BRANCH_ID environment variable');
    console.error('   Example: BRANCH_ID=abc-123-def npm run warm-cache');
    process.exit(1);
  }

  console.log(`Branch ID: ${branchId}`);

  try {
    // Get bounds
    console.log('Fetching branch bounds...');
    const bounds = await mvtService.getBranchBounds(branchId);

    if (!bounds) {
      console.error('Error: No bounds found for branch');
      console.error(
        '   This branch might be empty or have no valid geometries',
      );
      process.exit(1);
    }

    const [minLng, minLat, maxLng, maxLat] = bounds;
    console.log(
      `Bounds: [${minLng.toFixed(2)}, ${minLat.toFixed(2)}, ${maxLng.toFixed(2)}, ${maxLat.toFixed(2)}]\n`,
    );

    // Calculate coverage area
    const width = maxLng - minLng;
    const height = maxLat - minLat;
    console.log(
      `Coverage: ${width.toFixed(2)}° × ${height.toFixed(2)}° (lng × lat)\n`,
    );

    // STRATEGY FOR M1 16GB: Only warm essential tiles
    // - Zoom 5-9 (overview to city level)
    // - Skip zoom 0-4 (too few tiles, low value)
    // - Skip zoom 10+ (too many tiles, generated on-demand)

    const zoomLevels = [5, 6, 7, 8, 9];
    let totalTilesWarmed = 0;
    const overallStart = Date.now();

    for (const zoom of zoomLevels) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Warming Zoom Level ${zoom}`);
      console.log(`${'='.repeat(60)}\n`);

      const tiles = getTilesInBounds(minLng, minLat, maxLng, maxLat, zoom);
      console.log(`Total tiles at zoom ${zoom}: ${tiles.length}`);

      // SAFETY LIMIT for local demo (M1 16GB)
      let tilesToGenerate = tiles;
      if (tiles.length > 100) {
        console.log(` Limiting to 100 tiles for M1 16GB safety`);
        tilesToGenerate = tiles.slice(0, 100);
      }

      let completed = 0;
      let fromCache = 0;
      let fromDb = 0;
      let failed = 0;
      const zoomStart = Date.now();

      // Generate tiles in small batches (M1-friendly)
      const BATCH_SIZE = 3; // Conservative for M1 16GB

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
              console.error(`  Failed ${zoom}/${x}/${y}: ${err?.message || 'Unknown error'}`);
            }
          }),
        );

        completed += batch.length;

        // Progress update every 10 tiles
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
      totalTilesWarmed += completed - fromCache; // Don't count already-cached tiles

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

    // Check Redis memory usage
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
      console.log(`   • Could not fetch Redis stats: ${err?.message || 'Unknown error'}`);
    }

    console.log(
      `\nDemo cache is ready! Open your map to see the speed improvement.\n`,
    );
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
