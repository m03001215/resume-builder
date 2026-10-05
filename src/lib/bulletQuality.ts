// Bullet quality guard.
//
// The prompt asks for short, specific, story-shaped bullets. This module backs it up on the two
// failures a reviewer notices fastest:
//   1. Filler — "leveraged", "spearheaded", "responsible for", "improved performance" with no
//      detail. These make a bullet read as generic no matter what else it says.
//   2. Invented numbers — pushing a model toward "specific" also pushes it to make up metrics. Any
//      metric-style number in a bullet must appear somewhere in the candidate's own text.
// Flagged bullets are sent back once for a rewrite; the rewrite is accepted only if it is clean.

// Every job gets at least this many bullets; the draft is capped at the maximum.
export const MIN_BULLETS_PER_ROLE = 6
export const MAX_BULLETS_PER_ROLE = 8

type Pattern = { label: string; pattern: RegExp }

export const FILLER_PATTERNS: Pattern[] = [
  { label: 'leveraged', pattern: /\bleverag(?:e|ed|es|ing)\b/i },
  { label: 'utilized', pattern: /\butili[sz](?:e|ed|es|ing)\b/i },
  { label: 'spearheaded', pattern: /\bspearhead(?:ed|ing|s)?\b/i },
  { label: 'orchestrated', pattern: /\borchestrat(?:ed|ing)\b(?!\s+(?:with|by|using|via)\b)/i },
  { label: 'robust', pattern: /\brobust\b/i },
  { label: 'seamless', pattern: /\bseamless(?:ly)?\b/i },
  { label: 'cutting-edge', pattern: /\bcutting[- ]edge\b/i },
  { label: 'state-of-the-art', pattern: /\bstate[- ]of[- ]the[- ]art\b/i },
  { label: 'best practices', pattern: /\bbest practices\b/i },
  { label: 'various', pattern: /\bvarious\b/i },
  { label: 'synergy', pattern: /\bsynerg(?:y|ies|istic)\b/i },
  { label: 'responsible for', pattern: /\bresponsible for\b/i },
  { label: 'worked on', pattern: /\bworked on\b/i },
  { label: 'helped', pattern: /\bhelped (?:to |with )/i },
  { label: 'contributed to', pattern: /\bcontributed to\b/i },
  { label: 'participated in', pattern: /\bparticipated in\b/i },
  { label: 'to ensure', pattern: /\bto ensure\b/i },
  { label: 'in order to', pattern: /\bin order to\b/i },
  { label: 'high-quality', pattern: /\bhigh[- ]quality\b/i },
  { label: 'scalable solutions', pattern: /\bscalable solutions?\b/i },
  { label: 'drove innovation', pattern: /\bdr(?:ove|iving) innovation\b/i },
  {
    label: 'vague "improved X"',
    pattern:
      /\b(?:improv|enhanc|boost|optimiz)(?:ed|ing)\s+(?:overall\s+)?(?:efficiency|performance|user experience|productivity|reliability|scalability|quality)\b(?!\s+(?:by|from|of|for)\b)/i,
  },
]

export const findFiller = (text: string) => FILLER_PATTERNS.filter((f) => f.pattern.test(text)).map((f) => f.label)

// --- Metric numbers ----------------------------------------------------------------------------
// Only numbers that read as a claim are checked: currency, a unit (%, x, k, ms, hours...), a
// count of something ("40 services"), or any bare number >= 10. Version numbers ("Python 3",
// "Java 17", "GPT-4", "HTTP/2", "EC2", "p95") and years are not claims and are skipped.

const COUNT_NOUNS =
  /^\s*\+?\s*(?:users?|customers?|clients?|requests?|rps|qps|tps|services?|microservices?|engineers?|developers?|people|members?|teams?|partners?|merchants?|stores?|sites?|transactions?|orders?|records?|rows?|events?|messages?|tickets?|pages?|endpoints?|servers?|nodes?|clusters?|countries|markets?|regions?|languages?|apps?|applications?|repos(?:itories)?|tests?|deployments?|releases?|features?|accounts?|devices?|subscribers?|downloads?|installs?|stakeholders?|hires?|reports?|dashboards?|pipelines?|jobs?|tables?|models?|sprints?)\b/i

