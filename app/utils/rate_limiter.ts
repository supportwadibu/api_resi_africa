export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  /** Secondes avant l'ouverture d'une nouvelle fenêtre. */
  retryAfterSeconds: number
}

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Compteur à fenêtre fixe, en mémoire.
 *
 * En mémoire plutôt qu'en RTDB ou Firestore : une lecture distante par requête
 * doublerait le coût de chaque appel, et l'objectif est d'amortir une rafale,
 * pas de tenir un quota exact. Chaque instance compte pour elle-même — avec N
 * instances, le plafond effectif est N fois la valeur déclarée. Les quotas qui
 * doivent tenir entre instances (tentatives de connexion, envois d'OTP par
 * cible) restent en RTDB, dans `assertRateLimit`.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>()
  private nextSweepAt = 0

  constructor(private sweepIntervalMs = 60_000) {}

  hit(key: string, max: number, windowMs: number, now: number = Date.now()): RateLimitResult {
    this.sweep(now)

    let bucket = this.buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      this.buckets.set(key, bucket)
    }

    bucket.count += 1
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))

    return {
      allowed: bucket.count <= max,
      limit: max,
      remaining: Math.max(0, max - bucket.count),
      retryAfterSeconds,
    }
  }

  /** Nombre de compteurs vivants, pour les tests. */
  get size(): number {
    return this.buckets.size
  }

  /**
   * Purge des fenêtres échues, au fil des appels plutôt que par minuterie :
   * un `setInterval` garderait le processus en vie à l'arrêt et pendant les
   * tests. Sans purge, chaque IP vue une fois resterait en mémoire.
   */
  private sweep(now: number): void {
    if (now < this.nextSweepAt) return
    this.nextSweepAt = now + this.sweepIntervalMs

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key)
    }
  }
}
