const MINUTE = 60_000;

/** Requests per minute. Single-instance, in-memory; ~20 concurrent users expected. */
export const RATE_LIMITS = {
  default: { limit: 120, ttl: MINUTE },
  login: { limit: 10, ttl: MINUTE },
  authSession: { limit: 30, ttl: MINUTE },
  generateLink: { limit: 100, ttl: MINUTE },
  productLookup: { limit: 100, ttl: MINUTE },
  sync: { limit: 60, ttl: MINUTE },
  financeWrite: { limit: 20, ttl: MINUTE },
} as const;