const NUMBER = /([$€£¥]\s?)?(?<![\p{L}\d./-])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s?(k|K|M|B|bn|%|x|×|ms|s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?|days?|weeks?|months?)(?![\p{L}\d]))?\+?(?![\p{L}\d])/gu

const MULTIPLIER: Record<string, number> = { k: 1e3, K: 1e3, M: 1e6, B: 1e9, bn: 1e9 }

export type MetricNumber = { raw: string; value: number }

export const metricNumbers = (text: string): MetricNumber[] => {
  const found: MetricNumber[] = []
  for (const match of text.matchAll(NUMBER)) {
    const [raw, currency, digits, unit] = match
    const value = Number(digits.replace(/,/g, '')) * (unit ? (MULTIPLIER[unit] ?? 1) : 1)
    const before = text.slice(0, match.index ?? 0)
    const after = text.slice((match.index ?? 0) + raw.length)
    const isYear = !currency && !unit && /^(?:19|20)\d{2}$/.test(digits)
    // "Java 17", "Python 3": a number right after a capitalized name mid-sentence. The opening
    // word is excluded because every bullet starts capitalized ("Onboarded 12 engineers").
    const afterVersionName = !currency && !unit && /\S\s+[A-Z][\w.+#]*\s$/.test(before)
    if (isYear || afterVersionName) continue
    const isClaim = Boolean(currency) || Boolean(unit) || COUNT_NOUNS.test(after) || value >= 10
    if (isClaim) found.push({ raw: raw.trim(), value: Math.round(value * 1000) / 1000 })
  }
  return found
}

export const evidenceNumbers = (texts: string[]) =>
  new Set(texts.flatMap((text) => metricNumbers(text ?? '').map((n) => n.value)))

export const unsupportedNumbers = (text: string, evidence: Set<number>) =>
  metricNumbers(text)
    .filter((n) => !evidence.has(n.value))
    .map((n) => n.raw)

// --- Guard -------------------------------------------------------------------------------------

export type QualityRole = {
  id: string
  company?: string
  title?: string
  start?: string
  end?: string
  existingBullets?: string[]
}

type Rewrite = { key: string; text: string }

// --- Tense -------------------------------------------------------------------------------------
// Every bullet, current role included, is written in the past tense. A bullet opening with a
// present-tense verb ("Builds", "Leading", "Own the ...") is flagged for a rewrite. Only the
// opening verb is checked — skipping a leading adverb ("Independently designed") — because that
// is what a reader sees and what models get wrong for a current role.
const BASE_FORM_VERBS = new Set(
  'build design develop lead own manage implement create maintain drive deliver write run migrate improve reduce partner mentor architect ship automate optimize optimise support collaborate work establish define launch scale oversee coordinate monitor test deploy integrate refactor rebuild review guide plan analyze analyse research help'.split(' '),
)

export const presentTenseOpening = (text: string) => {
  const words = text.trim().replace(/^[^\p{L}]+/u, '').split(/\s+/)
  const opening = /ly$/i.test(words[0] ?? '') && words.length > 1 ? words[1] : (words[0] ?? '')
  const word = opening.replace(/[^\p{L}-]/gu, '')
  const lower = word.toLowerCase()
  if (lower.length < 3) return ''
  const gerund = /ing$/.test(lower) && lower.length > 5
  const thirdPerson = /[^su]s$/.test(lower) && !/(?:ss|us|is)$/.test(lower) && lower.length > 3
  const baseForm = BASE_FORM_VERBS.has(lower)
  return gerund || thirdPerson || baseForm ? word : ''
}

// Rewrites flagged bullets once. Acceptance:
//   - a rewrite with no filler, no present-tense opening and no unsupported numbers replaces the
//     original;
//   - otherwise a bullet whose only problems were filler or tense keeps its original wording (style);
//   - a bullet with an invented number that could not be fixed is dropped (honesty issue). A role
//     left empty falls back to the candidate's own bullets when the draft is applied.
export const enforceSpecificBullets = async <T extends { workHistory?: unknown }>(args: {
  draftParsed: T
  roles: QualityRole[]
  evidenceTexts: string[]
  language: string
  sanitize: (value: unknown) => string
  requestRewrites: (system: string, user: string) => Promise<Rewrite[] | null>
}): Promise<T> => {
  const { draftParsed, roles, evidenceTexts, language, sanitize, requestRewrites } = args
  const entries = Array.isArray(draftParsed?.workHistory)
    ? (draftParsed.workHistory as Array<{ id?: unknown; bullets?: unknown }>)
    : []
  if (entries.length === 0) return draftParsed

  const evidence = evidenceNumbers(evidenceTexts)
  // Filler and tense patterns are English; other languages are covered by the prompt rules only.
  const checkFiller = language === 'English'

  type Item = { key: string; roleId: string; text: string; filler: string[]; numbers: string[]; tense: string }
  const items: Item[] = []
  for (const entry of entries) {
    if (typeof entry?.id !== 'string' || !Array.isArray(entry.bullets)) continue
    ;(entry.bullets as unknown[]).forEach((value, i) => {
      const text = sanitize(value)
      if (!text) return
      const filler = checkFiller ? findFiller(text) : []
      const numbers = unsupportedNumbers(text, evidence)
      const tense = checkFiller ? presentTenseOpening(text) : ''
      if (filler.length > 0 || numbers.length > 0 || tense) {
        items.push({ key: `${entry.id}:${i}`, roleId: entry.id as string, text, filler, numbers, tense })
      }
    })
  }
  if (items.length === 0) return draftParsed

  const roleContext = roles
    .filter((role) => items.some((item) => item.roleId === role.id))
    .map((role) => ({
      id: role.id,
      company: role.company ?? '',
      title: role.title ?? '',
      start: role.start ?? '',
      end: role.end ?? '',
      candidateBullets: role.existingBullets ?? [],
    }))

  const system = 'Output ONLY valid JSON (no markdown). Return: { rewrites: [{ key, text }] } and nothing else.'
  const user = `Rewrite each flagged resume bullet so a reviewer can tell the candidate really did this work.

Rules:
- One sentence, 12–25 words: the situation or problem -> what the candidate specifically built, changed or decided -> the result.
- Include at least two concrete anchors: a named thing worked on (service, page, job, pipeline, tool, flow), a specific technical decision or method, a real number, a concrete before -> after, or a specifically named group it was for.
- Remove every phrase listed under "filler" and do not replace it with another buzzword (no leveraged, utilized, spearheaded, robust, seamless, best practices, various, responsible for, worked on, contributed to, to ensure, in order to, high-quality).
- Remove every number listed under "inventedNumbers": the candidate never stated them. Do not add any number that is not in that role's candidateBullets. State the outcome concretely in words instead.
- Base the specifics on the role's candidateBullets, title and company. Keep technology names exactly as written. Never invent customer names, branded products, or awards.
- Past tense for every bullet, even for a current role: start with a past-tense verb ("Built", "Led", "Migrated"). If "presentTenseVerb" is set, that opening is exactly what must change. Write in ${language}.
- If an item's only issue is presentTenseVerb, keep its content and just change the tense.
- Return exactly one rewrite per item, using the given key.

Roles:
${JSON.stringify(roleContext)}

Items:
${JSON.stringify(
  items.map(({ key, roleId, text, filler, numbers, tense }) => ({
    key,
    roleId,
    text,
    filler,
    inventedNumbers: numbers,
    presentTenseVerb: tense || undefined,
  })),
)}`

  const rewrites = new Map<string, string>()
  try {
    for (const rewrite of (await requestRewrites(system, user)) ?? []) {
      if (typeof rewrite?.key !== 'string') continue
      const text = sanitize(rewrite.text)
      if (text) rewrites.set(rewrite.key, text)
    }
  } catch {
    // Best-effort; the acceptance rules below decide what survives without a rewrite.
  }

  const outcome = new Map<string, string | null>() // null = drop
  for (const item of items) {
    const next = rewrites.get(item.key)
    const clean =
      next !== undefined &&
      (checkFiller ? findFiller(next).length === 0 && !presentTenseOpening(next) : true) &&
      unsupportedNumbers(next, evidence).length === 0
    if (clean) outcome.set(item.key, next)
    else if (item.numbers.length > 0) outcome.set(item.key, null)
  }

  return {
    ...draftParsed,
    workHistory: entries.map((entry) => {
      if (typeof entry?.id !== 'string' || !Array.isArray(entry.bullets)) return entry
      const bullets = (entry.bullets as unknown[])
        .map((value, i) => {
          const key = `${entry.id}:${i}`
          return outcome.has(key) ? outcome.get(key) : value
        })
        .filter((value) => value !== null)
      return { ...entry, bullets }
    }),
  }
}

// --- Bullet count ------------------------------------------------------------------------------
// Tops up any role with fewer than MIN_BULLETS_PER_ROLE bullets by asking the model for exactly
// the missing number, under the same specificity rules. Run the guards again afterwards: the new
// bullets have not been checked yet. Returns the input object unchanged when nothing is short, so
// callers can skip that second pass.
export const ensureBulletCount = async <T extends { workHistory?: unknown }>(args: {
  draftParsed: T
  roles: QualityRole[]
  jobDescription: string
  language: string
  sanitize: (value: unknown) => string
  requestBullets: (system: string, user: string) => Promise<Array<{ id: string; bullets: unknown[] }> | null>
}): Promise<T> => {
  const { draftParsed, roles, jobDescription, language, sanitize, requestBullets } = args
  const entries = Array.isArray(draftParsed?.workHistory)
    ? (draftParsed.workHistory as Array<{ id?: unknown; bullets?: unknown }>)
    : []

  const currentBullets = (id: string) => {
    const entry = entries.find((e) => e?.id === id)
    return Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]).map(sanitize).filter(Boolean) : []
  }

  const short = roles
    .map((role) => ({ role, bullets: currentBullets(role.id) }))
    .filter(({ bullets }) => bullets.length < MIN_BULLETS_PER_ROLE)
  if (short.length === 0) return draftParsed

  const request = short.map(({ role, bullets }) => ({
    id: role.id,
    company: role.company ?? '',
    title: role.title ?? '',
    start: role.start ?? '',
    end: role.end ?? '',
    candidateBullets: role.existingBullets ?? [],
    currentBullets: bullets,
    addCount: MIN_BULLETS_PER_ROLE - bullets.length,
  }))

  const system = 'Output ONLY valid JSON (no markdown). Return: { workHistory: [{ id, bullets: string[] }] } and nothing else.'
  const user = `Each role below needs more resume bullets. For each role, write exactly addCount NEW bullets.

Rules:
- Each bullet is one specific story in one sentence of 12–25 words: the situation or problem -> what the candidate specifically built, changed or decided -> the result.
- Each bullet has at least two concrete anchors: a named thing worked on (service, page, job, pipeline, tool, flow), a specific technical decision or method, a real number, a concrete before -> after, or a specifically named group it was for.
- Cover a DIFFERENT piece of work from currentBullets — do not restate, split or reword an existing bullet. Draw on the full range of real work in such a role: features shipped, bugs or incidents fixed, migrations, performance work, tests and tooling, CI/CD, code reviews and mentoring, documentation, on-call.
- Base everything on the role's title, company, dates and candidateBullets. Use numbers ONLY if they appear in candidateBullets. Never invent customer names, branded products or awards.
- Only name technologies that existed during the role's dates (start to end), and keep them relevant to the job description below without copying its wording.
- No filler: leveraged, utilized, spearheaded, robust, seamless, best practices, various, responsible for, worked on, contributed to, to ensure, in order to, high-quality.
- Past tense for every role, including a current one ("Present"). Write in ${language}. Do not include company names or dates inside bullets.
- Return only the new bullets, one entry per role id.

Job description (context only — do not copy from it):
${jobDescription}

Roles:
${JSON.stringify(request)}`

  const additions = new Map<string, string[]>()
  try {
    for (const item of (await requestBullets(system, user)) ?? []) {
      if (typeof item?.id !== 'string' || !Array.isArray(item.bullets)) continue
      additions.set(item.id, item.bullets.map(sanitize).filter(Boolean))
    }
  } catch {
    // Best-effort: on failure the roles keep the bullets they have.
  }
  if (additions.size === 0) return draftParsed

  const normalizeKey = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return {
    ...draftParsed,
    workHistory: entries.map((entry) => {
      if (typeof entry?.id !== 'string') return entry
      const extra = additions.get(entry.id)
      if (!extra || extra.length === 0) return entry
      const existing = currentBullets(entry.id)
      const seen = new Set(existing.map(normalizeKey))
      const merged = [...existing]
      for (const bullet of extra) {
        const key = normalizeKey(bullet)
        if (seen.has(key) || merged.length >= MAX_BULLETS_PER_ROLE) continue
        seen.add(key)
        merged.push(bullet)
      }
      return { ...entry, bullets: merged }
    }),
  }
}
