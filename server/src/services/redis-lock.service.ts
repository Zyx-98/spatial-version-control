import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { LockService } from 'src/interfaces/lock-service.interface';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export class RedisLockService implements LockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  async acquireLock(key: string, ttl: number = 5000): Promise<string | null> {
    const token = `${Date.now()}-${Math.random()}`;

    const result = await this.redisClient.set(
      `lock:${key}`,
      token,
      'PX',
      ttl,
      'NX',
    );

    return result === 'OK' ? token : null;
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
    const token = await this.acquireLock(key, ttl);

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
