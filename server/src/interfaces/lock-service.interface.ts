export interface LockService {
  acquireLock(key: string, ttl?: number): Promise<string | null>;
  releaseLock(key: string, token: string): Promise<boolean>;
  withLock<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T>;
}

export const LOCK_SERVICE = Symbol('LOCK_SERVICE');
