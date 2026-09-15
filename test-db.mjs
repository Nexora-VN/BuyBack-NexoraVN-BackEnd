import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://amdteam:12345x@X@pg-nexoravn-dev.postgres.database.azure.com:5432/nexoravn_dev?sslmode=require',
});

async function run() {
  try {
    await client.connect();
    console.log('CONNECTED TO DB');
    
    // Check credentials
    const creds = await client.query('SELECT id, version, status, account_id, expected_affiliate, verified_at FROM aff.provider_credentials');
    console.log('CREDENTIALS:', creds.rows);

    // Check batches
    const batches = await client.query('SELECT id, start_date, end_date, status, records, failed_records, error_code, provider, account_id, created_at FROM aff.reconciliation_batches ORDER BY created_at DESC LIMIT 10');
    console.log('BATCHES:', batches.rows);

    // Check issues
    const issues = await client.query('SELECT id, batch_id, checkout_id, type, severity, status, created_at FROM aff.reconciliation_issues ORDER BY created_at DESC LIMIT 10');
    console.log('ISSUES:', issues.rows);

    // Check checkouts
    const checkouts = await client.query('SELECT id, provider, checkout_id, raw_status, conversion_state, net_raw, created_at FROM aff.provider_checkouts ORDER BY purchased_at DESC LIMIT 10');
    console.log('CHECKOUTS:', checkouts.rows);

    // Check commissions
    const commissions = await client.query('SELECT id, checkout_id, state, estimated_vnd, created_at FROM aff.commissions ORDER BY created_at DESC LIMIT 10');
    console.log('COMMISSIONS:', commissions.rows);

  } catch (err) {
    console.error('DB_ERROR:', err.message);
  } finally {
    await client.end();
  }
}

run();
