import { formatVnd, renderCashbackCreditedEmail } from './cashback-credited-email.template.js';

describe('cashback credited email template', () => {
  it('formats currency correctly in VND', () => {
    expect(formatVnd(50000n)).toBe('50.000 đ');
    expect(formatVnd(1250000)).toBe('1.250.000 đ');
  });

  it('renders template with single order cashback', () => {
    const email = renderCashbackCreditedEmail({
      userName: 'Thao Nguyen',
      amount: 50000n,
      creditedAt: new Date('2026-10-20T04:00:00Z'),
    });

    expect(email.subject).toContain('50.000');
    expect(email.subject).toContain('hoàn tiền đã vào ví');
    expect(email.text).toContain('Thao Nguyen');
    expect(email.text).toContain('+50.000');
    expect(email.html).toContain('Thao Nguyen');
    expect(email.html).toContain('+50.000');
    expect(email.html).toContain('https://piggyback.vn/app/wallet');
  });

  it('escapes user input to prevent HTML injection', () => {
    const email = renderCashbackCreditedEmail({
      userName: '<script>alert(1)</script>',
      amount: 25000n,
      note: '<b>test injection</b>',
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('&lt;b&gt;test injection&lt;/b&gt;');
  });

  it('displays multiple order note when orderCount > 1', () => {
    const email = renderCashbackCreditedEmail({
      amount: 100000n,
      orderCount: 3,
    });

    expect(email.text).toContain('từ 3 đơn hàng');
    expect(email.html).toContain('từ 3 đơn hàng');
  });
});
