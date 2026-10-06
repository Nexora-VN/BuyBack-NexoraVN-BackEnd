import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import type { AuthRepository } from '../repositories/auth.repository.js';
import { AuthService } from './auth.service.js';

describe('Google ID token login', () => {
  const repository = { findUserByEmail: jest.fn(), createOAuthUser: jest.fn() };
  const config = {
    get: jest.fn((key: string): string | undefined =>
      key === 'GOOGLE_OAUTH_CLIENT_IDS' ? 'web-client-id,mobile-client-id' : undefined,
    ),
  };
  const service = new AuthService(
    repository as unknown as AuthRepository,
    {} as JwtService,
    config as unknown as ConfigService,
  );

  afterEach(() => jest.restoreAllMocks());

  it('passes the configured audiences to the Google verifier', async () => {
    const verify = jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(() => Promise.reject(new Error('invalid audience')));
    await expect(service.loginWithGoogle({ idToken: 'invalid' }, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).toHaveBeenCalledWith({
      idToken: 'invalid',
      audience: ['web-client-id', 'mobile-client-id'],
    });
    expect(repository.findUserByEmail).not.toHaveBeenCalled();
  });

  it('rejects ID-token-only login when client IDs are not configured', async () => {
    config.get.mockReturnValueOnce('');
    const verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
    await expect(service.loginWithGoogle({ idToken: 'token' }, {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
    expect(repository.findUserByEmail).not.toHaveBeenCalled();
  });
});
