#!/usr/bin/env node
/**
 * Run the 3 new migrations (Standard tier, add-on credits, rose-pink theme)
 * against the linked Supabase remote database.
 * Requires: SUPABASE_DB_PASSWORD in env.
 * Usage: SUPABASE_DB_PASSWORD=yourpass node scripts/run-remote-migrations.cjs
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'qynjzojmuarpcznepatt';
const MIGRATIONS = [
  '20260301120000_add_standard_subscription_tier.sql',
  { before: '20260301180000_standard_addon_credits.sql', runFirst: 'DROP FUNCTION IF EXISTS safe_create_subscription(uuid, text, timestamptz, timestamptz);' },
  '20260301180000_standard_addon_credits.sql',
  '20260313170000_add_rose_pink_theme.sql',
];

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password || !password.trim()) {
    console.error('Set SUPABASE_DB_PASSWORD and run again.');
    process.exit(1);
  }

  const connectionString = `postgres://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected to remote database.\n');

    const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
    for (const entry of MIGRATIONS) {
      if (typeof entry === 'object' && entry.runFirst) {
        console.log('Running pre-step for', entry.before, '...');
        await client.query(entry.runFirst);
        console.log('  OK\n');
        continue;
      }
      const name = typeof entry === 'string' ? entry : entry.before;
      const filePath = path.join(migrationsDir, name);
      if (!fs.existsSync(filePath)) {
        console.error('Missing:', filePath);
        process.exit(1);
      }
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log('Running', name, '...');
      await client.query(sql);
      console.log('  OK\n');
    }

    console.log('All 3 migrations applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
