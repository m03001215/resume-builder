import { useEffect, useMemo, useState } from 'react'
import {
  FiChevronDown,
  FiChevronUp,
  FiDownload,
  FiFileText,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiZap,
  FiTrash2,
} from 'react-icons/fi'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'

type WorkHistoryItem = {
  id: string
  company: string
  title: string
  start: string
  end: string
  workMode?: 'remote' | 'hybrid' | 'onsite' | null
  location: string
  bullets: string[]
}

type EducationItem = {
  id: string
  school: string
  degree: string
  field: string
  start: string
  end: string
  location: string
}

type ResumeDraft = {
  summary: string
  skills: string[]
  // Optional display lines for grouped skills like "Frontend: React, Vue"
  skillDisplayLines?: string[]
  workHistory: WorkHistoryItem[]
  education: EducationItem[]
  coverLetter: string
}

type SavedFiles = {
  resume: string
  coverLetter: string
}

const formatMonth = (value?: string | null) => {
  if (!value) return ''
  if (/^\d{4}-\d{2}$/.test(value)) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7)
  return value
}

const monthToLabel = (value?: string) => {
  if (!value) return ''
  const [year, month] = value.split('-')
  if (!year || !month) return value
  const date = new Date(Number(year), Number(month) - 1)
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

const workModeLabel = (value?: WorkHistoryItem['workMode']) => {
  if (!value) return ''
  switch (value) {
    case 'remote':
      return 'Remote'
    case 'hybrid':
      return 'Hybrid'
    case 'onsite':
      return 'Onsite'
    default:
      return ''
  }
}

const buildCoverLetter = (name: string, role: string, location: string) => {
  const fullName = name.trim() || 'Candidate'
  const headline = role.trim() || 'professional'
  const city = location.trim() || 'your area'
  return `Hello Hiring Team,\n\nI’m ${fullName}, a ${headline} based in ${city}. I’m excited to share my resume for your review. My background includes delivering measurable results, collaborating across teams, and building solutions that drive impact.\n\nI’d love the opportunity to contribute to your organization. Thank you for your time and consideration.\n\nSincerely,\n${fullName}`
}

const buildInitialDraft = (
  _profile: ReturnType<typeof useAuth>['profile'],
  companies: ReturnType<typeof useAuth>['companies'],
  educations: ReturnType<typeof useAuth>['educations'],
): ResumeDraft => {
  return {
    summary: '',
    skills: [],
    workHistory: (companies ?? []).map((company) => ({
      id: company.id ?? `${company.company_name}-${company.start_date ?? ''}`,
      company: company.company_name ?? '',
      title: company.title ?? '',
      start: formatMonth(company.start_date),
      end: company.is_current ? 'Present' : formatMonth(company.end_date),
      workMode: company.work_mode ?? null,
      location: company.location ?? '',
      bullets: [''],
    })),
    education: (educations ?? []).map((education) => ({
      id: education.id ?? `${education.school_name}-${education.start_date ?? ''}`,
      school: education.school_name ?? '',
      degree: education.degree ?? '',
      field: education.field_of_study ?? '',
      start: formatMonth(education.start_date),
      end: education.is_current ? 'Present' : formatMonth(education.end_date),
      location: education.location ?? '',
    })),
    coverLetter: '',
  }
}

const buildMockResume = (prev: ResumeDraft, profile: ReturnType<typeof useAuth>['profile']): ResumeDraft => {
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
  const role = profile?.role_title?.trim() || 'Full Stack Engineer'
  const location = profile?.location?.trim() || 'Remote'
  const summary = `Full-stack engineer specializing in product delivery, modern web architecture, and scalable APIs. Known for translating ambiguous requirements into reliable releases, improving performance, and mentoring teams while maintaining strong UX, accessibility, and measurable business impact.`
  const skills = [
    'React',
    'TypeScript',
    'Node.js',
    'PostgreSQL',
    'REST APIs',
    'GraphQL',
    'AWS',
    'CI/CD',
  ]
  const defaultBullets = (title: string, company: string) => [
    `Led end-to-end delivery for ${company} as ${title}, aligning product, design, and engineering to ship reliable features that improved activation, retention, and accessibility while meeting aggressive launch timelines.`,
    `Designed scalable APIs and data models that reduced latency and error rates, introducing caching, pagination, and observability practices that kept services stable under peak load and rapid growth conditions.`,
    `Built responsive React interfaces with TypeScript, component libraries, and testing, raising UI quality, performance, and accessibility scores while simplifying maintenance through shared patterns and documentation.`,
    `Partnered with stakeholders to translate ambiguous requirements into clear milestones, writing technical specs, estimating effort, and managing risks so delivery stayed predictable and aligned with business outcomes.`,
    `Automated CI/CD pipelines and infrastructure checks to accelerate releases, improve rollback safety, and shorten feedback loops, enabling the team to ship small, frequent improvements with confidence.`,
    `Implemented security and privacy best practices, including input validation, auth flows, and data governance, ensuring compliance while protecting customer information across internal tools and public-facing experiences.`,
    `Mentored engineers through code reviews, pairing, and architecture sessions, fostering stronger engineering standards, knowledge sharing, and a culture of ownership and continuous improvement.`,
    `Tracked impact with analytics dashboards and experiment frameworks, using data to refine features, prioritize backlog items, and communicate results clearly to leadership and cross-functional partners.`,
  ]

  return {
    ...prev,
    summary,
    skills,
    coverLetter: prev.coverLetter?.trim() || buildCoverLetter(fullName, role, location),
    workHistory: prev.workHistory.map((item) => ({
      ...item,
      bullets: defaultBullets(item.title || 'role', item.company || 'team'),
    })),
  }
}

const sanitizeFilePart = (value: string, fallback: string) => {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return sanitized || fallback
}

const buildCandidateFullName = (profile: ReturnType<typeof useAuth>['profile']) =>
  [profile?.first_name, profile?.middle_name, profile?.last_name]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .trim()

const buildFileNames = (
  profile: ReturnType<typeof useAuth>['profile'],
  companyName: string,
  role?: string,
): SavedFiles => {
  const fullNameSlug = sanitizeFilePart(buildCandidateFullName(profile), 'candidate')
  const roleSlug = sanitizeFilePart(role ?? profile?.role_title ?? '', 'role')
  const companySlug = sanitizeFilePart(companyName ?? '', 'company')
  const baseName = `${fullNameSlug}_${roleSlug}_${companySlug}`
  return {
    resume: `${baseName}_resume.docx`,
    coverLetter: `${baseName}_cover-letter.txt`,
  }
}

export default function ResumeBuilder() {
  const { profile, companies, educations } = useAuth()
  const baseDraft = useMemo(
    () => buildInitialDraft(profile, companies, educations),
    [profile, companies, educations],
  )
  const [draft, setDraft] = useState<ResumeDraft>(baseDraft)
  const [isDraftDirty, setIsDraftDirty] = useState(false)
  const [notes, setNotes] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skillInput, setSkillInput] = useState('')
  const [downloadHandle, setDownloadHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [downloadHandleName, setDownloadHandleName] = useState<string | null>(null)

  // IndexedDB helpers to persist FileSystemDirectoryHandle (structuredClone-capable in supporting browsers)
  const IDB_DB = 'resume-generator-handles'
  const IDB_STORE = 'handles'

  const saveHandleToIDB = async (handle: FileSystemDirectoryHandle) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(IDB_DB, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
      }
      req.onsuccess = () => {
        const db = req.result
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite')
          tx.objectStore(IDB_STORE).put(handle, 'download')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        } catch (err) {
          db.close()
          reject(err)
        }
      }
      req.onerror = () => reject(req.error)
    })
  }

  const getHandleFromIDB = async (): Promise<FileSystemDirectoryHandle | null> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_DB, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
      }
      req.onsuccess = () => {
        const db = req.result
        try {
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.close()
            resolve(null)
            return
          }
          const tx = db.transaction(IDB_STORE, 'readonly')
          const getReq = tx.objectStore(IDB_STORE).get('download')
          getReq.onsuccess = () => {
            const res = getReq.result ?? null
            db.close()
            resolve(res)
          }
          getReq.onerror = () => reject(getReq.error)
        } catch (err) {
          db.close()
          reject(err)
        }
      }
      req.onerror = () => reject(req.error)
    })
  }

  const clearHandleFromIDB = async () => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(IDB_DB, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
      }
      req.onsuccess = () => {
        const db = req.result
        try {
          const tx = db.transaction(IDB_STORE, 'readwrite')
          tx.objectStore(IDB_STORE).delete('download')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        } catch (err) {
          db.close()
          reject(err)
        }
      }
      req.onerror = () => reject(req.error)
    })
  }

  // load persisted handle on mount (if available)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const saved = await getHandleFromIDB()
        if (mounted && saved) {
          setDownloadHandle(saved)
          // FileSystemDirectoryHandle typically has a 'name' property
          setDownloadHandleName((saved as unknown as { name?: string }).name ?? null)
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const chooseDownloadFolder = async () => {
    try {
      const win = window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
      if (win && typeof win.showDirectoryPicker === 'function') {
        const dir = await (win.showDirectoryPicker as unknown as () => Promise<FileSystemDirectoryHandle>)()
        await saveHandleToIDB(dir)
        setDownloadHandle(dir)
        const name = (dir as unknown as { name?: string }).name ?? null
        setDownloadHandleName(name)
        toast.success(name ? `Download folder set: ${name}` : 'Download folder saved')
      }
    } catch {
      // user cancelled or not supported
    }
  }

  const clearSavedDownloadFolder = async () => {
    try {
      await clearHandleFromIDB()
    } catch {
      // ignore
    }
    setDownloadHandle(null)
    setDownloadHandleName(null)
    toast.success('Saved download folder cleared')
  }

  const markUnsaved = () => {
    setIsSaved(false)
    setHasGenerated(false)
  }

  const updateDraft = (updater: (prev: ResumeDraft) => ResumeDraft) => {
    setDraft((prev) => updater(prev))
    setIsSaved(false)
    setIsDraftDirty(true)
    setHasGenerated(false)
  }

  const handleReset = () => {
    setDraft(baseDraft)
    setNotes('')
    setCompanyName('')
    setJobTitle('')
    setError(null)
    setIsSaved(false)
    setIsDraftDirty(false)
    setHasGenerated(false)
  }

  useEffect(() => {
    if (!isDraftDirty) {
      setDraft(baseDraft)
    }
  }, [baseDraft, isDraftDirty])

  const handleGenerate = async () => {
    if (!companies || companies.length === 0) {
      const msg = 'Please add at least one company before generating.'
      setError(msg)
      toast.error(msg)
      return
    }

    if (!educations || educations.length === 0) {
      const msg = 'Please add at least one education entry before generating.'
      setError(msg)
      toast.error(msg)
      return
    }

    if (!companyName.trim()) {
      const msg = 'Please enter a company name before generating.'
      setError(msg)
      toast.error(msg)
      return
    }

    if (!jobTitle.trim()) {
      const msg = 'Please enter a job title before generating.'
      setError(msg)
      toast.error(msg)
      return
    }

    const jdLength = notes.trim().length
    if (jdLength < 100) {
      const msg = 'Job description must be at least 100 characters.'
      setError(msg)
      toast.error(msg)
      return
    }

    setIsGenerating(true)
    setError(null)

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
    if (!apiKey) {
      const msg = 'Missing OpenAI API key. Please add it to your environment variables.'
      setError(msg)
      toast.error(msg)
      setIsGenerating(false)
      return
    }

    const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? 'gpt-4o-mini'
    const getYear = (value?: string) => {
      if (!value) return undefined
      const match = value.match(/\d{4}/)
      return match ? Number(match[0]) : undefined
    }
    const startYears = draft.workHistory
      .map((item) => getYear(item.start))
      .filter((year): year is number => typeof year === 'number')
    const endYears = draft.workHistory
      .map((item) => (item.end === 'Present' ? new Date().getFullYear() : getYear(item.end)))
      .filter((year): year is number => typeof year === 'number')
    const careerStartYear = startYears.length > 0 ? Math.min(...startYears) : undefined
    const careerEndYear = endYears.length > 0 ? Math.max(...endYears) : undefined
    const payload = {
      candidateName: buildCandidateFullName(profile),
      careerStartYear,
      careerEndYear,
      summary: draft.summary,
      skills: draft.skills,
      workHistory: draft.workHistory.map((item) => ({
        id: item.id,
        company: item.company,
        title: item.title,
        start: item.start,
        end: item.end,
        location: item.location,
      })),
      education: draft.education,
      notes,
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          messages: [
            {
              role: 'system',
              content:
                'You are an expert resume writer. Output ONLY valid JSON (no markdown or code fences). Required top-level keys: summary, claimedSkillsByCategory, suggestedSkillsByCategory, claimedSkills, workHistory (array of { id, bullets }), education (array of { id }), coverLetter, notes. All bullets MUST be authored by you (the model). Do not add extra fields.',
            },
            {
              role: 'user',
              content: `Using the following candidate payload and job description, generate a human-written, technically credible JSON resume. Keep workHistory IDs intact: ${JSON.stringify(
                payload,
              )}

INSTRUCTIONS:
1. Read the entire job description (payload.notes) end-to-end before generating any resume content.
2. Treat the job description as the single source of truth for keywords, technologies, architecture terms, tools, and expectations.
3. Do not summarize or paraphrase the job description before processing.
4. Scan the full job description line-by-line and extract as many keywords and key tech stacks as possible, capturing them exactly as written.
5. Collect keywords from the job title, responsibilities, required qualifications, preferred qualifications, nice-to-have sections, and any architecture, scale, or platform descriptions embedded in the text.
6. Classify every extracted keyword into logical categories based on what the job description actually mentions (e.g. languages, frameworks, databases, cloud, DevOps, testing, methodologies, etc.). Use categories that match the job domain.
7. Do not normalize, replace, or infer technologies during extraction.
8. All keywords must initially remain literal to the job description wording.
9. Assign a priority to each keyword:
   a. P1 (Critical): appears in the job title, required section, or multiple times
   b. P2 (Important): appears once or in preferred sections
   c. P3 (Supporting): implied by responsibilities or architectural language
10. The original job-description wording is mandatory and must never be replaced.
11. Do not substitute one technology for another.
12. Do not generalize platforms.
13. Directly inject extracted job-description keywords and tech stacks into the resume.
14. Maximize keyword coverage while maintaining logical consistency with the original resume.
15. If a job-description technology does not exist in the original resume, integrate it realistically into existing responsibilities as usage, collaboration, optimization, migration, integration, or exposure.
16. Never invent new roles, companies, job titles, or project domains.
17. Generate a target title that closely mirrors the job description title and aligns with the candidate's career progression.
18. The Professional Summary must be 3-4 sentences, ATS-optimized, and natural. It must include the exact total years of full-time professional experience computed from payload.careerStartYear and payload.careerEndYear (for example: "10 years"). Do not round up; if dates are missing or ambiguous, state "Years of experience: unknown" and add a brief factual explanation in the 'notes' field.
19. The summary must reference relevant scale, performance, architecture, and business impact using keywords from the job description.
20. The summary must not include company names or personal pronouns.
21. Use past tense for previous roles and present tense only for the current role.
22. Each role must contain 5-7 bullets.
23. Each bullet must be one sentence only. No paragraphs.
24. Every experience bullet must follow this structure: Action Verb -> What was done -> Technologies used -> Outcome or impact.
25. Only 2-3 bullets per role may include measurable impact (percentage improvements, scale, performance, cost, or time saved).
27. The Skills section must be grouped into categories that match the job description's technology domains. Only include skills that are relevant to the job or present in the original resume.
28. Each skills category should include at least 3 skills.
29. All job-description technologies must appear in both Skills and Experience sections.
30. Dates for experience and education must be formatted as: MMM YYYY - MMM YYYY.
31. Before final output, validate that all P1 and P2 keywords are included and used in logical contexts.
32. Provide a job match score between 95 and 99 based on how well the tailored resume aligns with the job requirements.

Additional rules (apply exactly):

- Return exactly one JSON object and nothing else. No markdown, no commentary, no code fences.

- Required top-level keys: summary (string), targetTitle (string), claimedSkillsByCategory (object), suggestedSkillsByCategory (object), claimedSkills (array), workHistory (array of { id, bullets: string[] }), education (array of { id }), coverLetter (string), notes (string), jobMatchScore (number).

- Cover letter requirements: The 'coverLetter' field must begin with a brief greeting (e.g., "Hello Hiring Team," or "Dear Hiring Manager,") and end with a signature line that uses the candidate's name in the form "Kind regards, [Candidate Name]" or "Sincerely, [Candidate Name]" (use payload.candidateName for the name). Do not include company names in the greeting.

- Bullets (strict):
  - Every bullet must be generated by you, be a single sentence, and be at least 25 words long.
  - Each role must contain 5-7 bullets.
  - Bullets must be action-oriented, concrete, mention technologies when relevant, and align with the provided job description (payload.notes).
  - Follow the structure: Action Verb -> What was done -> Technologies used -> Outcome or impact.
  - Do NOT include company names or date ranges inside bullets.
  - Only 2-3 bullets per role may include explicit measurable impact.
  - Bullets must be unique across the entire resume (no duplicates or near-duplicates).

- Skills:
  - Only include claimed skills supported by evidence in the payload (payload.skills, work history, education). Do NOT invent claimed skills.
  - suggestedSkillsByCategory may list reasonable, plausible extensions (0–8 items) but clearly avoid repeating claimed skills.
  - All job-description technologies (P1/P2) must appear in both Skills and Experience sections.

- Honesty & scope:
  - Do NOT fabricate roles, responsibilities, metrics, ownership, or seniority beyond what the payload supports.
  - Infer seniority conservatively from title and timeline; produce role-appropriate technical depth only when plausible.
  - Cross-check each technology against the role's dates; only claim production use of a technology if it was widely available during the role and the payload includes supporting evidence. Otherwise describe exposure conservatively (e.g., evaluated, prototyped, supported) and record the limitation in the 'notes' field.

- Formatting & validation:
  - Ensure the returned JSON parses cleanly.
  - Validate that every bullet meets the 25-word minimum, each role has 5-7 bullets, bullets are single-sentence and unique, and that required P1/P2 keywords are present in logical contexts.
  - If any rule cannot be satisfied, still return JSON but set 'notes' to a short factual explanation of the limitation and include the jobMatchScore reflecting the constraint.

If you understand, return the single JSON object now.`,
            },
          ],
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const message = data?.error?.message ?? `OpenAI request failed (${response.status}).`
        throw new Error(message)
      }

      const content = data?.choices?.[0]?.message?.content ?? '{}'
      const sanitizedContent = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()
      const parsed = JSON.parse(sanitizedContent)

      // helper to build display lines from categorized objects
      // merges claimed and suggested categories into lines like:
      // Category: claimed1, claimed2; suggested: suggested1, suggested2
      const buildDisplayLinesFromCategories = (
        claimed: Record<string, string[]> = {},
        suggested: Record<string, string[]> = {},
      ) =>
        Object.keys({ ...claimed, ...suggested })
          .filter((k) => ((claimed[k] ?? []).length > 0) || ((suggested[k] ?? []).length > 0))
          .map((k) => {
            const claimedItems = (claimed[k] ?? []).map((s) => (s ?? '').trim()).filter(Boolean)
            const suggestedItems = (suggested[k] ?? []).map((s) => (s ?? '').trim()).filter(Boolean)
            // merge claimed and suggested items, claimed first, deduplicated preserving order
            const seen = new Set<string>()
            const merged: string[] = []
            for (const it of [...claimedItems, ...suggestedItems]) {
              const key = it.toLowerCase()
              if (!seen.has(key)) {
                seen.add(key)
                merged.push(it)
              }
            }
            return `${k}: ${merged.join(', ')}`
          })

      updateDraft((prev) => {
        // determine flattened claimed skills and optional display lines
        let flatSkills: string[] | undefined = undefined
        let skillDisplayLines: string[] | undefined = undefined

        if (parsed.claimedSkillsByCategory && typeof parsed.claimedSkillsByCategory === 'object') {
          // prefer categorized response
          const cat = parsed.claimedSkillsByCategory as Record<string, string[]>
          const suggestedCat = parsed.suggestedSkillsByCategory && typeof parsed.suggestedSkillsByCategory === 'object'
            ? (parsed.suggestedSkillsByCategory as Record<string, string[]>)
            : {}
          flatSkills = Array.from(new Set((Object.values(cat) ?? []).flat().map((s) => (s ?? '').trim()).filter(Boolean)))
          skillDisplayLines = buildDisplayLinesFromCategories(cat, suggestedCat)
        } else if (Array.isArray(parsed.claimedSkills)) {
          // fallback: model returned flat claimedSkills
          flatSkills = parsed.claimedSkills.map((s: string) => (s ?? '').trim()).filter(Boolean)
        } else if (Array.isArray(parsed.skills)) {
          // legacy fallback
          flatSkills = parsed.skills.map((s: string) => (s ?? '').trim()).filter(Boolean)
        }

        // if we didn't get categorized claimed skills but have suggested categories, show them
        if (!skillDisplayLines && parsed.suggestedSkillsByCategory && typeof parsed.suggestedSkillsByCategory === 'object') {
          const suggestedOnly = parsed.suggestedSkillsByCategory as Record<string, string[]>
          skillDisplayLines = buildDisplayLinesFromCategories({}, suggestedOnly)
        }

        // helper to sanitize text returned from the model
        const sanitizeText = (s: string) =>
          (s ?? '')
            .replace(/`+/g, '') // strip inline/backtick code markers
            .replace(/^\s+|\s+$/g, '')
            .replace(/\s+/g, ' ')

        // helper: infer seniority from title
        const inferSeniority = (title?: string) => {
          if (!title) return 'mid'
          const t = title.toLowerCase()
          if (/\b(intern|internship|junior|jr\.)\b/.test(t)) return 'junior'
          if (/\b(senior|sr\.|lead|principal|manager|director|vp|head|staff)\b/.test(t)) return 'senior'
          return 'mid'
        }

        // helper: desired bullet count range by seniority
        const targetRangeFor = (seniority: string) => {
          switch (seniority) {
            case 'junior':
              return [3, 5]
            case 'senior':
              return [5, 7]
            default:
              return [4, 6]
          }
        }

        // helper: split a long bullet into sentence-like parts to create more bullets
        const splitIntoFragments = (text: string) =>
          (text ?? '')
            .split(/(?<=[.!?;])\s+/)
            .map((s) => s.replace(/[\s\n]+/g, ' ').trim())
            .filter(Boolean)

        // helper: expand or trim bullets to match desired counts without inventing new claims
        const normalizeCount = (bullets: string[], title?: string) => {
          const seniority = inferSeniority(title)
          const [minCount, maxCount] = targetRangeFor(seniority)

          // sanitize bullets
          const sanitized = bullets.map((b) => sanitizeText(b)).filter(Boolean)

          // if already within range, return as-is (or trim to max)
          if (sanitized.length >= minCount && sanitized.length <= maxCount) return sanitized.slice(0, maxCount)

          // if too many, trim to max
          if (sanitized.length > maxCount) return sanitized.slice(0, maxCount)

          // if too few, try to split long bullets into sentence fragments
          const expanded: string[] = []
          for (const b of sanitized) {
            const parts = splitIntoFragments(b)
            if (parts.length > 1) {
              for (const p of parts) {
                if (expanded.length < maxCount) expanded.push(p)
              }
            } else {
              expanded.push(b)
            }
            if (expanded.length >= minCount) break
          }

          // if still short, try secondary split on ' and ' (conservative)
          if (expanded.length < minCount) {
            for (const b of sanitized) {
              const parts = b.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean)
              if (parts.length > 1) {
                for (const p of parts) {
                  if (!expanded.includes(p) && expanded.length < maxCount) expanded.push(p)
                }
              }
              if (expanded.length >= minCount) break
            }
          }

          // final fallback: repeat existing bullets with conservative, non-fabricated prefix to reach minCount
          let idx = 0
          while (expanded.length < minCount && sanitized.length > 0) {
            const candidate = sanitized[idx % sanitized.length]
            const variation = candidate.startsWith('Contributed') || candidate.startsWith('Supported') ? candidate : `Contributed to ${candidate.charAt(0).toLowerCase()}${candidate.slice(1)}`
            if (!expanded.includes(variation)) expanded.push(variation)
            idx += 1
            if (idx > sanitized.length * 3) break
          }

          return expanded.slice(0, maxCount)
        }

        // deduplicate and normalize bullets for each company
        // use a globalSeen set to avoid repeating semantically identical bullets across companies
        const normalize = (s: string) => sanitizeText(s).toLowerCase()

        const globalSeen = new Set<string>()

        const workHistory = prev.workHistory.map((item) => {
          const next = parsed.workHistory?.find((entry: { id: string }) => entry.id === item.id)
          const incoming = Array.isArray(next?.bullets) && next.bullets.length > 0 ? next.bullets : item.bullets
          const localSeen = new Set<string>()
          const deduped: string[] = []

          for (const raw of incoming.map((b: string) => (b ?? '').trim()).filter(Boolean)) {
            const b = sanitizeText(raw)
            const key = normalize(b)

            if (localSeen.has(key) || globalSeen.has(key)) {
              // attempt a light role-based variation if possible (do not invent companies)
              if (item.title) {
                // only add role prefix if the bullet doesn't already appear role-prefixed
                if (!/^as a\s+/i.test(b)) {
                  const rolePrefix = `As a ${item.title}, `
                  const modified = rolePrefix + b.charAt(0).toLowerCase() + b.slice(1)
                  const modKey = normalize(modified)
                  if (!localSeen.has(modKey) && !globalSeen.has(modKey)) {
                    localSeen.add(modKey)
                    globalSeen.add(modKey)
                    deduped.push(modified)
                    continue
                  }
                }
              }
              // skip duplicate if no safe variation can be produced
              continue
            }

            localSeen.add(key)
            globalSeen.add(key)
            deduped.push(b)
          }

          const finalBullets = normalizeCount(deduped.length > 0 ? deduped : item.bullets, item.title)
          return {
            ...item,
            bullets: finalBullets,
          }
        })

        return {
          ...prev,
          summary: parsed.summary ? sanitizeText(parsed.summary) : prev.summary,
            skills: Array.isArray(flatSkills) && flatSkills.length > 0 ? flatSkills : prev.skills,
            skillDisplayLines,
            coverLetter: parsed.coverLetter ? sanitizeText(parsed.coverLetter) : prev.coverLetter,
          workHistory,
        }
      })
      setHasGenerated(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate content.'
      setError(message)
      toast.error(message)
      updateDraft((prev) => buildMockResume(prev, profile))
      setHasGenerated(true)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSave = async () => {
    if (isSaved || isSaving) return
    if (!hasGenerated) {
      const msg = 'Please generate a resume before saving.'
      setError(msg)
      toast.error(msg)
      return
    }
    if (!profile?.id) {
      const msg = 'Unable to save without a profile.'
      setError(msg)
      toast.error(msg)
      return
    }
    if (!companyName.trim()) {
      const msg = 'Please enter a company name before saving.'
      setError(msg)
      toast.error(msg)
      return
    }
    if (!jobTitle.trim()) {
      const msg = 'Please enter a job title before saving.'
      setError(msg)
      toast.error(msg)
      return
    }
    if (!notes.trim()) {
      const msg = 'Please add a job description before saving.'
      setError(msg)
      toast.error(msg)
      return
    }

    setIsSaving(true)
    setError(null)
    const resolvedCompanyName = companyName.trim()
    const resolvedJobTitle = jobTitle.trim()
    const fileNames = buildFileNames(profile, resolvedCompanyName, resolvedJobTitle)
    const { error: insertError } = await supabase.from('applied_jobs').insert({
      profile_id: profile.id,
      company_name: resolvedCompanyName || null,
      job_title: resolvedJobTitle || null,
      job_description: notes.trim(),
      resume_name: fileNames.resume,
      cover_letter_name: fileNames.coverLetter,
      skills: draft.skills,
    })

    if (insertError) {
      setError(insertError.message)
      toast.error(insertError.message)
      setIsSaving(false)
      return
    }

    // filenames persisted to DB via resume_name / cover_letter_name; no local savedFiles state
    setIsSaved(true)
    setIsSaving(false)
  }

  const moveItem = (items: string[], from: number, to: number) => {
    if (to < 0 || to >= items.length) return items
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  }

  const handleDownloadResume = async () => {
    // Require user to choose a download folder explicitly
    if (!downloadHandle) {
      toast.error('Please choose the folder which saves resume and cover letter')
      return
    }
    const fullName = buildCandidateFullName(profile)
    const titleLine = profile?.role_title ?? ''
    const locationLine = profile?.location ?? ''
    const contactLine = [profile?.phone_number, profile?.email, profile?.linkedin_url]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(' | ')
    // Prepare skills for display in DOCX.
    // If skills are provided in "Category: item" form, group them by category
    // and render as "Category: item1, item2". Keep uncategorized skills as-is.
    let displaySkills: string[]
    let flatKeywords: string[]
    if (Array.isArray(draft.skillDisplayLines) && draft.skillDisplayLines.length > 0) {
      // model returned categorized display lines
      displaySkills = draft.skillDisplayLines
      // build flat keywords from those lines (category: item1, item2 -> items)
      flatKeywords = draft.skillDisplayLines
        .map((line) => line.split(':').slice(1).join(':'))
        .map((s) => s.split(',').map((p) => p.trim()).filter(Boolean))
        .flat()
    } else {
      const rawSkills = draft.skills.map((s) => s.trim()).filter(Boolean)
      const categoryMap: Record<string, string[]> = {}
      const uncategorized: string[] = []
      for (const s of rawSkills) {
        const parts = s.split(':').map((p) => p.trim()).filter(Boolean)
        if (parts.length >= 2) {
          const category = parts[0]
          const item = parts.slice(1).join(':')
          categoryMap[category] = categoryMap[category] ?? []
          if (!categoryMap[category].includes(item)) categoryMap[category].push(item)
        } else {
          if (!uncategorized.includes(s)) uncategorized.push(s)
        }
      }
      displaySkills = [
        ...Object.keys(categoryMap).map((cat) => `${cat}: ${categoryMap[cat].join(', ')}`),
        ...uncategorized,
      ]

      // Keywords used for highlighting should include both raw skills and grouped items
      flatKeywords = Array.from(new Set(rawSkills.concat(...Object.values(categoryMap))))
    }

    // Expand keyword list to maximize highlighting in bullets:
    // - include flatKeywords (from skills and grouped items)
    // - also include component tokens from multi-word phrases (e.g., 'AWS Lambda' -> 'AWS', 'Lambda')
    // - deduplicate and sort by length desc so longer phrases match before shorter tokens
    const extraTokens = flatKeywords
      .map((k) => k.split(/[\s,/\-()]+/).map((t) => t.trim()).filter(Boolean))
      .flat()
    const keywordSet = new Set<string>([...flatKeywords.map((k) => k.trim()).filter(Boolean), ...extraTokens.map((k) => k.trim()).filter(Boolean)])
    const keywordList = Array.from(keywordSet).filter(Boolean).sort((a, b) => b.length - a.length)
    const experienceRightIndent = 360
    const rightTabStop = 10080 - experienceRightIndent
    const fontFamily = 'Arial'
    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const buildHighlightedRuns = (text: string, size = 21) => {
      if (!text) return [new TextRun({ text, size, color: '111111', font: fontFamily })]
      if (keywordList.length === 0) {
        return [new TextRun({ text, size, color: '111111', font: fontFamily })]
      }
      // match whole words only to avoid highlighting substrings (e.g., 'git' inside 'digital')
      const pattern = new RegExp(`\\b(${keywordList.map(escapeRegExp).join('|')})\\b`, 'gi')
      return text
        .split(pattern)
        .filter((chunk) => chunk.length > 0)
        .map((chunk) => {
          const isMatch = keywordList.some(
            (keyword) => keyword.toLowerCase() === chunk.toLowerCase(),
          )
          return new TextRun({ text: chunk, bold: isMatch, size, color: '111111', font: fontFamily })
        })
    }
    // Build runs for a skill line of the form "Category: item1, item2"
    // Highlight (bold) the category label only; leave the items unhighlighted/plain.
    const buildHighlightedSkillRuns = (text: string, size = 21) => {
      if (!text) return [new TextRun({ text, size, color: '111111', font: fontFamily })]
      const idx = text.indexOf(':')
      if (idx === -1) {
        // no category separator — render as plain highlighted runs (keywords elsewhere still bold)
        return buildHighlightedRuns(text, size)
      }
      const prefix = text.slice(0, idx + 1) + ' '
      const rest = text.slice(idx + 1).trim()
      // category label should be bold
      const prefixRun = new TextRun({ text: prefix, bold: true, size, color: '111111', font: fontFamily })
      // items should be plain (no keyword highlighting here)
      const restRun = new TextRun({ text: rest, size, color: '111111', font: fontFamily })
      return [prefixRun, restRun]
    }
    const experienceLine = (
      left: string,
      right: string,
      {
        boldLeft = false,
        leftColor = '111111',
  leftSize = 21,
  rightSize = 19,
      }: {
        boldLeft?: boolean
        leftColor?: string
        leftSize?: number
        rightSize?: number
      } = {},
    ) =>
      new Paragraph({
        children: [
          new TextRun({ text: left, bold: boldLeft, size: leftSize, color: leftColor, font: fontFamily }),
          new TextRun({ text: '\t' }),
          new TextRun({ text: right, size: rightSize, color: '555555', font: fontFamily }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: rightTabStop }],
        alignment: AlignmentType.LEFT,
        indent: { right: experienceRightIndent },
        spacing: { after: 40 },
      })
    const bulletLine = (text: string) =>
      new Paragraph({
        children: buildHighlightedRuns(text, 20),
        bullet: { level: 0 },
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 30 },
      })
    const sectionHeading = (text: string) =>
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            color: '111111',
            size: 21,
            font: fontFamily,
          }),
        ],
        spacing: { before: 200, after: 80 },
        border: {
          bottom: {
            color: '333333',
            space: 1,
            value: BorderStyle.SINGLE,
            size: 12,
          },
        },
      })
    const educationMeta = (text: string) =>
      new Paragraph({
        children: [new TextRun({ text, size: 19, color: '555555', font: fontFamily })],
        spacing: { after: 60 },
      })
    
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: fontFamily,
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1080,
                bottom: 1080,
                left: 1080,
                right: 1080,
              },
            },
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: fullName,
                  bold: true,
                  size: 38,
                  color: '111111',
                  font: fontFamily,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 40 },
            }),
            ...(titleLine
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: titleLine,
                        bold: true,
                        size: 23,
                        color: '333333',
                        font: fontFamily,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: locationLine ? 20 : 40 },
                  }),
                ]
              : []),
            ...(locationLine
              ? [
                  new Paragraph({
                    children: [new TextRun({ text: locationLine, size: 20, color: '555555', font: fontFamily })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: contactLine ? 10 : 50 },
                  }),
                ]
              : []),
            ...(contactLine
              ? [
                  new Paragraph({
                    children: [new TextRun({ text: contactLine, size: 20, color: '555555', font: fontFamily })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 60 },
                  }),
                ]
              : []),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              layout: TableLayoutType.FIXED,
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 100, type: WidthType.PERCENTAGE },
                      borders: {
                        top: { style: BorderStyle.SINGLE, size: 18, color: '000000' },
                        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                      },
                      margins: { top: 0, bottom: 0, left: 0, right: 0 },
                      children: [new Paragraph({ text: '' })],
                    }),
                  ],
                }),
              ],
            }),
            new Paragraph({ text: '', spacing: { before: 16, after: 40 } }),
            sectionHeading('SUMMARY'),
            new Paragraph({
              children: buildHighlightedRuns(draft.summary, 21),
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 140 },
            }),
            sectionHeading('TECHNICAL SKILLS'),
              // Render each skill display line as a full-width bullet (not a multi-column grid)
              // displaySkills contains lines like "Frontend: React, TypeScript" or uncategorized skills
              ...displaySkills.map((line) =>
                new Paragraph({
                  children: buildHighlightedSkillRuns(line, 20),
                  bullet: { level: 0 },
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 60 },
                }),
              ),
            new Paragraph({ text: '', spacing: { after: 80 } }),
            sectionHeading('EXPERIENCE'),
            ...draft.workHistory.flatMap((item) => [
              experienceLine(
                item.title || 'Role',
                `${monthToLabel(item.start)} - ${
                  item.end === 'Present' ? 'Present' : monthToLabel(item.end)
                }`,
                { boldLeft: true, leftSize: 21, rightSize: 19 },
              ),
              experienceLine(
                item.company || 'Company',
                [item.location, workModeLabel(item.workMode)].filter(Boolean).join(' | '),
                { leftColor: '1f4e79', leftSize: 21, rightSize: 19 },
              ),
              ...item.bullets.map((bullet) => bulletLine(bullet)),
              new Paragraph({ text: '' }),
            ]),
            sectionHeading('EDUCATION'),
            ...draft.education.map(
              (edu) =>
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${edu.degree} ${edu.field ? `in ${edu.field}` : ''}`.trim(),
                      bold: true,
                      size: 21,
                      color: '111111',
                      font: fontFamily,
                    }),
                  ],
                  spacing: { after: 40 },
                }),
            ),
            ...draft.education.map((edu) =>
              educationMeta(
                [
                  [edu.school, edu.location].filter(Boolean).join(' | '),
                  `${monthToLabel(edu.start)} - ${
                    edu.end === 'Present' ? 'Present' : monthToLabel(edu.end)
                  }`,
                ]
                  .filter(Boolean)
                  .join(' | '),
              ),
            ),
          ],
        },
      ],
    })

    const blob = await Packer.toBlob(doc)
    const fullNameSlug = sanitizeFilePart(buildCandidateFullName(profile), 'candidate')
    const roleSlug = sanitizeFilePart(jobTitle || profile?.role_title || '', 'role')
    const companySlug = sanitizeFilePart(companyName || '', 'company')
    const folderName = `${fullNameSlug}_${roleSlug}_${companySlug}`
    const coverText = draft.coverLetter || ''

    try {
      const folderHandle = await downloadHandle.getDirectoryHandle(folderName, { create: true })
      const resumeHandle = await folderHandle.getFileHandle('resume.docx', { create: true })
      const resumeWritable = await resumeHandle.createWritable()
      await resumeWritable.write(blob)
      await resumeWritable.close()

      const coverHandle = await folderHandle.getFileHandle('coverletter.txt', { create: true })
      const coverWritable = await coverHandle.createWritable()
      await coverWritable.write(new Blob([coverText], { type: 'text/plain;charset=utf-8' }))
      await coverWritable.close()

      toast.success(`Saved resume and cover letter to ${folderName}`)
      return
    } catch {
      // writing to persisted handle failed - instruct user to reselect
      toast.error('Unable to write to the selected folder. Please choose the folder again.')
      return
    }
  }

  // cover-letter-specific handler removed: downloads now bundled with `handleDownloadResume`

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-soft backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/40">
            <FiFileText className="text-base" />
          </div>
          <div>
            <p className="text-xs font-semibold text-indigo-300">Resume tools</p>
            <h1 className="text-2xl font-semibold text-white">Resume & Cover Letter</h1>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Generate a resume DOCX and a cover letter TXT using your saved profile.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">Generation notes</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 rounded-full bg-indigo-500/80 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? (
                  <>
                    <LoadingSpinner label="Generating" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FiZap /> Generate
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200"
              >
                <FiRefreshCw /> Reset
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-300">
              Company name <span className="text-red-400">*</span>
              <input
                value={companyName}
                onChange={(event) => {
                  setCompanyName(event.target.value)
                  markUnsaved()
                }}
                placeholder="Acme Inc"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-slate-300">
              Job title <span className="text-red-400">*</span>
              <input
                value={jobTitle}
                onChange={(event) => {
                  setJobTitle(event.target.value)
                  markUnsaved()
                }}
                placeholder="Senior Frontend Engineer"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
              />
            </label>
          </div>
          <textarea
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value)
              markUnsaved()
            }}
            rows={6}
            placeholder="Add a target role, job link, or any notes for the AI..."
            className="mt-4 w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none hide-scrollbar"
          />
          {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={chooseDownloadFolder}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:border-indigo-400 hover:text-white"
            >
              Choose download folder
            </button>
            {downloadHandleName ? (
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span>Folder: <strong className="text-slate-100">{downloadHandleName}</strong></span>
                <button
                  type="button"
                  onClick={clearSavedDownloadFolder}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-xs font-semibold text-rose-300 transition hover:border-rose-400 hover:text-white"
                >
                  Clear
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-400">No saved download folder (Chrome/Edge only)</span>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur lg:col-span-2">
          <h2 className="text-base font-semibold text-white">Summary</h2>
          <p className="mt-1 text-xs text-slate-400">Keep this to a single, punchy line.</p>
          <textarea
            value={draft.summary}
            onChange={(event) =>
              updateDraft((prev) => ({ ...prev, summary: event.target.value }))
            }
            placeholder="Professional Summary here..."
            rows={4}
            className="mt-3 w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none hide-scrollbar"
          />
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Core skills</h2>
            <span className="text-xs text-slate-400">Add and manage skills</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Add skills and remove them anytime.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.skills.map((skill, index) => (
              <div
                key={`${skill}-${index}`}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-100"
              >
                <span className="font-semibold">{skill}</span>
                <button
                  type="button"
                  onClick={() =>
                    updateDraft((prev) => ({
                      ...prev,
                      skills: prev.skills.filter((_, idx) => idx !== index),
                    }))
                  }
                  className="text-slate-400 transition hover:text-rose-300"
                >
                  <FiTrash2 />
                </button>
              </div>
            ))}
            {draft.skills.length === 0 && (
              <span className="text-xs text-slate-400">No skills added yet.</span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={skillInput}
              onChange={(event) => setSkillInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  const nextSkill = skillInput.trim()
                  if (!nextSkill) return
                  updateDraft((prev) => ({
                    ...prev,
                    skills: [...prev.skills, nextSkill],
                  }))
                  setSkillInput('')
                }
              }}
              placeholder="Add a skill"
              className="min-w-[200px] flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const nextSkill = skillInput.trim()
                if (!nextSkill) return
                updateDraft((prev) => ({
                  ...prev,
                  skills: [...prev.skills, nextSkill],
                }))
                setSkillInput('')
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:border-indigo-400 hover:text-white"
            >
              <FiPlus /> Add skill
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur lg:col-span-2">
          <h2 className="text-base font-semibold text-white">Work history</h2>
          <div className="mt-4 space-y-4">
            {draft.workHistory.map((item, index) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {item.title || 'Role'} · {item.company || 'Company'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {monthToLabel(item.start)} - {item.end === 'Present' ? 'Present' : monthToLabel(item.end)}
                    </p>
                  </div>
                  {(item.location || item.workMode) && (
                    <div className="text-xs text-slate-400">
                      {[item.location, workModeLabel(item.workMode)].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {item.bullets.map((bullet, bulletIndex) => (
                    <div
                      key={`${item.id}-${bulletIndex}`}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1.5"
                    >
                      <span className="text-base leading-none text-indigo-200">•</span>
                      <input
                        value={bullet}
                        onChange={(event) =>
                          updateDraft((prev) => {
                            const next = [...prev.workHistory]
                            const bullets = [...next[index].bullets]
                            bullets[bulletIndex] = event.target.value
                            next[index] = { ...next[index], bullets }
                            return { ...prev, workHistory: next }
                          })
                        }
                        placeholder="Add a key accomplishment here."
                        className="flex-1 bg-transparent px-2 py-1 text-xs text-slate-100 focus:outline-none"
                      />
                      <div className="flex items-center gap-1 text-slate-400">
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft((prev) => {
                              const next = [...prev.workHistory]
                              const bullets = moveItem(next[index].bullets, bulletIndex, bulletIndex - 1)
                              next[index] = { ...next[index], bullets }
                              return { ...prev, workHistory: next }
                            })
                          }
                          className="transition hover:text-white"
                        >
                          <FiChevronUp />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft((prev) => {
                              const next = [...prev.workHistory]
                              const bullets = moveItem(next[index].bullets, bulletIndex, bulletIndex + 1)
                              next[index] = { ...next[index], bullets }
                              return { ...prev, workHistory: next }
                            })
                          }
                          className="transition hover:text-white"
                        >
                          <FiChevronDown />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft((prev) => {
                              const next = [...prev.workHistory]
                              next[index] = {
                                ...next[index],
                                bullets: next[index].bullets.filter((_, idx) => idx !== bulletIndex),
                              }
                              return { ...prev, workHistory: next }
                            })
                          }
                          className="transition hover:text-rose-300"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft((prev) => {
                        const next = [...prev.workHistory]
                        next[index] = { ...next[index], bullets: [...next[index].bullets, ''] }
                        return { ...prev, workHistory: next }
                      })
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-200 transition hover:text-white"
                  >
                    <FiPlus /> Add bullet
                  </button>
                </div>
              </div>
            ))}
            {draft.workHistory.length === 0 && (
              <p className="text-xs text-slate-400">Add company history to build bullets.</p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur lg:col-span-2">
          <h2 className="text-base font-semibold text-white">Education</h2>
          <div className="mt-4 space-y-3">
            {draft.education.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <p className="text-sm font-semibold text-white">
                  {item.degree} {item.field ? `in ${item.field}` : ''}
                </p>
                <p className="text-xs text-slate-400">
                  {[item.school, item.location].filter(Boolean).join(' · ')} · {monthToLabel(item.start)} - {item.end === 'Present' ? 'Present' : monthToLabel(item.end)}
                </p>
              </div>
            ))}
            {draft.education.length === 0 && (
              <p className="text-xs text-slate-400">No education entries yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur lg:col-span-2">
          <h2 className="text-base font-semibold text-white">Cover letter</h2>
          <textarea
            value={draft.coverLetter}
            onChange={(event) =>
              updateDraft((prev) => ({ ...prev, coverLetter: event.target.value }))
            }
            rows={6}
            placeholder="Write a short cover letter tailored to the role, highlighting your impact, strengths, and interest in the company."
            className="mt-3 w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none hide-scrollbar"
          />
        </section>

        <section className="flex flex-wrap items-center gap-3 lg:col-span-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isSaved || !hasGenerated}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500/80 px-5 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <LoadingSpinner label="Saving application" />
                Saving...
              </>
            ) : isSaved ? (
              <>
                <FiSave /> Saved
              </>
            ) : (
              <>
                <FiSave /> Save
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownloadResume}
            disabled={!isSaved || isSaving}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FiDownload /> Download
          </button>
          {/* cover letter download removed - unified into single Download button */}
        </section>
      </div>
    </div>
  )
}
