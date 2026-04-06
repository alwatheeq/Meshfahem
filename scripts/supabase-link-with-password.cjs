#!/usr/bin/env node
/**
 * Run `supabase link` with database password from env SUPABASE_DB_PASSWORD.
 * Use when the interactive password prompt doesn't show characters (hidden input).
 *
 * Windows (PowerShell): $env:SUPABASE_DB_PASSWORD="your-db-password"; npm run supabase:link-with-password
 * Windows (cmd):        set SUPABASE_DB_PASSWORD=your-db-password && npm run supabase:link-with-password
 * Mac/Linux:            SUPABASE_DB_PASSWORD=your-db-password npm run supabase:link-with-password
 */

const { spawn } = require('child_process');
const path = require('path');

const projectRef = 'qynjzojmuarpcznepatt';
const password = process.env.SUPABASE_DB_PASSWORD;

if (!password || password.trim() === '') {
  console.error('SUPABASE_DB_PASSWORD is not set or empty.');
  console.error('Set it in this shell then run the same command again.');
  console.error('Example (PowerShell): $env:SUPABASE_DB_PASSWORD="your-password"; npm run supabase:link-with-password');
  process.exit(1);
}

const bin = process.platform === 'win32' ? 'supabase.cmd' : 'supabase';
const supabasePath = path.join(__dirname, '..', 'node_modules', '.bin', bin);
const args = ['link', '--project-ref', projectRef, '--password', password];

const child = spawn(supabasePath, args, {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, SUPABASE_DB_PASSWORD: password },
  cwd: path.join(__dirname, '..'),
});

child.on('exit', (code) => process.exit(code != null ? code : 0));
