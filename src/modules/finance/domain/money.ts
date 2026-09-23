export const USER_BPS = 8500n;

export function integer(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error('INVALID_INTEGER_AMOUNT');
}

export function allocateNet(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (total < 0n || sum <= 0n || weights.some((w) => w < 0n)) throw new Error('INVALID_ALLOCATION');
  let remaining = total;
  return weights.map((weight, i) => {
    const amount = i === weights.length - 1 ? remaining : (total * weight) / sum;
    remaining -= amount;
    return amount;
  });
}

export function splitCashback(net: bigint, bps = USER_BPS) {
  if (net < 0n || bps < 0n || bps > 10000n) throw new Error('INVALID_CASHBACK');
  const user = (net * bps) / 10000n;
  return { user, platform: net - user };
}

export function parseAttribution(content: string) {
  const parts = content.split('-');
  const [user, link, channel, tracking, product] = parts;
  const hex = /^[a-f0-9]{32}$/i;
  if (
    parts.length !== 5 ||
    !user ||
    !link ||
    !product ||
    !tracking ||
    !hex.test(user) ||
    !hex.test(link) ||
    !hex.test(product) ||
    !/^(web|ios|android)$/.test(channel ?? '') ||
    !/^bb_?[a-zA-Z0-9_]{20,32}$/.test(tracking)
  )
    throw new Error('INVALID_ATTRIBUTION');
  return { user, link, channel: channel!, tracking, product };
}
