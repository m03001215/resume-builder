-- Add a separate email used for generated resume/cover letters.
-- This keeps auth/login email (`profiles.email`) distinct from generated materials.

alter table public.profiles
add column if not exists resume_email text;

-- Backfill existing rows so outputs remain unchanged until user edits resume_email.
update public.profiles
set resume_email = email
where (resume_email is null or resume_email = '') and email is not null and email <> '';

