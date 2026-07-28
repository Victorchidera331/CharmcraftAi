# CharmCraft Vercel Deployment

## Repository layout

This project uses the standard root-level Next.js App Router structure:

- `app/` — App Router pages, layouts, route handlers, and global CSS
- `components/` — React UI components
- `lib/` — client/server domain libraries
- `db/` — Drizzle PostgreSQL connection and schema
- `public/` — static PWA, admin dashboard, icons, and Play Store assets

`package.json` is at the repository root. In Vercel, leave **Root Directory** empty (or set it to `.`).

## Environment variables

Add these in **Vercel Project Settings → Environment Variables**:

- `DATABASE_URL` — required for the health endpoint and PostgreSQL integration.
- `OPENAI_API_KEY` — optional; enables the remote LLM path for Coach Victor.
- `OPENAI_BASE_URL` — optional OpenAI-compatible API base URL.
- `OPENAI_MODEL` — optional model name; defaults to `gpt-4o-mini`.

Use `.env.example` as the variable reference. Do not upload `.env`.

## Deploy from ZIP

1. Extract `charmcraft-vercel-production.zip`.
2. Ensure the extracted folder is the Vercel project root and contains `package.json`, `app/`, `components/`, `lib/`, `db/`, and `public/` directly.
3. Import or upload that root folder to Vercel.
4. Use the default commands:
   - Install: `npm ci`
   - Build: `npm run build`
5. Configure the environment variables above, then deploy.

No custom Vercel output directory is needed; Vercel auto-detects Next.js App Router.
