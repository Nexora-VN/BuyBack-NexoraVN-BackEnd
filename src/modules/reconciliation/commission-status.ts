/** Order completion is not proof of commission payment. Only explicitly verified
 * provider labels configured by the operator can qualify for settlement.
 * Keep the default empty until a paid AddLiveTag payload has been verified.
 */
export function commissionPaymentState(
  status: string,
): 'PENDING' | 'REJECTED' | 'PAID' | 'UNKNOWN' {
  const label = status.trim().normalize('NFC');
  if (label === 'Chờ trả hoa hồng' || label === 'Chưa chốt') return 'PENDING';
  if (label === 'Không hợp lệ') return 'REJECTED';
  const verifiedPaidLabels = (process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES ?? '')
    .split('|')
    .map((value) => value.trim().normalize('NFC'))
    .filter(Boolean);
  return verifiedPaidLabels.includes(label) ? 'PAID' : 'UNKNOWN';
}

export function paymentBlockers(payload: unknown): string[] {
  if (!Array.isArray(payload) || !payload.length) return ['MISSING_PROVIDER_ITEMS'];
  const blockers = new Set<string>();
  let completed = 0;
  for (const value of payload) {
    if (!value || typeof value !== 'object') {
      blockers.add('INVALID_PROVIDER_ITEM');
      continue;
    }
    const row = value as Record<string, unknown>;
    if (row.status_code === 'cancelled') {
      if (String(row.commission) !== '0') blockers.add('CANCELLED_WITH_COMMISSION');
      continue;
    }
    if (row.status_code !== 'completed' && row.status_code !== 'paid') {
      blockers.add('UNKNOWN_PROVIDER_STATUS');
      continue;
    }
    completed++;
    const state =
      typeof row.commission_status === 'string'
        ? commissionPaymentState(row.commission_status)
        : 'UNKNOWN';
    if (state !== 'PAID') blockers.add(`PROVIDER_COMMISSION_${state}`);
  }
  if (!completed) blockers.add('NO_COMPLETED_ITEMS');
  return [...blockers];
}
