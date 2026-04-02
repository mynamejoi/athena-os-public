# Project Athena

Personal OS for Health and Development. Track habits, workouts, biometrics, projects, books, and goals -- all in one place. AI-powered daily reports, workout coaching, and planning built on Claude.

Built with Next.js, React, TypeScript, Supabase, Tailwind CSS, and Claude AI.

## Features

- Daily habit tracking with streak monitoring
- AI morning briefings and weekly/monthly/yearly reports
- Workout coaching with exercise tracking and weekly planning
- WHOOP biometric integration (optional)
- Project management with task tracking
- Book library with reading progress
- Monthly and yearly goal setting
- Journal with AI-generated prompts
- Email notifications via Resend

## Prerequisites

- Node.js 18+
- A Supabase account (free tier works)
- An Anthropic API key (for AI features)
- A WHOOP account (optional, for biometric data)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/mynamejoi/athena-os-public.git
cd athena-os-public
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to SQL Editor and run the contents of `supabase/setup.sql`
3. Copy your project URL, anon key, and service role key

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

### 4. Run the app

```bash
npm run dev
```

### 5. First-run setup

Open the app and follow the setup wizard:
1. Set a passphrase (used for login)
2. Enter your Anthropic API key
3. Optionally connect WHOOP

The app will guide you through setting up habits, goals, and your first project.

## WHOOP Integration

WHOOP is fully optional. Without it, the app uses habit completion data and journal entries for AI reports instead of biometric data. To connect WHOOP:

1. Register a WHOOP developer app at [developer.whoop.com](https://developer.whoop.com)
2. Set the redirect URI to `https://your-app.vercel.app/api/whoop/callback`
3. Add `WHOOP_CLIENT_ID` and `WHOOP_CLIENT_SECRET` to your environment

## Deployment

Deploy to Vercel:

1. Push to GitHub
2. Import in Vercel
3. Add all env vars from `.env.example`
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel production URL

Cron jobs are configured in `vercel.json` for automatic WHOOP sync and report generation.

## Tech Stack

- **Framework:** Next.js 16, React 19, TypeScript
- **Database:** Supabase (Postgres)
- **AI:** Claude (Haiku for lightweight ops, Sonnet for heavy ops)
- **Styling:** Tailwind CSS with gold/black theme
- **Charts:** Recharts
- **Animations:** Framer Motion
- **Email:** Resend

## License

AGPL-3.0. See [LICENSE](LICENSE) for details.

Free for personal use. If you modify and host this as a service, you must open-source your changes under the same license.
