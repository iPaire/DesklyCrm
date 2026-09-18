// Supabase Edge Functions run on Deno and read secrets via `Deno.env.get(...)`
// at module load time. This stub lets those modules import cleanly under
// Vitest/Node so their business logic (not the Deno runtime itself) can be
// unit tested.
;(globalThis as any).Deno ??= {
  env: { get: (_key: string) => 'test-value' },
}
