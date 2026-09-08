import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

export const money = z.string().regex(/^\d{1,18}$/);
export const reason = z.string().trim().min(5).max(1000);
export const key = z.string().trim().min(8).max(150);
export const bankInput = z.object({
  bankCode: z.string().trim().min(2).max(20),
  bankName: z.string().trim().min(2).max(100),
  bankBranch: z.string().trim().max(100).optional(),
  accountHolder: z.string().trim().min(2).max(120),
  accountNumber: z.string().regex(/^[0-9]{6,30}$/),
});
export const settlementInput = z.object({
  reference: z.string().trim().min(5).max(150),
  commissionIds: z.array(z.uuid()).min(1).max(500).refine(a => new Set(a).size === a.length, 'Duplicate commissions'),
  grossVnd: money, deductionVnd: money, netVnd: money,
});
export const withdrawalInput = z.object({ bankId: z.uuid(), amount: money, idempotencyKey: key });
export const withdrawalStatusInput = z.object({
  status: z.enum(['PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED']),
  reason, transferReference: z.string().trim().min(3).max(150).optional(),
}).refine(v => v.status !== 'COMPLETED' || !!v.transferReference, 'Transfer reference required');
export const adjustmentInput = z.object({
  userId: z.uuid(), amount: z.string().regex(/^-?\d{1,18}$/).refine(v => { try { return BigInt(v) !== 0n; } catch { return false; } }),
  reason, idempotencyKey: key,
});
export const listInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().max(50).optional(),
  search: z.string().trim().max(150).optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
});
export type ListInput = z.infer<typeof listInput>;
export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  return parsed.data;
}
@Injectable()
export class SchemaPipe<T> implements PipeTransform {
  constructor(private readonly schema: z.ZodType<T>) {}
  transform(value: unknown): T { return validate(this.schema, value); }
}
