import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  const message =
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ' +
    'For Vercel: Project Settings → Environment Variables → add them (Production/Preview as needed) → redeploy.'
  console.error(message)
  throw new Error(message)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
