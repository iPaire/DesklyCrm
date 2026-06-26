// Upstash Redis rate limiter - fixed window counter via REST API.
// Requires secrets: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
// Fails open (allows request) when Redis is unavailable or not configured.

const UPSTASH_URL   = Deno.env.get('UPSTASH_REDIS_REST_URL')
const UPSTASH_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')

export interface RateLimitResult {
  allowed:   boolean
  count:     number
  remaining: number
  limit:     number
}

/**
 * Check a rate limit. Returns { allowed: true } if Redis is not configured.
 *
 * key       - unique identifier, e.g. `rl:checkout:${userId}`
 * limit     - max requests allowed per window
 * windowSec - window length in seconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return { allowed: true, count: 0, remaining: limit, limit }
  }

  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      // INCR atomically increments; EXPIRE NX sets expiry only if key is new
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, windowSec, 'NX'],
      ]),
    })

    if (!res.ok) return { allowed: true, count: 0, remaining: limit, limit }

    const results = await res.json()
    const count: number = results[0]?.result ?? 1
    const remaining = Math.max(0, limit - count)

    return { allowed: count <= limit, count, remaining, limit }
  } catch {
    return { allowed: true, count: 0, remaining: limit, limit }
  }
}

/** Standard 429 response with Retry-After header. */
export function tooManyRequests(
  message = 'Too many requests. Please try again later.',
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After':  '60',
      ...extraHeaders,
    },
  })
}
