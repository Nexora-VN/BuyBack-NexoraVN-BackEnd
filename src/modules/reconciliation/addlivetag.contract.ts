import { z } from 'zod';
import { parse, isLosslessNumber } from 'lossless-json';

const amount = z.string().regex(/^\d{1,18}$/);
const count = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((v) => Number.isSafeInteger(v) && v <= 2147483647);
export const conversionItem = z.object({
  purchase_time: count,
  click_time: count,
  checkout_id: z.string().min(1).max(100),
  order_sn: z.string().min(1).max(100),
  status: z.string(),
  status_code: z.string(),
  commission_status: z.string(),
  affiliate: z.string(),
  item_name: z.string(),
  image: z.string(),
  item_url: z.string(),
  price: amount,
  qty: count,
  order_value: amount,
  commission: amount,
  mcn_fee: amount,
  utm: z.string(),
  sub_id1: z.string(),
});
export type ConversionItem = z.infer<typeof conversionItem>;
export const conversionEnvelope = z.object({
  ok: z.literal(true),
  meta: z.object({ type: z.literal('items'), page: count, page_size: count, total: count }),
  summary: z.object({ estimated_total_commission: amount }).catchall(z.unknown()),
  data: z.array(conversionItem),
});
export function decodeAddLiveTag(text: string) {
  return conversionEnvelope.parse(
    parse(text, (_key: string, value: unknown) => (isLosslessNumber(value) ? value.value : value)),
  );
}
export const providerInput = z.object({
  accountId: z.string().regex(/^\d{1,30}$/),
  expectedAffiliate: z.string().trim().min(1).max(150),
});
export const verificationInput = z.object({
  version: z.number().int().positive(),
  evidence: z.string().trim().min(10).max(2000),
});
export const reviewInput = z.object({
  action: z.enum(['APPROVE', 'EXCLUDE']),
  affiliateLinkId: z.uuid().optional(),
  acceptedAmountVnd: amount.optional(),
  revision: z.number().int().positive(),
  evidence: z.string().trim().min(10).max(2000),
});
// Provider is explicitly account-qualified to preserve existing provider+externalId unique keys.
export const providerScope = (accountId: string) => `ADDLIVETAG:${accountId}`;

export const syncRangeInput = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  })
  .refine((v) => {
    const s = Date.parse(v.startDate);
    const e = Date.parse(v.endDate);
    return !Number.isNaN(s) && !Number.isNaN(e) && e >= s;
  }, 'Valid date range required where endDate >= startDate');

export function splitDateRange(
  startDate: string,
  endDate: string,
  maxDays = 90,
): Array<{ startDate: string; endDate: string }> {
  const result: Array<{ startDate: string; endDate: string }> = [];
  let currentStart = new Date(startDate + 'T00:00:00Z');
  const finalEnd = new Date(endDate + 'T00:00:00Z');
  if (currentStart > finalEnd) throw new Error('INVALID_DATE_RANGE');
  while (currentStart <= finalEnd) {
    const chunkEnd = new Date(currentStart);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + (maxDays - 1));
    const effectiveEnd = chunkEnd < finalEnd ? chunkEnd : finalEnd;
    result.push({
      startDate: currentStart.toISOString().slice(0, 10),
      endDate: effectiveEnd.toISOString().slice(0, 10),
    });
    currentStart = new Date(effectiveEnd);
    currentStart.setUTCDate(currentStart.getUTCDate() + 1);
  }
  return result;
}
