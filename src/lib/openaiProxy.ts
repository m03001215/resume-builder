// Client side of the OpenAI proxy (supabase/functions/openai-proxy).
//
// The browser holds no OpenAI key. Each call goes to the edge function with the user's own
// Supabase session token (supabase-js attaches it automatically); the function checks the user is
// approved, adds the key from a server secret, and relays OpenAI's reply. The result is shaped like
// the subset of `fetch`'s Response the call sites use — `ok`, `status`, `json()` — so swapping the
// direct OpenAI call for this one changes nothing downstream.

import { supabase } from './supabaseClient'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type ChatRequest = {
  messages: ChatMessage[]
  // Ignored server-side for models that only support the default (GPT-5 family, o-series).
  temperature?: number
}

export type ChatResponse = {
  ok: boolean
  status: number
  // Raw OpenAI response body (or an { error: { message } } object), as fetch().json() returned.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: () => Promise<any>
}

export const openaiChat = async (body: ChatRequest): Promise<ChatResponse> => {
  const { data, error } = await supabase.functions.invoke('openai-proxy', { body })
  if (!error) return { ok: true, status: 200, json: async () => data }

  // A non-2xx reply arrives as a FunctionsHttpError whose `context` is the Response; read the
  // body once here so `json()` can be called later exactly like a fetch Response.
  const context = (error as { context?: Response }).context
  if (context && typeof context.json === 'function') {
    let payload: unknown = { error: { message: error.message } }
    try {
      payload = await context.json()
    } catch {
      // Keep the generic message.
    }
    return { ok: false, status: context.status, json: async () => payload }
  }
  return { ok: false, status: 0, json: async () => ({ error: { message: error.message } }) }
}
