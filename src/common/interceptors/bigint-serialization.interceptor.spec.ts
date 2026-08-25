import { serializeBigInts } from './bigint-serialization.interceptor.js';

describe('serializeBigInts', () => {
  it('serializes nested bigint values as strings', () => {
    expect(
      serializeBigInts({
        amount: 123n,
        nested: [{ raw: 999_999_999_999_999_999n }],
      }),
    ).toEqual({
      amount: '123',
      nested: [{ raw: '999999999999999999' }],
    });
  });

  it('preserves Date instances', () => {
    const date = new Date('2026-08-25T00:00:00.000Z');
    expect(serializeBigInts({ date })).toEqual({ date });
  });
});
