# Supabase Postgres and Vercel Setup

This project can run locally without Postgres, but the deployed Vercel app must use Supabase Postgres because serverless file storage is not persistent. Database access uses Drizzle ORM and a single `DATABASE_URL`.

## 1. Create Supabase Project

Create a Supabase project, then copy the Postgres connection string from Project Settings -> Database -> Connection string. For Vercel/serverless, prefer the transaction pooler URI and keep prepared statements disabled in the app.

```env
DATABASE_URL=postgres://...
```

The app does not need `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` because the browser never talks to Supabase directly.

## 2. Create Tables

Use Drizzle migrations to create the schema on a fresh Supabase database:

```bash
pnpm db:migrate
```

The Drizzle source of truth is:

```text
src/server/db/schema.ts
```

Generated SQL migrations live in:

```text
supabase/migrations/
```

For later schema changes, edit `src/server/db/schema.ts`, generate a migration, then apply it:

```bash
pnpm db:generate
pnpm db:migrate
```

This project intentionally uses migrations instead of `drizzle-kit push`. `push` introspects the remote database before syncing, and the current Supabase/Postgres check constraints can trigger a Drizzle Kit constraint-reading error. If the target database already has these tables from an earlier manual/push attempt, either keep using it as-is after `pnpm seed`, add a Drizzle baseline migration record, or start from a fresh database before running `pnpm db:migrate`.

The schema creates:

- `funnels`, `funnel_steps`, `answer_options`
- `assessment_sessions`, `assessment_answers`, `assessment_results`
- `payments`
- indexes for foreign keys, session lookup, answer upsert, and active subscriptions
- RLS enabled on all tables

The app uses server-side route handlers and a direct Postgres connection. Keeping RLS enabled prevents accidental client-side access later if Supabase browser clients are added.

## 3. Seed Funnel Data

Create a local `.env` from `.env.example`, fill `DATABASE_URL`, then run:

```bash
pnpm seed
```

The seed script imports the full scraped BetterMe-inspired funnel from:

```text
scrape/betterme_scrape/betterme_public_data.json
```

It includes step images, question images, and option icons.

Image URLs are mapped to CDN files under:

```text
https://cdn.gandalfpuzzle.com/temp/funnel/<image-id>.webp
```

## 4. Configure Vercel

In Vercel project settings, add these environment variables for Production, Preview, and Development:

```env
DATABASE_URL=postgres://...
```

This repo includes `vercel.json` to force:

```json
{
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm run build"
}
```

That keeps Vercel on the same package manager as local development.

## 5. Deploy

Dashboard flow:

```text
Import Git repository -> Framework: Next.js -> Add env vars -> Deploy
```

CLI flow:

```bash
npx vercel link
npx vercel env add DATABASE_URL production
npx vercel --prod
```

Repeat env additions for `preview` if you want preview deployments to use Supabase Postgres too.

## 6. Smoke Test

After deployment:

```bash
APP_URL=https://your-vercel-domain.vercel.app PAID=true pnpm demo:session
```

The script creates a complete assessment, submits it, runs mock payment, and prints:

- `sessionId`
- `resultUrl`
- whether paywall is disabled
- the returned result keys

For an unpaid comparison session:

```bash
APP_URL=https://your-vercel-domain.vercel.app PAID=false pnpm demo:session
```

Use the paid `sessionId` in the final README or delivery email so reviewers can compare locked and unlocked result responses.
