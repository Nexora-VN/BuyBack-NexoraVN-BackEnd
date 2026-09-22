// Run only against the named disposable database; no production mock switches.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import pg from 'pg';
import argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
const dbUrl = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (!['127.0.0.1', 'localhost'].includes(dbUrl.hostname) || dbUrl.pathname !== '/nexora_readiness_test') throw new Error('Requires isolated local nexora_readiness_test database');
Object.assign(process.env, { NODE_ENV: 'test', PORT: '8080', LOG_LEVEL: 'silent', SWAGGER_ENABLED: 'false', CORS_ORIGINS: 'http://localhost:3001', JWT_ACCESS_SECRET: 'benchmark-access-secret-32-characters-minimum', JWT_REFRESH_SECRET: 'benchmark-refresh-secret-32-characters-minimum', JWT_ISSUER: 'benchmark', JWT_AUDIENCE: 'benchmark', SHOPEE_AFFILIATE_ID: '123456', RECONCILIATION_ENABLED: 'false', SETTLEMENT_ENABLED: 'false', WITHDRAWALS_ENABLED: 'false', ADDLIVETAG_API_KEY: 'benchmark-key-not-live' });
const root = resolve(process.argv[2] ?? 'dist');
const load = (file) => import(pathToFileURL(resolve(root, file)).href);
const { PrismaService } = await load('infrastructure/database/prisma/prisma.service.js');
const db = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
const userId = '00000000-0000-4000-8000-000000000001';
const password = 'Benchmark-only-password-2026!';
await db.user.upsert({ where: { id: userId }, create: { id: userId, email: 'benchmark@example.test', phoneNumber: '+84000000000', passwordHash: await argon2.hash(password), role: 'SUPER_ADMIN', status: 'ACTIVE' }, update: {} });
const product = { shopId: 1675140528n, productName: 'Benchmark product', shopName: 'Benchmark shop', originLink: 'https://shopee.vn/product/1675140528/51011334892', productLink: 'https://shopee.vn/product/1675140528/51011334892', imageUrl: 'https://cf.shopee.vn/file/test', price: 142800n, sales: 793, rating: '4.80', commission: 17136n, sellerComFinal: 11424n, shoppeComFinal: 5712n, sellerRate: 800, shopeeRate: 400, sellerRatePercent: 800, shopeeRatePercent: 400, totalRatePercent: 1200, isExtra: true, hasSellerCommission: true, hasShopeeCommission: true, isCapped: false, isLimitCap: false, cap: 40000n, capRow: 40000n, capAfterRate: 40000n, lastUpdate: new Date('2026-09-22T00:00:00Z') };
if (await db.product.count() === 0) {
 for(let start=0;start<10000;start+=1000) await db.product.createMany({data:Array.from({length:1000},(_,i)=>({...product,id:randomUUID(),itemId:51011334892n+BigInt(start+i)}))});
 const products = await db.product.findMany({select:{id:true}});
 for(let start=0;start<50000;start+=1000) await db.affiliateLink.createMany({data:Array.from({length:1000},(_,i)=>({id:randomUUID(),userId,productId:products[(start+i)%products.length].id,originLink:product.originLink,cleanLink:product.originLink,convertOrigin:'SYSTEM',affiliateLinkStatus:'WORKING',fullLinkSystem:'https://s.shopee.vn/benchmark'}))});
 for(let start=0;start<10000;start+=1000) {
  const rows=Array.from({length:1000},(_,i)=>({id:randomUUID(),provider:'ADDLIVETAG:benchmark',accountId:'benchmark',checkoutId:`benchmark-${start+i}`,affiliateId:'123456',utmContent:'benchmark',conversionState:'Completed',rawStatus:'Completed',netRaw:100000n,payload:{},purchasedAt:new Date('2026-09-22T00:00:00Z')}));
  await db.providerCheckout.createMany({data:rows});
  await db.commission.createMany({data:rows.map(r=>({checkoutId:r.id,userId,rawAmount:100000n,estimatedVnd:1000n,state:'VALIDATED'}))});
 }
}
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL }); await sql.connect();
await sql.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
const nativeFetch = global.fetch;
const fixture = JSON.parse(readFileSync(new URL('./product-provider.json', import.meta.url), 'utf8'));
global.fetch = async (input,init) => {
 const url = String(input);
 if (url.includes('data.addlivetag.com/product-data/')) { await new Promise(r=>setTimeout(r,200)); return new Response(JSON.stringify(fixture),{headers:{'content-type':'application/json'}}); }
 if (url.includes('addlivetag.com/short-link.php')) { await new Promise(r=>setTimeout(r,200)); return new Response(JSON.stringify({success:true,affiliateLink:'https://s.shopee.vn/benchmark'}),{headers:{'content-type':'application/json'}}); }
 if (!url.startsWith('http://127.0.0.1:')) throw new Error('Benchmark blocked external request');
 return nativeFetch(input,init);
};
const { bootstrap } = await load('main.js');
const app=await bootstrap(); await app.listen(0,'127.0.0.1'); const base=await app.getUrl();
const login=await nativeFetch(`${base}/api/v1/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'benchmark@example.test',password})});
const auth=await login.json(); if(!auth.accessToken) throw new Error('Benchmark login failed');
const headers={authorization:`Bearer ${auth.accessToken}`,'content-type':'application/json'};
const paths=['/products?page=1&limit=20','/affiliate?page=1&limit=20','/admin/finance/dashboard','/admin/finance/commissions?page=1&limit=20'];
// Detect route/config failures before spending the load-test window.
for(const path of paths){const r=await nativeFetch(base+'/api/v1'+path,{headers});if(!r.ok)throw new Error(`Probe ${path}: ${r.status}`);await r.arrayBuffer();}
const metrics={read:[],generate:[]};let errors=0, maxRss=0;
async function phase(duration,collect){const until=Date.now()+duration;await Promise.all(Array.from({length:60},(_,worker)=>(async()=>{let n=worker;while(Date.now()<until){const generate=worker>=50;const start=performance.now();try{const r=await nativeFetch(base+'/api/v1'+(generate?'/generate-affiliate':paths[n++%paths.length]),{method:generate?'POST':'GET',headers,...(generate?{body:JSON.stringify({url:product.originLink})}:{})});const result=await r.json();if(!r.ok||(generate&&!result.link))errors++;}catch{errors++;}if(collect)metrics[generate?'generate':'read'].push(performance.now()-start);maxRss=Math.max(maxRss,process.memoryUsage().rss);}})()));}
const warmup=Number(process.env.BENCH_WARMUP_MS??60000),duration=Number(process.env.BENCH_DURATION_MS??300000);
await phase(warmup,false);errors=0;await sql.query('SELECT pg_stat_statements_reset()');const cpu=process.cpuUsage();const start=performance.now();await phase(duration,true);const elapsed=performance.now()-start;const usage=process.cpuUsage(cpu);
const calls=await sql.query("SELECT sum(calls)::bigint AS calls FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query NOT LIKE '%pg_stat_statements%'");
const stats=values=>{values.sort((a,b)=>a-b);return{requests:values.length,p50:values[Math.floor(values.length*.50)],p95:values[Math.floor(values.length*.95)],p99:values[Math.floor(values.length*.99)],rps:values.length/(elapsed/1000)}};
const result={root,environment:{node:process.version,platform:os.platform(),arch:os.arch(),cpus:os.cpus().length},warmupMs:warmup,durationMs:elapsed,concurrency:{read:50,generate:10},seed:{products:10000,links:50000,commissions:10000},read:stats(metrics.read),generate:stats(metrics.generate),errors,sqlCalls:Number(calls.rows[0].calls),cpuMs:{user:usage.user/1000,system:usage.system/1000},maxRssMB:maxRss/1024/1024,note:'Same host, API and HTTP driver in one process; CPU/RAM include driver. Providers mocked at 200ms each.'};
writeFileSync(process.argv[3]??'/tmp/nexora-benchmark.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
await app.close();await db.$disconnect();await sql.end();
