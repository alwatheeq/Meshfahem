# Deploy Supabase Edge Functions

## Prerequisites

- Node.js and npm (Supabase CLI is in `devDependencies`)
- Supabase project ref: `qynjzojmuarpcznepatt`

## One-time setup

### 1. Log in to Supabase CLI

**Option A – Interactive (recommended on your machine)**  
From the project root in a normal terminal (so the browser can open):

```bash
npm run supabase:login
```

(On Windows PowerShell, use `npm run` instead of `npx` to avoid "scripts is disabled" errors.)

Or with npx (if your terminal allows it):

```bash
npx supabase login
```

Complete the browser flow. The CLI will store your access token.

**Option B – Access token (CI or non-interactive)**  
1. In [Supabase Dashboard](https://supabase.com/dashboard) go to **Account** → **Access Tokens** and create a token.  
2. Set it when running commands:

   ```bash
   set SUPABASE_ACCESS_TOKEN=your_token_here
   npx supabase link --project-ref qynjzojmuarpcznepatt
   npx supabase functions deploy --all
   ```

   Or add `SUPABASE_ACCESS_TOKEN=your_token_here` to a `.env.local` (and do not commit it).

### 2. Link this repo to your remote project

```bash
npm run supabase:link
```

Or:

```bash
npx supabase link --project-ref qynjzojmuarpcznepatt
```

When prompted, enter your **database password** (the one you set for the project in the Supabase dashboard, or from your initial project setup). **The input is hidden**—no characters or dots appear; type the password once and press Enter.

**If the prompt doesn’t accept input or you prefer not to type the password**, pass it via the CLI or env:

- **Using env (recommended, no password in shell history):**  
  Set `SUPABASE_DB_PASSWORD` in the same shell, then run the link script that uses it:
  - **PowerShell:** `$env:SUPABASE_DB_PASSWORD="your-db-password"; npm run supabase:link-with-password`
  - **Cmd:** `set SUPABASE_DB_PASSWORD=your-db-password` then `npm run supabase:link-with-password`
  - **Mac/Linux:** `SUPABASE_DB_PASSWORD=your-db-password npm run supabase:link-with-password`
- **Using CLI flag (password visible in process list):**  
  `npx supabase link --project-ref qynjzojmuarpcznepatt --password "your-db-password"`  
  (or `npm run supabase:link` and add `--password "..."` if you add it to the script).

### 3. Push database migrations (e.g. for new columns)

After linking, apply local migrations to the remote database:

```bash
npm run supabase:db-push
```

Or:

```bash
npx supabase db push
```

This applies everything in `supabase/migrations/` (e.g. `chat_blocks_per_cycle`, `zego_hours_per_cycle` on `subscriptions`). Run it whenever you add or change migrations.

**If `db push` fails** because the remote has different migration history (e.g. "already exists" or "local migrations to be inserted before"), you can apply only the new migrations via the helper script, then mark them applied:

```bash
# Set database password, then run the 3 new migrations (Standard tier, add-ons, rose-pink theme) on remote
$env:SUPABASE_DB_PASSWORD="your-db-password"; node scripts/run-remote-migrations.cjs

# Tell the CLI these migrations are now applied on remote
npx supabase migration repair --status applied 20260301120000 20260301180000 20260313170000 --password "your-db-password"
```

## Deploy all Edge Functions

**Note:** Deploying edge functions requires **Docker Desktop** to be installed and running (the CLI uses it to bundle functions). If Docker is not available, deploy from the [Supabase Dashboard](https://supabase.com/dashboard) (e.g. connect your GitHub repo) or from another machine with Docker.

From the project root:

```bash
npm run supabase:deploy
```

If your CLI does not support `--all`, deploy each function by name, e.g.:

```bash
npx supabase functions deploy chat-assistant --project-ref qynjzojmuarpcznepatt
npx supabase functions deploy create-checkout-session --project-ref qynjzojmuarpcznepatt
# ... repeat for each folder under supabase/functions/
```

## Deploy a single function (e.g. chat-assistant)

```bash
npm run supabase:deploy:chat
```

Or:

```bash
npx supabase functions deploy chat-assistant
```

## After deploy

1. **Secrets:** In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Edge Functions** → **Secrets**, ensure required secrets are set (e.g. `PREPLIXITY_API_KEY` for the chat-assistant).
2. **Logs:** Use the dashboard or `npx supabase functions logs <function-name>` to debug.

## Troubleshooting

- **"Access token not provided"** → Run `npx supabase login` and complete the browser flow.
- **"cannot read config"** → Run `npx supabase init` once (already done if you have `supabase/config.toml`).
- **404 on a function** → Deploy that function with `npx supabase functions deploy <function-name>`.

### Windows PowerShell: "running scripts is disabled on this system"

If you see `npx : File ...\npx.ps1 cannot be loaded because running scripts is disabled`, use **npm run** so the Supabase CLI runs without npx.ps1:

```bash
npm run supabase:login
npm run supabase:link
npm run supabase:db-push
```

If you prefer to fix the policy (so `npx` works), run in PowerShell:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Confirm with `Y`. If that fails (e.g. overridden by group policy), use **Command Prompt (cmd)** instead: open `cmd`, `cd` to the project folder, and run the same `npm run` or `npx` commands there.

### Password prompt “doesn’t type anything”

The database password field is **hidden**: nothing appears (no dots or asterisks) when you type. Type your password once and press Enter. If you prefer not to type it, use the **env-based link** (see step 2 above): set `SUPABASE_DB_PASSWORD` and run `npm run supabase:link-with-password`.

### SASL auth / “invalid SCRAM server-final-message” when linking

- Use the **database password** from **Supabase Dashboard** → your project → **Settings** → **Database** (the one you set for the project, not the anon key).
- If the password contains special characters, try passing it via env and the link-with-password script to avoid shell encoding issues:  
  `$env:SUPABASE_DB_PASSWORD='yourpassword'; npm run supabase:link-with-password`
- If it still fails, try resetting the database password in the dashboard, then link again with the new password.
- Ensure you’re not using the **connection pooler** password for a non-pooled connection (or vice versa); the CLI typically uses the direct database connection. If your project offers both, use the password shown for the **direct** connection (port 5432) when linking.
