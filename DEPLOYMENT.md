# CharmCraft Deployment Readiness

## Repository root

Deploy this repository exactly as extracted. The project is **not nested** inside another folder.

Required paths are directly at the repository root:

- `app/`
- `components/`
- `public/`
- `db/`
- `lib/`
- `package.json`
- `package-lock.json`
- `next.config.ts`
- `netlify.toml`
- `.nvmrc`

The project uses the standard root-level Next.js App Router convention. No custom output directory is required for Vercel or Netlify.

## GitHub

1. Create an empty GitHub repository.
2. Extract `charmcraft-deployment-ready.zip`.
3. Commit the extracted folder contents directly to the repository root.
4. Do not commit `.env`, `.next`, `node_modules`, `.vercel`, or `.netlify`.

## Vercel

- Import the GitHub repository or upload the extracted root folder.
- Leave **Root Directory** blank (or use `.`).
- Install command: `npm ci`
- Build command: `npm run build`
- Framework preset: Next.js (auto-detected)

## Netlify

- Import the GitHub repository or upload the extracted root folder.
- Base directory: leave blank.
- Build command: `npm run build`
- Publish directory: `.next`
- Netlify reads the included root-level `netlify.toml`.

## Environment variables

Configure these in Vercel or Netlify project settings. Never upload a real `.env` file.

- `DATABASE_URL` — required by the health endpoint and PostgreSQL integration.
- `OPENAI_API_KEY` — optional, enables remote Coach Victor LLM responses.
- `OPENAI_BASE_URL` — optional OpenAI-compatible endpoint.
- `OPENAI_MODEL` — optional model name; defaults to `gpt-4o-mini`.

See `.env.example` for the expected names.

## Local verification

```bash
npm ci
npm run build
npm run start
```

The production health endpoint is available at `/api/health`.
