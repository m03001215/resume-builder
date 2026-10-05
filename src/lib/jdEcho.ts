// Job-description echo guard.
//
// The generator is told to tailor the resume, and left alone it does that by lifting sentences
// straight out of the job description, which makes the tailoring obvious to any recruiter. The
// prompt now forbids copying; this module backs it up by finding output text that shares a long
// run of consecutive words with the job description and asking the model to rephrase just those
// pieces.
//
// Technology names stay matchable (ATS needs them) because a run has to be MIN_COPIED_WORDS long
// before it counts: "React" or "AWS Lambda" never trip it, a copied responsibility line does.

export const MIN_COPIED_WORDS = 6
// Scripts written without spaces (Japanese, Chinese) are compared by characters instead.
const MIN_COPIED_CJK_CHARS = 14

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#./-]+/u)
    .map((word) => word.replace(/^[./-]+|[./-]+$/g, ''))
    .filter(Boolean)

const cjkCharsOf = (text: string) => Array.from(text.replace(/\s+/g, ''))

export type JdIndex = {
  words: Set<string>
  chars: Set<string>
}

const gramsOf = (tokens: string[], size: number, join: string) => {
  const grams = new Set<string>()
  for (let i = 0; i + size <= tokens.length; i++) grams.add(tokens.slice(i, i + size).join(join))
  return grams
}

export const indexJobDescription = (jobDescription: string): JdIndex => ({
  words: gramsOf(wordsOf(jobDescription), MIN_COPIED_WORDS, ' '),
  chars: CJK.test(jobDescription) ? gramsOf(cjkCharsOf(jobDescription), MIN_COPIED_CJK_CHARS, '') : new Set(),
})

// Longest stretch of `text` that also appears in the job description, measured in tokens, plus
// the copied text itself. Length 0 means nothing long enough was copied.
export const longestCopiedRun = (text: string, index: JdIndex): { length: number; phrase: string } => {
  const useChars = CJK.test(text) && index.chars.size > 0
  const tokens = useChars ? cjkCharsOf(text) : wordsOf(text)
  const size = useChars ? MIN_COPIED_CJK_CHARS : MIN_COPIED_WORDS
  const grams = useChars ? index.chars : index.words
  const join = useChars ? '' : ' '

  let best = { start: -1, length: 0 }
  let runStart = -1
  for (let i = 0; i + size <= tokens.length; i++) {
    if (grams.has(tokens.slice(i, i + size).join(join))) {
      if (runStart < 0) runStart = i
      const length = i - runStart + size
      if (length > best.length) best = { start: runStart, length }
    } else {
      runStart = -1
    }
  }
  return best.length === 0
    ? { length: 0, phrase: '' }
    : { length: best.length, phrase: tokens.slice(best.start, best.start + best.length).join(join) }
}

type EchoItem = { key: string; text: string; copiedPhrase: string; copiedLength: number }
type Rewrite = { key: string; text: string }

type ParsedResume = {
  summary?: unknown
  coverLetter?: unknown
  keyAchievements?: unknown
  projects?: unknown
  workHistory?: unknown
}

