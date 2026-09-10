import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class FinanceCrypto {
  constructor(private readonly config: ConfigService) {}
  private key() {
    const key = this.config.get<string>('FINANCE_ENCRYPTION_KEY');
    if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
      throw new ServiceUnavailableException('FINANCE_ENCRYPTION_KEY_NOT_CONFIGURED');
    return Buffer.from(key, 'hex');
  }
  encrypt(value: string, context: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }
  decrypt(value: { ciphertext: string; iv: string; tag: string }, context: string) {
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(value.iv, 'base64'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
