import { readFileSync } from 'node:fs';
import { checkoutSchema, conversionState, decodeProvider, envelopeSchema, syncInput } from './saffi.contract.js';
import { SaffiClient } from './saffi.client.js';
describe('Saffi report contract', () => {
  it('parses real Pending, Cancelled, Completed and fraud records without losing integers', () => {
    const data = envelopeSchema.parse(decodeProvider(readFileSync('test/fixtures/saffi-conversions.json','utf8')));
    const records = data.data.list.map(row => checkoutSchema.parse(row));
    expect(records.map(conversionState)).toEqual(['PENDING','REJECTED','REJECTED','VALIDATED','REJECTED']);
    expect(records[0]?.affiliate_net_commission).toBe('155317500');
    expect(decodeProvider('{"amount":9007199254740993}')).toEqual({ amount: '9007199254740993' });
  });
  it('does not use buyer PAID as commission paid', () => {
    const raw = envelopeSchema.parse(decodeProvider(readFileSync('test/fixtures/saffi-conversions.json','utf8')));
    const first = checkoutSchema.parse(raw.data.list[0]);
    expect(first.orders[0]?.order_status).toBe('PAID');
    expect(conversionState(first)).toBe('PENDING');
  });
  it('validates real calendar dates and the 90-day maximum', () => {
    expect(syncInput.safeParse({ startDate:'2026-02-30',endDate:'2026-03-01' }).success).toBe(false);
    expect(syncInput.safeParse({ startDate:'2026-01-01',endDate:'2026-06-01' }).success).toBe(false);
  });
});
describe('Saffi client failure handling', () => {
  afterEach(() => jest.restoreAllMocks());
  it('does not retry expired cookies or leak request secrets', async () => {
    const fetcher = jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response('forbidden',{status:403}));
    await expect(new SaffiClient().report('secret-cookie','2026-09-01','2026-09-01',1)).rejects.toThrow('PROVIDER_AUTH_EXPIRED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects business errors even on HTTP 200', async () => {
    jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({code:1,msg:'bad',data:{page_num:1,page_size:100,total_count:0,list:[]}})));
    await expect(new SaffiClient().report('cookie','2026-09-01','2026-09-01',1)).rejects.toThrow('PROVIDER_REJECTED_REQUEST');
  });
  it('retries a transient HTTP error', async () => {
    jest.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response('',{status:503})).mockResolvedValueOnce(new Response(JSON.stringify({code:0,msg:'ok',data:{page_num:1,page_size:100,total_count:0,list:[]}})));
    expect((await new SaffiClient().report('cookie','2026-09-01','2026-09-01',1)).report.total_count).toBe(0);
  });
});
