// Job-description relevance guard.
//
// The other guards push bullets toward the candidate's own, specific, non-copied stories. The risk
// on that side is drift: a bullet can be specific and true and still show nothing this job asks
// for. This module does two things after generation:
//
//   1. Per role: if too few bullets are on-target, the off-target ones are sent back to be
//      re-angled toward what the posting needs.
//   2. Across the resume: every CORE technology of the job description (named in the title, or
//      named more than once) that at least one role's dates allow must appear in some bullet. Any
//      that does not is assigned to the most recent role whose dates allow it, and that role's
//      weakest bullet is rewritten to show real work with it.
//
// Both go out in a single model call. jdEcho (no copied wording) and techTimeline (dates) still
// run afterwards, so a rewrite can never copy the posting or claim an impossible technology.
//
// Relevance is deliberately loose: a bullet counts as on-target if it names a technology the job
// description names, or shares at least two of the posting's focus terms (its most frequent
// substantive words, e.g. "payments", "latency", "onboarding", "accessibility").

import { evidenceNumbers, findFiller, unsupportedNumbers } from './bulletQuality'
import { TECH_ERAS, roleEndYear } from './techTimeline'

type Tech = { name: string; pattern: RegExp; year?: number }

// Long-established technologies the timeline table leaves out (it only tracks dated ones).
const CORE_TECH: Tech[] = [
  ['JavaScript', /\bJavaScript\b/i], ['Python', /\bPython\b/i], ['Java', /\bJava\b(?!Script)/], ['Go', /\bGo\b(?=[\s,)/]|$)/],
  ['C#', /(?:^|[^\w])C#(?!\w)/], ['C++', /(?:^|[^\w])C\+\+(?!\w)/], ['Ruby', /\bRuby\b/], ['Rails', /\bRails\b/], ['PHP', /\bPHP\b/],
  ['Laravel', /\bLaravel\b/i], ['Scala', /\bScala\b/], ['Django', /\bDjango\b/i], ['Flask', /\bFlask\b/], ['Spring', /\bSpring\b/],
  ['.NET', /\.NET\b/i], ['SQL', /\bSQL\b/], ['NoSQL', /\bNoSQL\b/i], ['PostgreSQL', /\bPostgres(?:QL)?\b/i], ['MySQL', /\bMySQL\b/i],
  ['MongoDB', /\bMongo(?:DB)?\b/i], ['Redis', /\bRedis\b/i], ['Elasticsearch', /\bElastic(?:search)?\b/i], ['RabbitMQ', /\bRabbitMQ\b/i],
  ['AWS', /\bAWS\b/], ['Azure', /\bAzure\b/i], ['GCP', /\b(?:GCP|Google Cloud)\b/i], ['Linux', /\bLinux\b/i], ['HTML', /\bHTML5?\b/i],
  ['CSS', /\bCSS3?\b/i], ['REST', /\bREST(?:ful)?\b/], ['Microservices', /\bmicroservices?\b/i], ['CI/CD', /\bCI\/CD\b/i], ['Git', /\bGit\b/],
  ['S3', /\bS3\b/], ['EC2', /\bEC2\b/], ['RDS', /\bRDS\b/], ['iOS', /\biOS\b/], ['Android', /\bAndroid\b/],
].map(([name, pattern]) => ({ name: name as string, pattern: pattern as RegExp }))

const STOPWORDS = new Set(
  `about above across after again against also among another around because before being below between both build building built
  candidate candidates company could daily deliver delivering design designing develop developing development each either
  engineer engineers engineering ensure every experience experienced first following from great have having help helping
  ideal including into join just know knowledge large looking make making manage many more most must need needs nice other
  others our ours over plus position preferred product products project projects quality question related required
  requirement requirements responsibilities responsible role roles salary should skill skills software solution solutions
  some strong such support system systems team teams than that their them then there these they thing things this those
  through tools under understanding using various well were what when where which while will with within work working
  works would year years your benefit benefits apply applicant opportunity opportunities environment based level ability
  abilities plus bonus equity remote hybrid onsite office location hours time full part great excellent good best world class
  people culture value values mission customers customer users user business businesses technical technology technologies
  hands proven track record familiarity familiar comfortable passion passionate excited exciting collaborate collaborating
  collaboration communication communicate written verbal minimum degree bachelor master computer science equivalent
  senior junior staff principal lead keep move high matter matters call calls able want wants love`.split(/\s+/),
)

const stem = (word: string) => word.replace(/(?:ing|ed|es|s)$/, (suffix) => (word.length - suffix.length >= 4 ? '' : suffix))

const contentWords = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    .map(stem)

const countMatches = (pattern: RegExp, text: string) => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  return (text.match(new RegExp(pattern.source, flags)) ?? []).length
}

export type JdTechnology = Tech & {
  // Named in the job title or more than once in the posting: the technologies that must show up.
  core: boolean
  mentions: number
}

export type JdProfile = {
  technologies: JdTechnology[]
  focusTerms: string[]
}

const FOCUS_TERM_COUNT = 40

