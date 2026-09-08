import { allocateNet, integer, parseAttribution, splitCashback } from './money.js';
describe('Exact finance arithmetic', () => {
  it('does not coerce unsafe numbers or fractional VND', () => {
    expect(integer('9007199254740993')).toBe(9007199254740993n);
    expect(() => integer(Number('9007199254740993'))).toThrow();
    expect(() => integer('1.5')).toThrow();
  });
  it('allocates all settlement VND and assigns remainder deterministically', () => {
    expect(allocateNet(10n, [1n,1n,1n])).toEqual([3n,3n,4n]);
    const split = splitCashback(1553n);
    expect(split).toEqual({ user: 1320n, platform: 233n });
    expect(split.user + split.platform).toBe(1553n);
  });
  it('rejects missing, malformed, or extra attribution segments', () => {
    for (const s of ['----', 'anything', 'a-b-web-c-d-extra']) expect(() => parseAttribution(s)).toThrow();
    const id = 'a'.repeat(32);
    expect(parseAttribution([id,id,'web','bb_' + id,id].join('-')).link).toBe(id);
  });
});
