# Supabase and Vercel Setup

This project can run locally without Supabase, but the deployed Vercel app must use Supabase because serverless file storage is not persistent.

## 1. Create Supabase Project

Create a Supabase project and copy these values from Project Settings:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Use the `service_role` key only on the server. Do not expose it in browser code and do not prefix it with `NEXT_PUBLIC_`.

## 2. Create Tables

Open Supabase SQL Editor and run:

```sql
-- paste supabase/schema.sql
```

The schema creates:

- `funnels`, `funnel_steps`, `answer_options`
- `assessment_sessions`, `assessment_answers`, `assessment_results`
- `payments`
- indexes for foreign keys, session lookup, answer upsert, and active subscriptions
- RLS enabled on all tables

The app uses server-side route handlers with the service role key, so RLS will not block the API. Keeping RLS enabled prevents accidental client-side access later.

## 3. Seed Funnel Data

Create a local `.env` from `.env.example`, fill the Supabase values, then run:

```bash
npm run seed:supabase
```

The seed script imports the full scraped BetterMe-inspired funnel from:

```text
scrape/betterme_scrape/betterme_public_data.json
```

It includes step images, question images, and option icons.

## 4. Configure Vercel

In Vercel project settings, add these environment variables for Production, Preview, and Development:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

This repo includes `vercel.json` to force:

```json
{
  "installCommand": "npm install",
  "buildCommand": "npm run build"
}
```

That avoids package-manager ambiguity when both npm and pnpm lockfiles are present.

## 5. Deploy

Dashboard flow:

```text
Import Git repository -> Framework: Next.js -> Add env vars -> Deploy
```

CLI flow:

```bash
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel --prod
```

Repeat env additions for `preview` if you want preview deployments to use Supabase too.

## 6. Smoke Test

After deployment:

```bash
APP_URL=https://your-vercel-domain.vercel.app PAID=true npm run demo:session
```

The script creates a complete assessment, submits it, runs mock payment, and prints:

- `sessionId`
- `resultUrl`
- whether paywall is disabled
- the returned result keys

For an unpaid comparison session:

```bash
APP_URL=https://your-vercel-domain.vercel.app PAID=false npm run demo:session
```

Use the paid `sessionId` in the final README or delivery email so reviewers can compare locked and unlocked result responses.
