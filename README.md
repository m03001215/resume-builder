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

### Resume generation (optional)

Set the following environment variables to enable OpenAI-powered content:

- `VITE_OPENAI_API_KEY`
- `VITE_OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`)

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
