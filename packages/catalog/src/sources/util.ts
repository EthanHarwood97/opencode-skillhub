export class RateLimitError extends Error {
  constructor(readonly resetAt: string | null) {
    super(resetAt ? `rate limited until ${resetAt}` : "rate limited")
  }
}

/** Run `fn` over items with at most `limit` concurrent calls; preserves input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}
