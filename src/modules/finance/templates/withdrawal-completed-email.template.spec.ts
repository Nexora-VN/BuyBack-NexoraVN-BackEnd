import { renderWithdrawalCompletedEmail } from './withdrawal-completed-email.template.js';

describe('withdrawal completed email template', () => {
  it('renders template with complete bank and transfer details', () => {
    const email = renderWithdrawalCompletedEmail({
      userName: 'Nguyen Van An',
      amount: 150000n,
      bankName: 'Vietcombank',
      accountHolder: 'NGUYEN VAN AN',
      accountNumberMasked: '•••• 8901',
      transferReference: 'FT2629391039',
      completedAt: new Date('2026-10-20T04:00:00Z'),
    });

    expect(email.subject).toContain('150.000');
    expect(email.subject).toContain('Rút tiền thành công');
    expect(email.text).toContain('Nguyen Van An');
    expect(email.text).toContain('150.000');
    expect(email.text).toContain('Vietcombank');
    expect(email.text).toContain('FT2629391039');
    expect(email.html).toContain('Nguyen Van An');
    expect(email.html).toContain('Vietcombank');
    expect(email.html).toContain('•••• 8901');
    expect(email.html).toContain('FT2629391039');
  });

  it('escapes user and bank input to prevent HTML injection', () => {
    const email = renderWithdrawalCompletedEmail({
      userName: '<img src=x onerror=alert(1)>',
      amount: 50000n,
      bankName: '<b>Bank</b>',
      accountHolder: 'User & Co',
      transferReference: 'Ref <test>',
    });

    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('&lt;img');
    expect(email.html).toContain('&lt;b&gt;Bank&lt;/b&gt;');
    expect(email.html).toContain('User &amp; Co');
    expect(email.html).toContain('Ref &lt;test&gt;');
  });
});
