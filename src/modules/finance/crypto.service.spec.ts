import { ConfigService } from '@nestjs/config';
import { FinanceCrypto } from './crypto.service.js';
describe('Finance bank account encryption', () => {
  const crypto = new FinanceCrypto(new ConfigService({ FINANCE_ENCRYPTION_KEY: 'a'.repeat(64) }));
  it('round trips with fresh IV and rejects wrong context or tampering', () => {
    const one = crypto.encrypt('012345678901', 'bank:test-account');
    const two = crypto.encrypt('012345678901', 'bank:test-account');
    expect(one.ciphertext).not.toContain('012345678901');
    expect(one.iv).not.toBe(two.iv);
    expect(crypto.decrypt(one, 'bank:test-account')).toBe('012345678901');
    expect(() => crypto.decrypt(one, 'bank:1')).toThrow();
    expect(() =>
      crypto.decrypt({ ...one, tag: Buffer.alloc(16).toString('base64') }, 'bank:test-account'),
    ).toThrow();
  });
});
