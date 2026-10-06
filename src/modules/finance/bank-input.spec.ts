import { bankInput } from './finance.contract.js';

describe('manual receiving account input', () => {
  it('accepts a bank account holder without a lookup result', () => {
    expect(bankInput.safeParse({ bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '0123456789', accountHolder: 'NGUYEN VAN A' }).success).toBe(true);
  });

  it('requires a ten-digit MoMo phone and a holder name', () => {
    const base = { bankCode: 'MOMO', bankName: 'MoMo', accountHolder: 'NGUYEN VAN A' };
    expect(bankInput.safeParse({ ...base, accountNumber: '0901234567' }).success).toBe(true);
    expect(bankInput.safeParse({ ...base, accountNumber: '123456789' }).success).toBe(false);
    expect(bankInput.safeParse({ ...base, accountNumber: '0901234567', accountHolder: '' }).success).toBe(false);
  });
});
