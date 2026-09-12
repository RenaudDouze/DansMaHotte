// Test-only stand-in for the `cloudflare:workers` built-in module, which
// only exists inside workerd. Aliased in vitest.config.ts so that files
// importing `DurableObject` from it (listRoom.ts) can be loaded under plain
// Node for unit tests that never actually instantiate a real Durable
// Object (see worker/index.test.ts). Never used by the real build — Vite
// only applies this alias while running tests.
export class DurableObject<Env = unknown> {
  ctx: unknown;
  env: Env;

  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