export const profileJobDescription = (jobDescription: string, jobTitle = ''): JdProfile => {
  const technologies: JdTechnology[] = [...TECH_ERAS, ...CORE_TECH]
    .map((tech) => {
      const mentions = countMatches(tech.pattern, jobDescription)
      const inTitle = tech.pattern.test(jobTitle)
      return { name: tech.name, pattern: tech.pattern, year: tech.year, mentions, core: inTitle || mentions >= 2 }
    })
    .filter((tech) => tech.mentions > 0 || tech.core)
    .sort((a, b) => Number(b.core) - Number(a.core) || b.mentions - a.mentions)
  const counts = new Map<string, number>()
  for (const word of contentWords(jobDescription)) counts.set(word, (counts.get(word) ?? 0) + 1)
  const focusTerms = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, FOCUS_TERM_COUNT)
    .map(([word]) => word)
  return { technologies, focusTerms }
}

export const bulletRelevance = (bullet: string, profile: JdProfile) => {
  const technologies = profile.technologies.filter((t) => t.pattern.test(bullet)).map((t) => t.name)
  const words = new Set(contentWords(bullet))
  const terms = profile.focusTerms.filter((term) => words.has(term))
  return { relevant: technologies.length > 0 || terms.length >= 2, technologies, terms }
}

// Share of a role's bullets that must be on-target before the role is left alone.
export const MIN_RELEVANT_SHARE = 0.6
// At most this many bullets per role are repurposed to cover missing core technologies.
const MAX_COVERAGE_SLOTS_PER_ROLE = 3

type DatedRole = { id: string; end?: string }
type RoleEntry = { id?: unknown; bullets?: unknown }

// A role may show a technology only if it existed before the role ended. Undated roles and
// undated (long-established) technologies are allowed, matching techTimeline's own rule.
const roleAllows = (role: DatedRole, tech: Tech) => {
  const end = roleEndYear(role.end)
  return tech.year === undefined || end === undefined || end >= tech.year
}

const bulletsOf = (entry: RoleEntry | undefined, sanitize: (value: unknown) => string) =>
  Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]).map(sanitize) : []

// Core job-description technologies no bullet names yet, limited to those some role could show.
export const uncoveredCoreTechnologies = (args: {
  draftParsed: { workHistory?: unknown }
  roles: DatedRole[]
  jobDescription: string
  jobTitle: string
  sanitize: (value: unknown) => string
}) => {
  const { draftParsed, roles, jobDescription, jobTitle, sanitize } = args
  const entries = Array.isArray(draftParsed?.workHistory) ? (draftParsed.workHistory as RoleEntry[]) : []
  const allBullets = entries.flatMap((entry) => bulletsOf(entry, sanitize))
  return profileJobDescription(jobDescription, jobTitle)
    .technologies.filter((tech) => tech.core && !allBullets.some((b) => tech.pattern.test(b)))
    .filter((tech) => roles.some((role) => roleAllows(role, tech)))
    .map((tech) => tech.name)
}

type Rewrite = { key: string; text: string }

