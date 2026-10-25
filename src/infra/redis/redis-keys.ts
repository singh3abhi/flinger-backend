/**
 * Redis key builders. Every key is namespaced by deployment so UAT and production (or a developer's
 * laptop) can share one Redis safely: flinger:{env}:{...parts}. Keys always carry a TTL unless they
 * are rebuildable sets (see docs/03-data-model.md section 6).
 */
export function redisKey(env: string, ...parts: Array<string | number>): string {
  return ['flinger', env, ...parts].join(':');
}
