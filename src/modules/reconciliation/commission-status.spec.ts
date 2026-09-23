import { commissionPaymentState, paymentBlockers } from './commission-status.js';
describe('AddLiveTag commission payment semantics', () => {
  const original = process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES;
  beforeEach(() => {
    delete process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES;
    else process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES = original;
  });
  it('never infers payment from completed or an unverified label', () => {
    expect(commissionPaymentState('Chờ trả hoa hồng')).toBe('PENDING');
    expect(commissionPaymentState('Không hợp lệ')).toBe('REJECTED');
    expect(commissionPaymentState('paid')).toBe('UNKNOWN');
    expect(
      paymentBlockers([{ status_code: 'completed', commission_status: 'Chờ trả hoa hồng' }]),
    ).toContain('PROVIDER_COMMISSION_PENDING');
    expect(
      paymentBlockers([{ status_code: 'paid', commission_status: 'Chưa chốt' }]),
    ).toContain('PROVIDER_COMMISSION_PENDING');
  });
  it('does not let configuration override the two known unpaid statuses', () => {
    process.env.ADDLIVETAG_PAID_COMMISSION_STATUSES = 'Chờ trả hoa hồng|Không hợp lệ';
    expect(commissionPaymentState('Chờ trả hoa hồng')).toBe('PENDING');
    expect(commissionPaymentState('Không hợp lệ')).toBe('REJECTED');
  });
  it('requires provider items and excludes cancelled commissions', () => {
    expect(paymentBlockers(null)).toContain('MISSING_PROVIDER_ITEMS');
    expect(
      paymentBlockers([
        { status_code: 'cancelled', commission: '0', commission_status: 'Chờ trả hoa hồng' },
      ]),
    ).toContain('NO_COMPLETED_ITEMS');
    expect(paymentBlockers([{ status_code: 'cancelled', commission: '10' }])).toContain(
      'CANCELLED_WITH_COMMISSION',
    );
  });
});
