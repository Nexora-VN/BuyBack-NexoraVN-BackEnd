import pg from 'pg';
import crypto from 'node:crypto';

const client = new pg.Client({
  connectionString: 'postgresql://amdteam:12345x@X@pg-nexoravn-dev.postgres.database.azure.com:5432/nexoravn_dev?sslmode=require',
});

function decrypt(row, context) {
  const key = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(row.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  return decipher.update(row.ciphertext, 'base64', 'utf8') + decipher.final('utf8');
}

async function run() {
  await client.connect();
  const res = await client.query('SELECT * FROM aff.provider_credentials WHERE id = $1', ['ADDLIVETAG']);
  if (res.rows.length) {
    const apiKey = decrypt(res.rows[0], 'provider:ADDLIVETAG');
    console.log('KEY EXISTS, LENGTH:', apiKey.length);
    
    // 1. Fetch with account_id = 420
    const url420 = `https://addlivetag.com/api/v1/conversions.php?api_key=${apiKey}&type=items&account_id=420&from=2026-01-01&to=2026-09-08`;
    const resp420 = await fetch(url420);
    const data420 = await resp420.json();
    console.log('RESULT WITH account_id=420:', {
      ok: data420.ok,
      meta: data420.meta,
      summary: data420.summary,
      itemCount: data420.data?.length,
    });

    // 2. Fetch with account_id = 17303170528 (currently in DB)
    const urlOld = `https://addlivetag.com/api/v1/conversions.php?api_key=${apiKey}&type=items&account_id=17303170528&from=2026-01-01&to=2026-09-08`;
    const respOld = await fetch(urlOld);
    const dataOld = await respOld.json();
    console.log('RESULT WITH account_id=17303170528 (in DB):', {
      ok: dataOld.ok,
      meta: dataOld.meta,
      summary: dataOld.summary,
      itemCount: dataOld.data?.length,
    });

    // 3. Test 90-day chunk with account_id = 420:
    // Chunk A: 2026-01-01 to 2026-03-31
    const urlChunkA = `https://addlivetag.com/api/v1/conversions.php?api_key=${apiKey}&type=items&account_id=420&from=2026-01-01&to=2026-03-31`;
    const respChunkA = await fetch(urlChunkA);
    const dataChunkA = await respChunkA.json();
    console.log('CHUNK A (2026-01-01 to 2026-03-31):', {
      total: dataChunkA.meta?.total,
      itemCount: dataChunkA.data?.length,
      estimated_total_commission: dataChunkA.summary?.estimated_total_commission,
    });

    // Chunk B: 2026-04-01 to 2026-06-29
    const urlChunkB = `https://addlivetag.com/api/v1/conversions.php?api_key=${apiKey}&type=items&account_id=420&from=2026-04-01&to=2026-06-29`;
    const respChunkB = await fetch(urlChunkB);
    const dataChunkB = await respChunkB.json();
    console.log('CHUNK B (2026-04-01 to 2026-06-29):', {
      total: dataChunkB.meta?.total,
      itemCount: dataChunkB.data?.length,
      estimated_total_commission: dataChunkB.summary?.estimated_total_commission,
    });

    // Chunk C: 2026-06-30 to 2026-09-08
    const urlChunkC = `https://addlivetag.com/api/v1/conversions.php?api_key=${apiKey}&type=items&account_id=420&from=2026-06-30&to=2026-09-08`;
    const respChunkC = await fetch(urlChunkC);
    const dataChunkC = await respChunkC.json();
    console.log('CHUNK C (2026-06-30 to 2026-09-08):', {
      total: dataChunkC.meta?.total,
      itemCount: dataChunkC.data?.length,
      estimated_total_commission: dataChunkC.summary?.estimated_total_commission,
    });
  }
  await client.end();
}
run().catch(e => console.error(e));
