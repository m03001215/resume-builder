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
import { saveAs } from 'file-saver'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
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

const buildFileNames = (
  profile: ReturnType<typeof useAuth>['profile'],
  draft: ResumeDraft,
  companyName: string,
): SavedFiles => {
  const firstName = sanitizeFilePart(profile?.first_name ?? '', 'first')
  const lastName = sanitizeFilePart(profile?.last_name ?? '', 'last')
  const skillSlug = sanitizeFilePart(draft.skills.slice(0, 3).join('-'), 'skills')
  const companySlug = sanitizeFilePart(companyName, 'company')
  const baseName = `${firstName}_${lastName}_${skillSlug}_${companySlug}`
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
  const [savedFiles, setSavedFiles] = useState<SavedFiles | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [skillInput, setSkillInput] = useState('')

  const markUnsaved = () => {
    setIsSaved(false)
    setSavedFiles(null)
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
    setSavedFiles(null)
    setHasGenerated(false)
  }

  useEffect(() => {
    if (!isDraftDirty) {
      setDraft(baseDraft)
    }
  }, [baseDraft, isDraftDirty])

  const handleGenerate = async () => {
    if (!companies || companies.length === 0) {
      setError('Please add at least one company before generating.')
      return
    }

    if (!educations || educations.length === 0) {
      setError('Please add at least one education entry before generating.')
      return
    }

    if (!companyName.trim()) {
      setError('Please enter a company name before generating.')
      return
    }

    if (!jobTitle.trim()) {
      setError('Please enter a job title before generating.')
      return
    }

    const jdLength = notes.trim().length
    if (jdLength < 100) {
      setError('Job description must be at least 100 characters.')
      return
    }

    setIsGenerating(true)
    setError(null)

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
    if (!apiKey) {
      setError('Missing OpenAI API key. Please add it to your environment variables.')
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
      candidateName: `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim(),
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
                'You are an expert resume writer. Return ONLY valid JSON with keys: summary, skills, workHistory (with id + bullets array), education (with id), coverLetter. No markdown, no code fences.',
            },
            {
              role: 'user',
              content: `Generate a high-impact, ATS-optimized resume from this JSON. Keep workHistory IDs intact: ${JSON.stringify(
                payload,
              )}

Requirements:
- Summary: powerful, concise, executive tone; 4-6 sentences; each sentence should be rich and specific, including quantified impact, leadership scope, business outcomes, and industry keywords aligned to the job description. Mention total years of experience using payload.careerStartYear and payload.careerEndYear (e.g., “X+ years”).
- Skills: prioritize ATS keywords from the job description (notes); keep to 12-24 items, no fluff.
- WorkHistory: for EACH company, produce exactly 8 bullets.
- Each bullet MUST be 35+ words (count words by whitespace). Do not return any bullet under 35 words.
- Before returning JSON, self-verify every bullet word count. If any bullet is under 35 words, rewrite it until it meets the requirement.
- Bullets must be action-oriented, achievement-driven, keyword-rich, and tailored to the job description.
- Bullets must align strongly with the job description (near 100% match), but also include a few transferable skills not explicitly listed in the JD to keep the resume reusable.
- Bullets should explicitly mention relevant tools/skills (e.g., React, Angular, Vue, TypeScript, AWS, Azure, CI/CD and others) where reasonable and consistent with the timeline.
- Do NOT include company names or date ranges inside bullets. Keep bullets focused on actions, impact, and skills only.
- Bullet content must respect the company period (start/end). Do NOT mention technologies that did not exist in that timeframe. Use plausible tech stacks for the era.
- Timeline guidance: choose technologies that realistically fit the company’s time period; avoid introducing tools that were not common at the time.
- Bullets must sound natural and human, not robotic.
- If dates are missing or ambiguous, use conservative, widely adopted technologies for that time period.
- CoverLetter: write a compelling, modern, and personable letter that feels tailored and confident, not generic. Emphasize value, outcomes, and alignment with the role. Avoid clichés and filler. Do NOT mention the company name. Use the candidate's real name from the profile (no placeholders like [Your Name]). End with a confident, warm call-to-action for an interview.

Return ONLY JSON (no markdown).`,
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

      updateDraft((prev) => ({
        ...prev,
        summary: parsed.summary ?? prev.summary,
        skills: Array.isArray(parsed.skills) ? parsed.skills : prev.skills,
        coverLetter: parsed.coverLetter ?? prev.coverLetter,
        workHistory: prev.workHistory.map((item) => {
          const next = parsed.workHistory?.find((entry: { id: string }) => entry.id === item.id)
          return {
            ...item,
            bullets: Array.isArray(next?.bullets) && next.bullets.length > 0 ? next.bullets : item.bullets,
          }
        }),
      }))
      setHasGenerated(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate content.'
      setError(message)
      updateDraft((prev) => buildMockResume(prev, profile))
      setHasGenerated(true)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSave = async () => {
    if (isSaved || isSaving) return
    if (!hasGenerated) {
      setError('Please generate a resume before saving.')
      return
    }
    if (!profile?.id) {
      setError('Unable to save without a profile.')
      return
    }
    if (!companyName.trim()) {
      setError('Please enter a company name before saving.')
      return
    }
    if (!jobTitle.trim()) {
      setError('Please enter a job title before saving.')
      return
    }
    if (!notes.trim()) {
      setError('Please add a job description before saving.')
      return
    }

    setIsSaving(true)
    setError(null)
    const resolvedCompanyName = companyName.trim()
    const resolvedJobTitle = jobTitle.trim()
  const fileNames = buildFileNames(profile, draft, resolvedCompanyName)
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
      setIsSaving(false)
      return
    }

    setSavedFiles(fileNames)
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
    const resolvedCompanyName = companyName.trim()
    const fileNames = savedFiles ?? buildFileNames(profile, draft, resolvedCompanyName)
    const fullName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
    const titleLine = profile?.role_title ?? ''
    const locationLine = profile?.location ?? ''
    const contactLine = [profile?.phone_number, profile?.email, profile?.linkedin_url]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(' | ')
    const keywordList = Array.from(
      new Set(draft.skills.map((skill) => skill.trim()).filter(Boolean)),
    )
    const experienceRightIndent = 360
    const rightTabStop = 10080 - experienceRightIndent
    const fontFamily = 'Arial'
    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const buildHighlightedRuns = (text: string, size = 21) => {
      if (!text) return [new TextRun({ text, size, color: '111111', font: fontFamily })]
      if (keywordList.length === 0) {
        return [new TextRun({ text, size, color: '111111', font: fontFamily })]
      }
      const pattern = new RegExp(`(${keywordList.map(escapeRegExp).join('|')})`, 'gi')
      return text.split(pattern).filter((chunk) => chunk.length > 0).map((chunk) => {
        const isMatch = keywordList.some(
          (keyword) => keyword.toLowerCase() === chunk.toLowerCase(),
        )
        return new TextRun({ text: chunk, bold: isMatch, size, color: '111111', font: fontFamily })
      })
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
    const buildSkillRows = (skills: string[], columns = 3) => {
      const rows: string[][] = []
      for (let i = 0; i < skills.length; i += columns) {
        rows.push(skills.slice(i, i + columns))
      }
      return rows
    }
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
              rows: buildSkillRows(draft.skills).map((row) =>
                new TableRow({
                  children: Array.from({ length: 3 }).map((_, index) =>
                    new TableCell({
                      width: { size: 33.33, type: WidthType.PERCENTAGE },
                      borders: {
                        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                      },
                      margins: { top: 0, bottom: 0, left: 0, right: 0 },
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: row[index] ? `• ${row[index]}` : '',
                              size: 20,
                              color: '111111',
                              font: fontFamily,
                            }),
                          ],
                          indent: { left: 180, hanging: 90 },
                          spacing: { after: 60 },
                        }),
                      ],
                    }),
                  ),
                }),
              ),
            }),
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
    saveAs(blob, fileNames.resume)
  }

  const handleDownloadCoverLetter = () => {
    const resolvedCompanyName = companyName.trim()
  const fileNames = savedFiles ?? buildFileNames(profile, draft, resolvedCompanyName)
    const blob = new Blob([draft.coverLetter], { type: 'text/plain;charset=utf-8' })
    saveAs(blob, fileNames.coverLetter)
  }

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
            <FiDownload /> Download resume
          </button>
          <button
            type="button"
            onClick={handleDownloadCoverLetter}
            disabled={!isSaved || isSaving}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FiDownload /> Download cover letter
          </button>
        </section>
      </div>
    </div>
  )
}
