// Small, deterministic fixes for resume text the model gets wrong in ways a recruiter notices
// immediately.

// --- Years of experience ---------------------------------------------------------------------
// Computed in code rather than left to the model. The old approach handed the model the earliest
// start year and the latest end year and asked it to subtract, which breaks on missing start
// dates (no number at all), counts gaps between jobs as experience, double-counts overlapping
// jobs, and works in whole calendar years (Nov 2019 – Feb 2021 came out as 2 years).

type DatedRole = { start?: string | null; end?: string | null }

// Month index (year * 12 + month) from "YYYY-MM", "YYYY-MM-DD" or "YYYY". A bare year is treated
// as mid-year so it neither inflates nor deflates the total.
const monthIndex = (value: string) => {
  const match = value.match(/\b((?:19|20)\d{2})(?:-(\d{1,2}))?/)
  if (!match) return undefined
  const month = match[2] ? Math.min(12, Math.max(1, Number(match[2]))) : 6
  return Number(match[1]) * 12 + (month - 1)
}

// Whole years of professional experience across all roles, with overlapping roles merged and
// gaps excluded. Returns null when no role has a usable start date.
export const computeExperienceYears = (roles: DatedRole[], now: Date = new Date()): number | null => {
  const nowIndex = now.getFullYear() * 12 + now.getMonth()
  const intervals: Array<[number, number]> = []
  for (const role of roles) {
    const start = monthIndex((role.start ?? '').trim())
    if (start === undefined) continue
    const endRaw = (role.end ?? '').trim()
    const end = !endRaw || /^present$/i.test(endRaw) ? nowIndex : monthIndex(endRaw)
    if (end === undefined) continue
    const stop = Math.min(end, nowIndex) + 1 // end month is inclusive
    if (stop > start) intervals.push([start, stop])
  }
  if (intervals.length === 0) return null

  intervals.sort((a, b) => a[0] - b[0])
  let months = 0
  let [curStart, curStop] = intervals[0]
  for (const [start, stop] of intervals.slice(1)) {
    if (start <= curStop) {
      curStop = Math.max(curStop, stop)
    } else {
      months += curStop - curStart
      ;[curStart, curStop] = [start, stop]
    }
  }
  months += curStop - curStart
  return Math.floor(months / 12)
}

// --- Meta commentary --------------------------------------------------------------------------
// Instruction language leaking into the resume: "0 years of recorded experience", "based on the
// supplied career dates", "Years of experience: unknown". These describe the model's inputs, not
// the candidate, and no human writes them about themselves. Any sentence containing one is removed.
const META_PATTERNS: RegExp[] = [
  /\b0\s*\+?\s*years?\b/i,
  /\bzero years?\b/i,
  /\brecorded (?:professional )?experience\b/i,
  /\b(?:based on|according to|per|from) the (?:supplied|provided|given|available|listed|stated|recorded)\b/i,
  /\b(?:supplied|provided|given|recorded|listed) (?:career |employment |work )?(?:dates|data|history|information|payload)\b/i,
  /\bpayload\b/i,
  /\byears? of experience\s*:\s*(?:unknown|n\/?a|not)\b/i,
  /\b(?:unknown|unspecified|undetermined) (?:number of )?years\b/i,
  /\b(?:dates?|duration|tenure) (?:is |are |were )?(?:missing|unknown|unavailable|not (?:provided|specified|available))\b/i,
  /\bnot (?:provided|specified) in the\b/i,
  /\bas an AI\b/i,
]

export const hasMetaCommentary = (text: string) => META_PATTERNS.some((pattern) => pattern.test(text))

// A sentence ends at . ! ? followed by whitespace or the end of the text, so "Node.js", "2.5x"
// and "99.9%" stay whole; CJK full-width stops end a sentence on their own. Each piece keeps its
// leading whitespace, so joining the kept pieces with '' restores the original spacing.
const splitSentences = (text: string) =>
  (text.match(/[^]*?(?:[.!?]+(?=\s|$)|[。！？]+|$)/g) ?? [text]).filter((piece) => piece.length > 0)

// Removes meta sentences from flowing text, preserving paragraph breaks.
export const stripMetaSentences = (text: string) =>
  text
    .split(/(\n\s*\n)/)
    .map((block) =>
      /^\n\s*\n$/.test(block)
        ? block
        : splitSentences(block)
            .filter((sentence) => !hasMetaCommentary(sentence))
            .join('')
            .trim(),
    )
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

type ParsedResume = {
  summary?: unknown
  coverLetter?: unknown
  keyAchievements?: unknown
  projects?: unknown
  workHistory?: unknown
}

// Applies stripMetaSentences to flowing text and drops list items (bullets, achievements,
// projects) that are meta commentary. An emptied summary or role falls back to the existing
// draft content when the result is applied, so nothing is left blank.
export const removeMetaCommentary = <T extends ParsedResume>(draftParsed: T): T => {
  const flowing = (value: unknown) => (typeof value === 'string' ? stripMetaSentences(value) : value)
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((item) => typeof item !== 'string' || !hasMetaCommentary(item)) : value

  return {
    ...draftParsed,
    summary: flowing(draftParsed.summary),
    coverLetter: flowing(draftParsed.coverLetter),
    keyAchievements: list(draftParsed.keyAchievements),
    projects: list(draftParsed.projects),
    workHistory: Array.isArray(draftParsed.workHistory)
      ? (draftParsed.workHistory as Array<{ bullets?: unknown }>).map((role) =>
          role && Array.isArray(role.bullets) ? { ...role, bullets: list(role.bullets) } : role,
        )
      : draftParsed.workHistory,
  }
}