export const enforceJdRelevance = async <T extends { workHistory?: unknown }>(args: {
  draftParsed: T
  roles: Array<DatedRole & { company?: string; title?: string; start?: string; existingBullets?: string[] }>
  jobDescription: string
  jobTitle: string
  evidenceTexts: string[]
  language: string
  sanitize: (value: unknown) => string
  requestRewrites: (system: string, user: string) => Promise<Rewrite[] | null>
}): Promise<T> => {
  const { draftParsed, roles, jobDescription, jobTitle, evidenceTexts, language, sanitize, requestRewrites } = args
  // Word overlap only means something when the resume and the posting share a language; for other
  // resume languages the prompt rule carries this alone.
  if (language !== 'English' || !jobDescription.trim()) return draftParsed
  const entries = Array.isArray(draftParsed?.workHistory) ? (draftParsed.workHistory as RoleEntry[]) : []
  if (entries.length === 0) return draftParsed

  const profile = profileJobDescription(jobDescription, jobTitle)
  if (profile.technologies.length === 0 && profile.focusTerms.length === 0) return draftParsed

  type Item = { key: string; roleId: string; text: string; mustCover?: string }
  const items = new Map<string, Item>()
  const roleBullets = new Map<string, string[]>()
  for (const entry of entries) {
    if (typeof entry?.id !== 'string') continue
    roleBullets.set(entry.id, bulletsOf(entry, sanitize))
  }

  // 1. Roles with too few on-target bullets: every off-target bullet is sent back.
  for (const [roleId, bullets] of roleBullets) {
    const offTarget = bullets
      .map((text, i) => ({ text, i }))
      .filter(({ text }) => text && !bulletRelevance(text, profile).relevant)
    const onTargetShare = bullets.length > 0 ? 1 - offTarget.length / bullets.length : 1
    if (onTargetShare >= MIN_RELEVANT_SHARE) continue
    for (const { text, i } of offTarget) items.set(`${roleId}:${i}`, { key: `${roleId}:${i}`, roleId, text })
  }

  // 2. Core technologies no bullet shows yet: repurpose the weakest bullet of the most recent
  //    role whose dates allow the technology.
  const allBullets = Array.from(roleBullets.values()).flat()
  const uncovered = profile.technologies.filter((tech) => tech.core && !allBullets.some((b) => tech.pattern.test(b)))
  const weakness = (text: string) => {
    const r = bulletRelevance(text, profile)
    return (r.relevant ? 10 : 0) + r.technologies.length * 2 + r.terms.length
  }
  const recency = (role: DatedRole) => roleEndYear(role.end) ?? -1
  const rolesByRecency = [...roles].sort((a, b) => recency(b) - recency(a))
  const coverageSlots = new Map<string, number>()
  for (const tech of uncovered) {
    for (const role of rolesByRecency) {
      if (!roleAllows(role, tech) || (coverageSlots.get(role.id) ?? 0) >= MAX_COVERAGE_SLOTS_PER_ROLE) continue
      const bullets = roleBullets.get(role.id) ?? []
      const free = bullets
        .map((text, i) => ({ text, i, key: `${role.id}:${i}` }))
        .filter(({ text, key }) => text && !items.get(key)?.mustCover)
        .sort((a, b) => weakness(a.text) - weakness(b.text))
      const slot = free[0]
      if (!slot) continue
      items.set(slot.key, { key: slot.key, roleId: role.id, text: slot.text, mustCover: tech.name })
      coverageSlots.set(role.id, (coverageSlots.get(role.id) ?? 0) + 1)
      break
    }
  }

  if (items.size === 0) return draftParsed

  const roleContext = roles
    .filter((role) => Array.from(items.values()).some((item) => item.roleId === role.id))
    .map((role) => ({
      id: role.id,
      company: role.company ?? '',
      title: role.title ?? '',
      start: role.start ?? '',
      end: role.end ?? '',
      candidateBullets: role.existingBullets ?? [],
    }))

  const system = 'Output ONLY valid JSON (no markdown). Return: { rewrites: [{ key, text }] } and nothing else.'
  const user = `The candidate is applying for "${jobTitle}". Each resume bullet below needs to be re-angled so it clearly demonstrates something this job asks for: a responsibility, a problem area, or a technology from the job description.

Rules:
- Keep it about the kind of work the candidate plausibly did in that role (use the role's title, company, dates and candidateBullets); shift the emphasis to the part of that work the job cares about. Do not invent a different job.
- If an item has "mustCover", the rewritten bullet must show real, specific work with that technology in that role — what was built, migrated, integrated or operated with it — not a passing mention. The role's dates allow it.
- Use the job description's technologies (jdTechnologies) only where they fit the role AND existed during its dates (start to end).
- Do not copy 6 or more consecutive words from the job description; use your own wording.
- One sentence, 12–25 words, past tense, starting with a strong verb. Keep at least two concrete anchors (a named service, page, job or tool; a technical decision; a real number; a before -> after; a specifically named group).
- Keep any number already in the bullet exactly as written; never add a number that is not in it.
- No filler (leveraged, utilized, spearheaded, robust, seamless, best practices, various, responsible for, worked on, to ensure).
- Write in ${language}. Return exactly one rewrite per item, using the given key.

jdTechnologies: ${JSON.stringify(profile.technologies.map((t) => (t.core ? `${t.name} (core)` : t.name)))}
jdFocusTerms: ${JSON.stringify(profile.focusTerms)}

Job description:
${jobDescription}

Roles:
${JSON.stringify(roleContext)}

Items:
${JSON.stringify(Array.from(items.values()))}`

  const rewrites = new Map<string, string>()
  try {
    for (const rewrite of (await requestRewrites(system, user)) ?? []) {
      if (typeof rewrite?.key !== 'string') continue
      const text = sanitize(rewrite.text)
      if (text) rewrites.set(rewrite.key, text)
    }
  } catch {
    // Best-effort: bullets keep their wording if the call fails.
  }

  // A rewrite is used only if it is now on-target (and names its mustCover technology) and
  // introduces no filler and no new number.
  const accepted = new Map<string, string>()
  const baseEvidence = evidenceNumbers(evidenceTexts)
  for (const item of items.values()) {
    const next = rewrites.get(item.key)
    if (!next || !bulletRelevance(next, profile).relevant || findFiller(next).length > 0) continue
    if (item.mustCover) {
      const tech = profile.technologies.find((t) => t.name === item.mustCover)
      if (tech && !tech.pattern.test(next)) continue
    }
    const evidence = new Set([...baseEvidence, ...evidenceNumbers([item.text])])
    if (unsupportedNumbers(next, evidence).length > 0) continue
    accepted.set(item.key, next)
  }
  if (accepted.size === 0) return draftParsed

  return {
    ...draftParsed,
    workHistory: entries.map((entry) =>
      typeof entry?.id === 'string' && Array.isArray(entry.bullets)
        ? {
            ...entry,
            bullets: (entry.bullets as unknown[]).map((value, i) => accepted.get(`${entry.id}:${i}`) ?? value),
          }
        : entry,
    ),
  }
}