// Rephrases every field that echoes the job description. A rewrite is accepted only if it copies
// strictly less than the original did; otherwise the original stays. This is a style fix, so a
// failed or unhelpful repair never removes content (unlike the technology-timeline guard).
//
// `requestRewrites` performs the model call and returns the parsed { rewrites } list (or null).
export const enforceNaturalPhrasing = async <T extends ParsedResume>(args: {
  draftParsed: T
  jobDescription: string
  language: string
  sanitize: (value: unknown) => string
  requestRewrites: (system: string, user: string) => Promise<Rewrite[] | null>
}): Promise<T> => {
  const { draftParsed, jobDescription, language, sanitize, requestRewrites } = args
  if (!jobDescription.trim()) return draftParsed
  const index = indexJobDescription(jobDescription)

  // The cover letter keeps its paragraph breaks; every other field is single-line text.
  const keepParagraphs = (value: unknown) => (value ?? '').toString().trim()

  const items: EchoItem[] = []
  const consider = (key: string, raw: unknown, clean: (value: unknown) => string) => {
    const text = clean(raw)
    if (!text) return
    const run = longestCopiedRun(text, index)
    if (run.length > 0) items.push({ key, text, copiedPhrase: run.phrase, copiedLength: run.length })
  }

  consider('summary', draftParsed.summary, sanitize)
  consider('coverLetter', draftParsed.coverLetter, keepParagraphs)
  const achievements = Array.isArray(draftParsed.keyAchievements) ? (draftParsed.keyAchievements as unknown[]) : []
  achievements.forEach((value, i) => consider(`keyAchievements:${i}`, value, sanitize))
  const projects = Array.isArray(draftParsed.projects) ? (draftParsed.projects as unknown[]) : []
  projects.forEach((value, i) => consider(`projects:${i}`, value, sanitize))
  const roles = Array.isArray(draftParsed.workHistory)
    ? (draftParsed.workHistory as Array<{ id?: unknown; bullets?: unknown }>)
    : []
  for (const role of roles) {
    if (typeof role?.id !== 'string' || !Array.isArray(role.bullets)) continue
    ;(role.bullets as unknown[]).forEach((value, i) => consider(`bullet:${role.id}:${i}`, value, sanitize))
  }

  if (items.length === 0) return draftParsed

  const system =
    'Output ONLY valid JSON (no markdown). Return: { rewrites: [{ key, text }] } and nothing else.'
  const user = `Each item below is part of a tailored resume, but it copies wording straight from the job description (copiedPhrase), which makes the tailoring obvious. Rewrite each item in the candidate's own natural voice.

Rules:
- Do not reuse copiedPhrase or any other run of ${MIN_COPIED_WORDS} or more consecutive words from the job description.
- Keep the meaning, the accomplishment, and every number exactly as written.
- Keep technology, tool and product names exactly as spelled.
- Keep the same tense and roughly the same length. Resume bullets, achievements and projects stay one sentence.
- For "coverLetter", return the whole letter with the same greeting, paragraph breaks and signature.
- Write in ${language}.
- Return exactly one rewrite per item, using the given key.

Job description (for reference only — do not copy from it):
${jobDescription}

Items:
${JSON.stringify(items.map(({ key, text, copiedPhrase }) => ({ key, text, copiedPhrase })))}`

  const rewrites = new Map<string, string>()
  try {
    for (const rewrite of (await requestRewrites(system, user)) ?? []) {
      if (typeof rewrite?.key !== 'string') continue
      const clean = rewrite.key === 'coverLetter' ? keepParagraphs(rewrite.text) : sanitize(rewrite.text)
      if (clean) rewrites.set(rewrite.key, clean)
    }
  } catch {
    // Best-effort: on failure every field keeps its original text.
  }

  const accepted = new Map<string, string>()
  for (const item of items) {
    const next = rewrites.get(item.key)
    if (next && longestCopiedRun(next, index).length < item.copiedLength) accepted.set(item.key, next)
  }
  if (accepted.size === 0) return draftParsed

  const pick = (key: string, original: unknown) => accepted.get(key) ?? original
  return {
    ...draftParsed,
    summary: pick('summary', draftParsed.summary),
    coverLetter: pick('coverLetter', draftParsed.coverLetter),
    keyAchievements: Array.isArray(draftParsed.keyAchievements)
      ? achievements.map((value, i) => pick(`keyAchievements:${i}`, value))
      : draftParsed.keyAchievements,
    projects: Array.isArray(draftParsed.projects)
      ? projects.map((value, i) => pick(`projects:${i}`, value))
      : draftParsed.projects,
    workHistory: Array.isArray(draftParsed.workHistory)
      ? roles.map((role) =>
          typeof role?.id === 'string' && Array.isArray(role.bullets)
            ? { ...role, bullets: (role.bullets as unknown[]).map((value, i) => pick(`bullet:${role.id}:${i}`, value)) }
            : role,
        )
      : draftParsed.workHistory,
  }
}
