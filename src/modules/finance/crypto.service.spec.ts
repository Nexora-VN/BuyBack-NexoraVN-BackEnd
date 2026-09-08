import { ConfigService } from '@nestjs/config';
import { FinanceCrypto } from './crypto.service.js';
describe('Finance credential encryption', () => {
  const crypto = new FinanceCrypto(new ConfigService({ FINANCE_ENCRYPTION_KEY: 'a'.repeat(64) }));
  it('round trips with fresh IV and rejects wrong context or tampering', () => {
    const one = crypto.encrypt('cookie-value','provider:SAFFI');
    const two = crypto.encrypt('cookie-value','provider:SAFFI');
    expect(one.ciphertext).not.toContain('cookie-value');
    expect(one.iv).not.toBe(two.iv);
    expect(crypto.decrypt(one,'provider:SAFFI')).toBe('cookie-value');
    expect(() => crypto.decrypt(one,'bank:1')).toThrow();
    expect(() => crypto.decrypt({...one, tag:Buffer.alloc(16).toString('base64')},'provider:SAFFI')).toThrow();
  });
});
