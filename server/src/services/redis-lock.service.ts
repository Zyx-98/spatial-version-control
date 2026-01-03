import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { LockService } from 'src/interfaces/lock-service.interface';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export class RedisLockService implements LockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async acquireLock(
    key: string,
    ttl: number = 5000,
    retryAttempts: number = 0,
    retryDelayMs: number = 100,
  ): Promise<string | null> {
    const token = `${Date.now()}-${Math.random()}`;
    let result: string | null = null;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      result = await this.redisClient.set(
        `lock:${key}`,
        token,
        'PX',
        ttl,
        'NX',
      );

      if (result === 'OK') {
        return token;
      }

      if (attempt < retryAttempts) {
        await this.delay(retryDelayMs);
      }
    }

    return null;
  }
  async releaseLock(key: string, token: string): Promise<boolean> {
    const lockKey = `lock:${key}`;

    const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then 
            return redis.call("DEL", KEYS[1]) 
        else 
            return 0 
        end
    `;

    const result = await this.redisClient.eval(script, 1, lockKey, token);

    return result === 1;
  }
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = 5000,
  ): Promise<T> {
    const token = await this.acquireLock(key, ttl, 3);

    if (!token) {
      throw new Error(`Failed to acquire lock: ${key}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(key, token);
    }
  }
}
