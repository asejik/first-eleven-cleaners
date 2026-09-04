# ⚽ First Eleven Cleaners — Web Application

Next.js 16 (App Router + Turbopack) application for **First Eleven Cleaners**.

Refer to the main [Root README](../README.md) for full architecture, API specifications, and database schema documentation.

## Quick Start
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Run development server with Turbopack
npm run dev

# Run automated tests (Vitest)
npm test

# Run ESLint validation
npm run lint

# Run type check
npx tsc --noEmit

# Run production build
npm run build
```

## Vercel Deployment
- **Root Directory**: When deploying to Vercel, set the Root Directory to `web` in the Vercel project settings.
- **Config**: [`vercel.json`](vercel.json) is pre-configured with Next.js framework settings.
- See the main [Root README](../README.md#vercel-production-deployment-guide) for the complete production environment variable checklist.


