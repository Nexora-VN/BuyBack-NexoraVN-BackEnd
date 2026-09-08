import { z } from 'zod';
import { parse, isLosslessNumber } from 'lossless-json';

const raw = z.string().regex(/^\d+$/);
const count = raw.transform(Number).refine(v => Number.isSafeInteger(v) && v <= 2147483647);
export const itemSchema = z.object({
  item_id: raw, shop_id: raw, model_id: z.string(), promotion_id: z.string(),
  item_name: z.string(), display_item_status: z.string(), affiliate_item_status: count,
  is_fraud: count, fraud_status: count, item_price: raw, actual_amount: raw, refunded_amount: raw,
  item_commission: raw, capped_brand_commission: raw, brand_commission_rate: count, platform_commission_rate: count,
}).passthrough();
export const orderSchema = z.object({
  order_id: z.string().min(1), order_sn: z.string().min(1), affiliate_transaction_id: z.string(),
  order_status: z.string(), display_order_status: count, items: z.array(itemSchema).min(1),
}).passthrough();
export const checkoutSchema = z.object({
  checkout_id: z.string().min(1), affiliate_id: raw, utm_content: z.string(),
  purchase_time: count, checkout_status: z.string(), conversion_status: count,
  affiliate_net_commission: raw, estimated_total_commission: raw,
  gross_commission: raw, capped_commission: raw, total_brand_commission: raw,
  orders: z.array(orderSchema).min(1),
}).passthrough();
export type SaffiCheckout = z.infer<typeof checkoutSchema>;
export const envelopeSchema = z.object({
  code: count, msg: z.string(), data: z.object({
    page_num: count, page_size: count, total_count: count,
    list: z.array(z.unknown()),
  }),
});
export function decodeProvider(text: string): unknown {
  return parse(text, (_key: string, value: unknown) => isLosslessNumber(value) ? value.value : value);
}
export const syncInput = z.object({
  startDate: z.iso.date(), endDate: z.iso.date(),
}).refine(v => {
  const days = (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86400000;
  return days >= 0 && days < 90;
}, 'Date range must cover 1–90 days');

export function conversionState(checkout: SaffiCheckout) {
  const orderStates = checkout.orders.map(order => {
    if (order.display_order_status === 3) return 'REJECTED';
    if (!order.items.every(i => [1, 2, 3, 4].includes(i.affiliate_item_status))) return 'MANUAL_REVIEW';
    const rejected = order.items.filter(i => i.affiliate_item_status === 3 || i.is_fraud === 1).length;
    if (rejected === order.items.length) return 'REJECTED';
    if (rejected) return 'PARTIALLY_VALIDATED';
    if (order.display_order_status === 2 && order.items.every(i => i.affiliate_item_status === 2)) return 'VALIDATED';
    if ([1, 4].includes(order.display_order_status)) return 'PENDING';
    return 'MANUAL_REVIEW';
  });
  if (orderStates.every(s => s === 'REJECTED')) return 'REJECTED';
  if (orderStates.includes('MANUAL_REVIEW')) return 'MANUAL_REVIEW';
  if (new Set(orderStates).size > 1 || orderStates.includes('PARTIALLY_VALIDATED')) return 'PARTIALLY_VALIDATED';
  const state = orderStates[0]!;
  if (state === 'VALIDATED' && checkout.conversion_status !== 2) return 'MANUAL_REVIEW';
  return state;
}
