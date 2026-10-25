/**
 * Minimal in-memory stand-in for the ioredis commands our services use, with a controllable clock.
 * For unit tests only; integration tests run against real Redis.
 */
export class FakeRedis {
  private readonly store = new Map<string, { value: string; expiresAt?: number }>();
  private clock = Date.now();

  advance(ms: number): void {
    this.clock += ms;
  }

  /** Everything stored right now, for assertions such as "the code is never stored". */
  dump(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of [...this.store.keys()]) {
      const entry = this.live(key);
      if (entry) out[key] = entry.value;
    }
    return out;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, mode?: 'EX', seconds?: number): Promise<'OK'> {
    this.store.set(key, {
      value,
      expiresAt: mode === 'EX' && seconds ? this.clock + seconds * 1000 : undefined,
    });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) if (this.store.delete(key)) removed += 1;
    return removed;
  }

  async incr(key: string): Promise<number> {
    const entry = this.live(key);
    const next = Number(entry?.value ?? '0') + 1;
    this.store.set(key, { value: String(next), expiresAt: entry?.expiresAt });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = this.clock + seconds * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return -2;
    if (entry.expiresAt === undefined) return -1;
    return Math.ceil((entry.expiresAt - this.clock) / 1000);
  }

  multi() {
    const ops: Array<() => Promise<unknown>> = [];
    const chain = {
      set: (key: string, value: string, mode?: 'EX', seconds?: number) => {
        ops.push(() => this.set(key, value, mode, seconds));
        return chain;
      },
      del: (...keys: string[]) => {
        ops.push(() => this.del(...keys));
        return chain;
      },
      exec: async () => {
        const results: Array<[null, unknown]> = [];
        for (const op of ops) results.push([null, await op()]);
        return results;
      },
    };
    return chain;
  }

  private live(key: string) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.clock) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }
}
