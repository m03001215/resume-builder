// OpenAI proxy.
//
// The browser never sees the OpenAI key. It sends chat messages here with its own Supabase
// session token; this function checks that the caller is a signed-in, approved user, attaches the
// key from a server secret, forwards the request, and returns OpenAI's response body and status
// unchanged so the client code can keep reading `choices[0].message.content` and `error.message`.
//
// Deploy:
//   supabase secrets set OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini
//   supabase functions deploy openai-proxy
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3'

const DEFAULT_MODEL = 'gpt-4o-mini'
// Generous enough for the resume prompt plus a long job description; small enough that a stolen
// session cannot push arbitrary megabytes through the account.
const MAX_REQUEST_CHARS = 120_000
const MAX_MESSAGES = 12

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Shaped like an OpenAI error so the client's existing `data.error.message` handling shows it.
const fail = (message: string, status: number) => json({ error: { message } }, status)

// GPT-5 and o-series models reject any temperature other than the default.
const modelSupportsTemperature = (model: string) => !/^(?:o[1-9]|gpt-5)/i.test(model.trim())

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const parseMessages = (value: unknown): ChatMessage[] | null => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null
  const messages: ChatMessage[] = []
  for (const item of value) {
    const role = (item as { role?: unknown })?.role
    const content = (item as { content?: unknown })?.content
    if ((role !== 'system' && role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
    messages.push({ role, content })
  }
  return messages
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('Method not allowed.', 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return fail('Missing authorization header.', 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return fail('Function is missing its Supabase environment variables.', 500)
  if (!openaiKey) return fail('OPENAI_API_KEY is not set on the server (supabase secrets set OPENAI_API_KEY=...).', 500)

  // Who is calling? Resolved from the JWT itself, never from anything the client claims.
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser()
  if (userError || !user) return fail('Invalid or expired session.', 401)

  // Only approved users (or admins) may spend the account's credit — the same gate the app's
  // resume builder page sits behind.
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('approved_status, role')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) return fail(profileError.message, 500)
  if (!profile || (!profile.approved_status && profile.role !== 'admin')) {
    return fail('Your account is not approved for resume generation yet.', 403)
  }

  const raw = await req.text()
  if (raw.length > MAX_REQUEST_CHARS) return fail('Request is too large.', 413)
  let body: { messages?: unknown; temperature?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return fail('Request body must be JSON.', 400)
  }
  const messages = parseMessages(body.messages)
  if (!messages) return fail('messages must be a non-empty array of { role, content } objects.', 400)

  const model = Deno.env.get('OPENAI_MODEL')?.trim() || DEFAULT_MODEL
  const temperature =
    typeof body.temperature === 'number' && Number.isFinite(body.temperature)
      ? Math.min(2, Math.max(0, body.temperature))
      : undefined

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model,
      ...(temperature !== undefined && modelSupportsTemperature(model) ? { temperature } : {}),
      messages,
      // Attribute usage per user in the OpenAI dashboard without exposing anything to the browser.
      user: user.id,
    }),
  })

  // Pass OpenAI's body and status through untouched; the client already handles both shapes.
  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
