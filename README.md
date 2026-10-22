# Resume Generator Workspace

Modern React + Tailwind + TypeScript app for resume and cover letter generation with Supabase auth, profile management, and approval gating.

## Features

- Email/password sign in and sign up
- Profile, work history, and education editing
- Admin approval flow with gated access
- Resume + cover letter generation with editable sections
- DOCX resume export + TXT cover letter export
- Applied job history with pagination and search

## Setup

1. Install dependencies:

	```powershell
	npm install
	```

2. Copy `.env.example` to `.env.local` and add your Supabase project values.
3. Ensure the Supabase database has the tables and fields described below.

## Deploy to Vercel

Vercel **does not** use your local `.env.local` file (and it should not be committed).

Set these in **Vercel → Project Settings → Environment Variables**, then redeploy:

- `VITE_SUPABASE_URL` (**required**)
- `VITE_SUPABASE_ANON_KEY` (**required**)

No OpenAI variables go in Vercel: anything prefixed `VITE_` is compiled into the public JavaScript bundle, where anyone can read it.

### Resume generation (OpenAI, server-side)

All OpenAI calls go through the `openai-proxy` Supabase Edge Function, which checks that the caller is a signed-in, approved user and holds the API key as a server secret. Set the secrets and deploy the function once:

```powershell
npx supabase secrets set OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini
npx supabase functions deploy openai-proxy
```

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`; GPT-5 / o-series models are supported — temperature is omitted for them automatically)

If a key was ever set as `VITE_OPENAI_API_KEY`, treat it as leaked: revoke it in the OpenAI dashboard and create a new one for the secret above.

### Database expectations

`profiles`

- `id` (uuid, primary key, matches auth user id)
- `first_name`, `middle_name`, `last_name`
- `role_title`, `location`
- `email`, `linkedin_url`, `phone_number`
- `approved_status` (boolean)
- `role` (`user` or `admin`)

`companies`

- `id` (uuid, primary key)
- `profile_id` (uuid, foreign key to profiles.id)
- `company_name`, `start_date`, `end_date`, `title`, `is_current`
- `work_mode` (`remote`, `hybrid`, `onsite`)
- `location`

`educations`

- `id` (uuid, primary key)
- `profile_id` (uuid, foreign key to profiles.id)
- `school_name`, `degree`, `field_of_study`
- `start_date`, `end_date`, `is_current`
- `location`

`applied_jobs`

- `id` (uuid, primary key)
- `profile_id` (uuid, foreign key to profiles.id)
- `company_name` (text)
- `job_title` (text)
- `job_description` (text)
- `resume_name` (text)
- `cover_letter_name` (text)
- `skills` (text array)
- `created_at` (timestamp with time zone, default now())

> Note: Passwords are handled by Supabase Auth and are not stored in `profiles`.

## Run locally

```powershell
npm run dev
```

## Build

```powershell
npm run build
```

## Usage notes

- Run **Generate** before **Save** to store the latest resume data.
- After saving, **Save** is disabled until you reset or generate again.
