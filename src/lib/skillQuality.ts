// Skills-section cleanup.
//
// A skills section earns its space with specific, nameable things a reviewer (and an ATS) can
// match: "PostgreSQL", "GitHub Actions", "Jest", "OAuth 2.0". Umbrella terms ("Databases",
// "Cloud Computing", "Frontend Development") and soft skills ("Communication", "Problem Solving")
// say nothing a reader can verify, and they appear most when the model is asked to hit a large
// count. This module strips them deterministically after generation.
//
// Named methods and architectures that recruiters search for verbatim are kept on purpose:
// CI/CD, Microservices, REST, GraphQL, TDD, Agile, Scrum, Event-Driven Architecture, and so on.

const GENERIC_SKILLS = new Set(
  [
    // Soft skills
    'communication', 'teamwork', 'team player', 'collaboration', 'cross-functional collaboration', 'leadership',
    'technical leadership', 'problem solving', 'problem-solving', 'critical thinking', 'analytical thinking',
    'attention to detail', 'time management', 'adaptability', 'creativity', 'self-motivated', 'fast learner',
    'quick learner', 'mentoring', 'mentorship', 'ownership', 'stakeholder management', 'work ethic',
    'decision making', 'decision-making', 'multitasking', 'organization', 'presentation', 'negotiation',
    'customer focus', 'project management', 'team leadership', 'interpersonal',
    // Umbrella terms
    'programming', 'coding', 'software development', 'software engineering', 'web development',
    'frontend development', 'front-end development', 'front end development', 'backend development',
    'back-end development', 'back end development', 'full stack development', 'full-stack development',
    'fullstack development', 'mobile development', 'app development', 'application development',
    'api development', 'web applications', 'web technologies', 'database', 'databases',
    'database management', 'database design', 'cloud', 'cloud computing', 'cloud services', 'cloud platforms',
    'cloud technologies', 'devops', 'testing', 'software testing', 'debugging', 'troubleshooting',
    'version control', 'source control', 'scripting', 'frameworks', 'libraries', 'tools', 'operating systems',
    'algorithms', 'data structures', 'algorithms and data structures', 'data structures and algorithms',
    'oop', 'object-oriented programming', 'object oriented programming', 'design patterns', 'system design',
    'software architecture', 'architecture', 'scalability', 'performance', 'performance optimization',
    'optimization', 'documentation', 'technical documentation', 'code review', 'code reviews',
    'best practices', 'clean code', 'security', 'data analysis', 'analytics', 'automation', 'integration',
    'apis', 'api', 'web services', 'sdlc', 'software development life cycle', 'ui', 'ux', 'ui/ux',
    'responsive design', 'cross-browser compatibility', 'computer science', 'it', 'technology',
  ].map((s) => s.toLowerCase()),
)

// Entire categories that hold only soft skills.
const GENERIC_CATEGORY = /\b(?:soft skills?|interpersonal|personal skills?|core competencies|competencies|strengths)\b/i

const FILLER_PREFIX =
  /^(?:(?:strong|excellent|good|solid|deep|basic|advanced|working|hands-on)\s+)?(?:proficien(?:t|cy) (?:in|with)|experience (?:in|with)|expertise in|knowledge of|familiar(?:ity)? with|understanding of|skilled in)\s+/i

const normalizeKey = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

// Cleans one entry into zero or more concise skills.
//   "Proficient in Python"            -> ["Python"]
//   "AWS (EC2, S3, Lambda)"           -> ["AWS", "EC2", "S3", "Lambda"]
//   "Communication skills"            -> []
//   "Building scalable web services"  -> []  (a sentence, not a skill)
export const refineSkill = (raw: string): string[] => {
  let value = (raw ?? '').toString().replace(/\s+/g, ' ').replace(/[.;:]+$/, '').trim()
  value = value.replace(FILLER_PREFIX, '').trim()
  if (!value) return []

  const grouped = value.match(/^(.+?)\s*\((.+)\)$/)
  if (grouped && /[,/]/.test(grouped[2])) {
    return [grouped[1], ...grouped[2].split(/\s*[,/]\s*/)].flatMap((part) => refineSkill(part))
  }

  const key = normalizeKey(value)
  if (GENERIC_SKILLS.has(key)) return []
  if (/\bskills?$/i.test(value)) return [] // "Communication Skills", "Leadership skills"
  if (value.split(' ').length > 4) return []
  return [value]
}

// Refines every category, removes duplicates across categories (first occurrence wins), and
// drops soft-skill categories and categories left empty.
export const refineSkillCategories = (categories: unknown): Record<string, string[]> => {
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) return {}
  const seen = new Set<string>()
  const result: Record<string, string[]> = {}
  for (const [category, values] of Object.entries(categories as Record<string, unknown>)) {
    if (GENERIC_CATEGORY.test(category) || !Array.isArray(values)) continue
    const kept: string[] = []
    for (const skill of values.flatMap((v) => refineSkill(String(v ?? '')))) {
      const key = normalizeKey(skill)
      if (seen.has(key)) continue
      seen.add(key)
      kept.push(skill)
    }
    if (kept.length > 0) result[category.trim()] = kept
  }
  return result
}

// Applies the cleanup to a parsed model response: the categorized skills and the flat mirror
// (claimedSkills) the repair passes read.
export const refineParsedSkills = <T extends { claimedSkillsByCategory?: unknown; claimedSkills?: unknown }>(
  draftParsed: T,
): T => {
  const hasCategories =
    draftParsed?.claimedSkillsByCategory &&
    typeof draftParsed.claimedSkillsByCategory === 'object' &&
    !Array.isArray(draftParsed.claimedSkillsByCategory)
  const categories = hasCategories ? refineSkillCategories(draftParsed.claimedSkillsByCategory) : undefined
  const flat = categories
    ? Object.values(categories).flat()
    : Array.isArray(draftParsed?.claimedSkills)
      ? refineSkillCategories({ all: draftParsed.claimedSkills }).all ?? []
      : undefined
  return {
    ...draftParsed,
    ...(categories ? { claimedSkillsByCategory: categories } : {}),
    ...(flat ? { claimedSkills: flat } : {}),
  }
}
