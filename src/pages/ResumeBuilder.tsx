import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiDownload,
  FiFileText,
  FiFolder,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiX,
  FiZap,
  FiTrash2,
} from 'react-icons/fi'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  TabStopType,
  TextRun,
} from 'docx'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'
import {
  enforceSpecificBullets,
  ensureBulletCount,
  MAX_BULLETS_PER_ROLE,
  type QualityRole,
} from '../lib/bulletQuality'
import { enforceNaturalPhrasing } from '../lib/jdEcho'
import { enforceJdRelevance, uncoveredCoreTechnologies } from '../lib/jdRelevance'
import { buildResumePrompt, RESUME_SYSTEM_PROMPT } from '../lib/resumePrompt'
import { backfillSkillsFromBullets, refineParsedSkills } from '../lib/skillQuality'
import { computeExperienceYears, removeMetaCommentary } from '../lib/resumeHygiene'
import { enforceTechTimeline, type TimelineRole } from '../lib/techTimeline'

type ResumeLanguage = 'English' | 'Japanese' | 'Chinese' | 'Spanish'

// CJK scripts have no glyphs in jsPDF's built-in fonts, so those languages are drawn to a
// canvas and embedded as an image. Latin-script languages keep the native-font path, whose
// text stays selectable (and therefore ATS-readable).
const needsRasterizedPdf = (language: ResumeLanguage) => language === 'Japanese' || language === 'Chinese'

type ResumeStyle = 'Classic' | 'Modern' | 'Minimal' | 'Executive' | 'Creative' | 'TrueCircle' | 'Wide'

type ResumeStylePreset = {
  label: string
  description: string
  headerAlign: 'center' | 'left'
  fontFamily: string
  pdfFontFamily: 'times' | 'helvetica' | 'courier'
  pdfPageSizePt?: [number, number]
  pdfMarginPt?: number
  pdfMarginPtX?: number
  pdfMarginPtY?: number
  docxMarginTwips?: number
  docxMarginTwipsX?: number
  docxMarginTwipsY?: number
  docxPageSizeTwips?: { width: number; height: number }
  accentHex: string // 6-char hex without '#'
  // 'boxed' (white text on an accent fill) is deliberately unused by every preset: if an ATS
  // strips shading it leaves white-on-white, and white text trips keyword-stuffing heuristics.
  headingStyle: 'underline' | 'bar' | 'shaded' | 'boxed' | 'none'
  headingCase: 'upper' | 'title'
  // Whether the name / role line pick up the accent colour. Applied by BOTH the PDF and DOCX
  // renderers so a style looks the same in either file.
  headerNameUsesAccent: boolean
  headerTitleUsesAccent: boolean
  dividerStyle: 'thick' | 'thin' | 'none'
  bulletChar: string
  pdf: {
    nameSize: number
    titleSize: number
    contactSize: number
    headingSize: number
    bodySize: number
  }
}

type JobListItem = {
  id: string
  companyName: string
  jobTitle: string
  jobUrl: string
  jobDescription: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  message?: string
  folderName?: string
}

// Every preset stays inside the same ATS envelope: US Letter, one column, standard base
// fonts, standard section labels, black body text, and a plain bullet. What varies is
// everything a parser does not read -- typeface, alignment, heading treatment, rules,
// colour and density -- so the seven look clearly different without costing a score.
const RESUME_STYLE_PRESETS: Record<ResumeStyle, ResumeStylePreset> = {
  Classic: {
    label: 'Classic',
    description: 'Traditional serif, centered header, thick rule, uppercase underlined headings.',
    headerAlign: 'center',
    fontFamily: 'Times New Roman',
    pdfFontFamily: 'times',
    accentHex: '1f4e79',
    headingStyle: 'underline',
    headingCase: 'upper',
    headerNameUsesAccent: false,
    headerTitleUsesAccent: false,
    dividerStyle: 'thick',
    bulletChar: '•',
    pdf: { nameSize: 20, titleSize: 11.5, contactSize: 10, headingSize: 11, bodySize: 10.5 },
  },
  Modern: {
    label: 'Modern',
    description: 'Sans-serif, left header in teal, accent bar beside each heading, no rules.',
    headerAlign: 'left',
    fontFamily: 'Calibri',
    pdfFontFamily: 'helvetica',
    accentHex: '0f766e',
    headingStyle: 'bar',
    headingCase: 'upper',
    headerNameUsesAccent: true,
    headerTitleUsesAccent: true,
    dividerStyle: 'none',
    bulletChar: '•',
    pdf: { nameSize: 21, titleSize: 11, contactSize: 9.5, headingSize: 10.5, bodySize: 10.5 },
  },
  Minimal: {
    label: 'Minimal',
    description: 'Quiet and airy: no rules at all, title-case headings, pure black, wide margins.',
    headerAlign: 'left',
    fontFamily: 'Segoe UI',
    pdfFontFamily: 'helvetica',
    pdfMarginPtX: 66,
    pdfMarginPtY: 60,
    docxMarginTwipsX: 1320,
    docxMarginTwipsY: 1200,
    accentHex: '111111',
    headingStyle: 'none',
    headingCase: 'title',
    headerNameUsesAccent: false,
    headerTitleUsesAccent: false,
    dividerStyle: 'none',
    bulletChar: '–',
    pdf: { nameSize: 17, titleSize: 10.5, contactSize: 9, headingSize: 10.5, bodySize: 10 },
  },
  Executive: {
    label: 'Executive',
    description: 'Formal and dense: large centered serif name, grey heading bands, tight margins.',
    headerAlign: 'center',
    fontFamily: 'Georgia',
    pdfFontFamily: 'times',
    pdfMarginPtX: 48,
    pdfMarginPtY: 54,
    docxMarginTwipsX: 960,
    docxMarginTwipsY: 1080,
    accentHex: '1f2937',
    headingStyle: 'shaded',
    headingCase: 'upper',
    headerNameUsesAccent: false,
    headerTitleUsesAccent: false,
    dividerStyle: 'thick',
    bulletChar: '•',
    pdf: { nameSize: 23, titleSize: 12, contactSize: 9.5, headingSize: 11, bodySize: 10.5 },
  },
  Creative: {
    label: 'Creative',
    description: 'Bold orange name, centered, large title-case headings over a thin rule.',
    headerAlign: 'center',
    fontFamily: 'Trebuchet MS',
    pdfFontFamily: 'helvetica',
    accentHex: 'ea580c',
    headingStyle: 'underline',
    headingCase: 'title',
    headerNameUsesAccent: true,
    headerTitleUsesAccent: false,
    dividerStyle: 'thin',
    bulletChar: '•',
    pdf: { nameSize: 22, titleSize: 12, contactSize: 10, headingSize: 12.5, bodySize: 10.5 },
  },
  TrueCircle: {
    label: 'TrueCircle',
    description: 'Serif with a blue accent bar beside each heading and a thin header rule.',
    headerAlign: 'left',
    fontFamily: 'Cambria',
    pdfFontFamily: 'times',
    accentHex: '2563eb',
    headingStyle: 'bar',
    headingCase: 'upper',
    headerNameUsesAccent: true,
    headerTitleUsesAccent: false,
    dividerStyle: 'thin',
    bulletChar: '•',
    pdf: { nameSize: 19, titleSize: 11, contactSize: 9.5, headingSize: 10.5, bodySize: 10.5 },
  },
  Wide: {
    label: 'Wide',
    description: 'Widest text column and the largest body type — fewer pages, easier to read.',
    headerAlign: 'left',
    fontFamily: 'Open Sans',
    pdfFontFamily: 'helvetica',
    // Narrow side margins widen the text column; Letter page size is kept so viewers and
    // parsers do not have to rescale.
    pdfMarginPtX: 40,
    pdfMarginPtY: 54,
    docxMarginTwipsX: 800,
    docxMarginTwipsY: 1080,
    accentHex: '0369a1',
    headingStyle: 'underline',
    headingCase: 'upper',
    headerNameUsesAccent: false,
    headerTitleUsesAccent: false,
    dividerStyle: 'none',
    bulletChar: '•',
    pdf: { nameSize: 22, titleSize: 12.5, contactSize: 10.5, headingSize: 11.5, bodySize: 11.5 },
  },
}

// Section labels are stored uppercase, so title case has to be rebuilt rather than skipped.
// Scripts without letter case (Japanese, Chinese) are unaffected by either branch.
const toHeadingTitleCase = (value: string) =>
  value.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())

const formatSectionHeading = (label: string, preset: ResumeStylePreset) =>
  preset.headingCase === 'title' ? toHeadingTitleCase(label) : label.toUpperCase()

// Newer OpenAI models (GPT-5 family and the o-series reasoning models) reject any
// temperature other than the default of 1, so the parameter is omitted for them.
const modelSupportsTemperature = (model: string) => !/^(?:o[1-9]|gpt-5)/i.test(model.trim())

const temperatureParam = (model: string, temperature: number) =>
  modelSupportsTemperature(model) ? { temperature } : {}

// Transport for the post-generation guards (lib/jdEcho, lib/techTimeline): one JSON-mode call,
// returning the parsed object or null on any failure so each guard can fall back on its own.
const requestModelJsonFrom = (apiKey: string, model: string) => async (system: string, user: string) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      ...temperatureParam(model, 0.2),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  const content = (data?.choices?.[0]?.message?.content ?? '')
    .toString()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

// Post-generation pipeline shared by single and batch generation. Order matters: each rewriting
// stage runs before the checks that could be undone by a rewrite —
//   1. make bullets specific (drop filler and invented numbers),
//   2. rephrase anything copied from the job description,
//   3. enforce the technology timeline,
//   4. strip meta commentary (deterministic, remove-only).
// Those checks can drop bullets, so any role left under MIN_BULLETS_PER_ROLE is then topped up
// and the checks run once more over the result (only new bullets can still be flagged, so the
// second pass costs nothing when they are clean).
const polishGeneratedResume = async <T extends { workHistory?: unknown }>(args: {
  draftParsed: T
  jobDescription: string
  // Exactly as the user entered it.
  jobTitle: string
  roles: Array<QualityRole & TimelineRole>
  // The candidate's own text; the only place a number in a bullet may come from.
  evidenceTexts: string[]
  language: ResumeLanguage
  sanitize: (value: unknown) => string
  apiKey: string
  model: string
}) => {
  const requestJson = requestModelJsonFrom(args.apiKey, args.model)
  const requestRewrites = async (system: string, user: string) => {
    const parsed = await requestJson(system, user)
    return Array.isArray(parsed?.rewrites) ? parsed.rewrites : null
  }
  const runChecks = async (draftParsed: T) => {
    // Re-angle off-target bullets toward the job first; every later check then applies to them.
    const relevant = await enforceJdRelevance({
      draftParsed,
      roles: args.roles,
      jobDescription: args.jobDescription,
      jobTitle: args.jobTitle,
      evidenceTexts: args.evidenceTexts,
      language: args.language,
      sanitize: args.sanitize,
      requestRewrites,
    })
    const specific = await enforceSpecificBullets({
      draftParsed: relevant,
      roles: args.roles,
      evidenceTexts: args.evidenceTexts,
      language: args.language,
      sanitize: args.sanitize,
      requestRewrites,
    })
    const natural = await enforceNaturalPhrasing({
      draftParsed: specific,
      jobDescription: args.jobDescription,
      language: args.language,
      sanitize: args.sanitize,
      requestRewrites,
    })
    const timed = await enforceTechTimeline({
      draftParsed: natural,
      roles: args.roles,
      language: args.language,
      sanitize: args.sanitize,
      requestFixes: async (system, user) => {
        const parsed = await requestJson(system, user)
        return Array.isArray(parsed?.fixes) ? parsed.fixes : null
      },
    })
    // Deterministic and remove-only, so it runs last without undoing the stages above.
    return removeMetaCommentary(timed)
  }

  const checked = await runChecks(args.draftParsed)
  const topped = await ensureBulletCount({
    draftParsed: checked,
    roles: args.roles,
    jobDescription: args.jobDescription,
    // Any core job-description technology still missing after the checks is the first thing a
    // new bullet should demonstrate.
    uncoveredTechnologies: uncoveredCoreTechnologies({
      draftParsed: checked,
      roles: args.roles,
      jobDescription: args.jobDescription,
      jobTitle: args.jobTitle,
      sanitize: args.sanitize,
    }),
    language: args.language,
    sanitize: args.sanitize,
    requestBullets: async (system, user) => {
      const parsed = await requestJson(system, user)
      return Array.isArray(parsed?.workHistory) ? parsed.workHistory : null
    },
  })
  const finalDraft = topped === checked ? checked : await runChecks(topped)
  // Skills last, from the final bullets: every technology the experience section names is listed.
  return backfillSkillsFromBullets(finalDraft)
}

const getResumeContactEmail = (profile: ReturnType<typeof useAuth>['profile']) => {
  const v = (profile?.resume_email ?? '').toString().trim()
  if (v) return v
  // Backwards-compatible fallback: if resume email isn't set yet, use account email.
  return (profile?.email ?? '').toString().trim()
}

// The job title is used exactly as the user typed it — in the resume header, cover letter, file
// and folder names, and the saved application record — and the whole resume is generated for it.
// Only whitespace is tidied. (This replaces an older "generalize" step that stripped qualifiers
// like "(Remote)" or "- Payments" and re-inferred generic titles from JD keyword counts, so the
// materials and the content could drift away from the title that was entered.)
const normalizeJobTitle = (rawTitle: string) => (rawTitle ?? '').toString().replace(/\s+/g, ' ').trim()

const getResumeStylePreset = (style: ResumeStyle): ResumeStylePreset =>
  RESUME_STYLE_PRESETS[style] ?? RESUME_STYLE_PRESETS.Classic

type WorkHistoryItem = {
  id: string
  company: string
  title: string
  // Optional AI-tailored title for resume output (does not overwrite saved profile title).
  resume_title?: string
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

type SkillCategory = {
  category: string
  skills: string[]
}

type ResumeDraft = {
  // Generated title aligned to target job role (from model output).
  targetTitle?: string
  summary: string
  // Flat list of every skill, kept in sync with skillCategories. Used for the DB record.
  skills: string[]
  // Grouped skills rendered as "Frontend: React, Vue" lines. Absent for drafts generated
  // before categorization, which fall back to a single bullet-separated line.
  skillCategories?: SkillCategory[]
  workHistory: WorkHistoryItem[]
  education: EducationItem[]
  keyAchievements: string[]
  projects: string[]
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

const monthToLabel = (value?: string, language: ResumeLanguage = 'English') => {
  if (!value) return ''
  const [year, month] = value.split('-')
  if (!year || !month) return value
  const date = new Date(Number(year), Number(month) - 1)
  // Japanese/Chinese resumes have always shown English month labels; only Spanish opts out.
  const locale = language === 'Spanish' ? 'es-ES' : 'en-US'
  return date.toLocaleString(locale, { month: 'short', year: 'numeric' })
}

const presentLabel = (language: ResumeLanguage = 'English') => (language === 'Spanish' ? 'Presente' : 'Present')

const workModeLabel = (value?: WorkHistoryItem['workMode'], language: ResumeLanguage = 'English') => {
  if (!value) return ''
  const translations: Record<ResumeLanguage, Record<NonNullable<WorkHistoryItem['workMode']>, string>> = {
    English: { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite' },
    Japanese: { remote: 'リモート', hybrid: 'ハイブリッド', onsite: 'オンサイト' },
    Chinese: { remote: '远程', hybrid: '混合', onsite: '现场' },
    Spanish: { remote: 'Remoto', hybrid: 'Híbrido', onsite: 'Presencial' },
  }
  switch (value) {
    case 'remote':
      return translations[language].remote
    case 'hybrid':
      return translations[language].hybrid
    case 'onsite':
      return translations[language].onsite
    default:
      return ''
  }
}

const buildCoverLetter = (
  name: string,
  role: string,
  location: string,
  language: ResumeLanguage = 'English',
) => {
  const fullName = name.trim() || 'Candidate'
  const headline = role.trim() || 'professional'
  const city = location.trim() || 'your area'
  if (language === 'Japanese') {
    return `採用ご担当者様\n\n${fullName}と申します。${city}を拠点に${headline}として、成果に結びつくプロダクト開発や改善に取り組んできました。これまでの経験では、関係者との協働、品質・パフォーマンスの最適化、価値提供のスピード向上などを通じて、継続的な成果創出に貢献してきました。\n\n貴社のポジションにおいても、技術力と推進力を活かして貢献したいと考えております。ご検討のほど、よろしくお願いいたします。\n\n敬具\n${fullName}`
  }
  if (language === 'Chinese') {
    return `您好，招聘团队：\n\n我是${fullName}，目前在${city}工作，担任${headline}。我很高兴向您提交我的简历以供审阅。过往经历中，我专注于交付可衡量的业务成果，与跨职能团队紧密协作，并通过工程实践提升性能、稳定性与交付效率。\n\n期待有机会在贵公司贡献我的经验与能力。感谢您的时间与考虑。\n\n此致\n敬礼\n${fullName}`
  }
  if (language === 'Spanish') {
    return `Estimado equipo de selección:\n\nMe llamo ${fullName} y trabajo como ${headline} en ${city}. Me complace compartir mi currículum para su consideración. A lo largo de mi trayectoria me he centrado en entregar resultados medibles, colaborar con equipos multidisciplinarios y desarrollar soluciones que generan impacto.\n\nMe entusiasma la posibilidad de aportar mi experiencia a su organización. Gracias por su tiempo y consideración.\n\nAtentamente,\n${fullName}`
  }
  return `Hello Hiring Team,\n\nI’m ${fullName}, a ${headline} based in ${city}. I’m excited to share my resume for your review. My background includes delivering measurable results, collaborating across teams, and building solutions that drive impact.\n\nI’d love the opportunity to contribute to your organization. Thank you for your time and consideration.\n\nSincerely,\n${fullName}`
}

const buildInitialDraft = (
  _profile: ReturnType<typeof useAuth>['profile'],
  companies: ReturnType<typeof useAuth>['companies'],
  educations: ReturnType<typeof useAuth>['educations'],
): ResumeDraft => {
  return {
    targetTitle: '',
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
    keyAchievements: [],
    projects: [],
    coverLetter: '',
  }
}

const buildMockResume = (
  prev: ResumeDraft,
  profile: ReturnType<typeof useAuth>['profile'],
  language: ResumeLanguage,
  targetJobTitle?: string,
): ResumeDraft => {
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
  const desiredTitle = (targetJobTitle || '').trim()
  type RoleArchetype =
    | 'data'
    | 'ml'
    | 'devops'
    | 'security'
    | 'backend'
    | 'frontend'
    | 'mobile'
    | 'qa'
    | 'product'
    | 'generic'

  const inferArchetype = (title: string): RoleArchetype => {
    const t = title.toLowerCase()
    if (/(data engineer|analytics engineer|etl|elt|pipeline|warehouse|lakehouse|dbt|airflow|dagster|spark)/.test(t))
      return 'data'
    if (/(ml engineer|machine learning|mle|data scientist|ai engineer|llm|nlp|computer vision)/.test(t))
      return 'ml'
    if (/(devops|sre|site reliability|platform engineer|infrastructure|kubernetes|terraform)/.test(t))
      return 'devops'
    if (/(security|appsec|secops|iam|threat|vulnerability|pentest)/.test(t)) return 'security'
    if (/(backend|back-end|api|distributed systems|services)/.test(t)) return 'backend'
    if (/(frontend|front-end|ui engineer|react|web developer)/.test(t)) return 'frontend'
    if (/(android|ios|mobile)/.test(t)) return 'mobile'
    if (/(qa|quality|test automation|sdet)/.test(t)) return 'qa'
    if (/(product manager|product owner|pm\b)/.test(t)) return 'product'
    return 'generic'
  }

  const archetype = inferArchetype(desiredTitle)
  const role = desiredTitle || 'Software Engineer'
  const location = profile?.location?.trim() || 'Remote'
  const summary =
    language === 'Japanese'
      ? archetype === 'data'
        ? `データ基盤の設計・構築、ETL/ELTパイプライン、データモデリングに強みを持つエンジニア。要件をデータ仕様へ落とし込み、品質・信頼性・可観測性を高めながら、分析と意思決定を支えるデータ提供を推進。`
        : archetype === 'ml'
          ? `機械学習の実装から運用までを見据えたMLエンジニア。データ準備、特徴量設計、評価・監視、デプロイを通じてモデルの品質と再現性を高め、プロダクト価値につながる改善を推進。`
          : archetype === 'devops'
            ? `信頼性と開発生産性を両立するDevOps/SRE志向のエンジニア。インフラ自動化、可観測性、CI/CD、障害対応の仕組み化を通じて、安定稼働とリリース速度を向上。`
            : archetype === 'security'
              ? `アプリケーションセキュリティに強みを持つエンジニア。脆弱性対策、IAM、セキュア設計、監査対応を通じて、リスクを低減しながら安全な開発を支援。`
              : archetype === 'frontend'
                ? `アクセシビリティとパフォーマンスを重視するフロントエンドエンジニア。設計・実装・改善を通じて、使いやすく高速なUIを安定的に提供。`
                : archetype === 'backend'
                  ? `スケーラブルなAPIと分散システムに強みを持つバックエンドエンジニア。パフォーマンス、可用性、観測性を意識した設計で、安定したサービス提供を推進。`
                  : `プロダクト開発と技術的な課題解決に強みを持つエンジニア。要件を整理し、品質とスピードのバランスを取りながら、継続的な改善で成果に貢献。`
      : language === 'Chinese'
        ? archetype === 'data'
          ? `数据工程方向工程师，擅长数据平台建设、ETL/ELT 管道、数据建模与数据质量治理。能够将业务需求转化为可靠的数据资产，通过可观测性与自动化提升稳定性与效率，支持分析与数据驱动决策。`
          : archetype === 'ml'
            ? `机器学习工程师，关注从数据准备到训练、评估、部署与监控的全流程。通过工程化与可观测性提升模型的稳定性与可复现性，推动业务指标的持续改善。`
            : archetype === 'devops'
              ? `DevOps/SRE 方向工程师，专注基础设施自动化、可观测性与 CI/CD。通过标准化与自动化提升稳定性、发布效率与故障响应能力。`
              : archetype === 'security'
                ? `安全工程方向工程师，专注应用安全、身份与访问控制、风险治理与合规。推动安全左移，将安全策略融入开发与交付流程，降低整体风险。`
                : archetype === 'frontend'
                  ? `前端工程师，重视性能、可访问性与一致的交互体验。通过组件化与工程实践提升交付效率与产品质量。`
                  : archetype === 'backend'
                    ? `后端工程师，擅长可扩展 API 与分布式系统。关注性能、稳定性与可观测性，保障服务在高负载下可靠运行。`
                    : `软件工程师，擅长将需求落地为可维护的系统与功能，通过工程实践提升质量与交付效率，并在协作中推动可衡量的结果。`
        : `Full-stack engineer specializing in product delivery, modern web architecture, and scalable APIs. Known for translating ambiguous requirements into reliable releases, improving performance, and mentoring teams while maintaining strong UX, accessibility, and measurable business impact.`
  const skills: string[] = (() => {
    switch (archetype) {
      case 'data':
        return ['SQL', 'Python', 'ETL/ELT', 'Data Modeling', 'Airflow', 'Spark', 'dbt', 'Snowflake']
      case 'ml':
        return ['Python', 'Model Training', 'Feature Engineering', 'Evaluation', 'Deployment', 'Monitoring', 'ML Ops', 'Data Pipelines']
      case 'devops':
        return ['CI/CD', 'Kubernetes', 'Terraform', 'Cloud', 'Observability', 'SRE', 'Incident Response', 'Automation']
      case 'security':
        return ['AppSec', 'IAM', 'Threat Modeling', 'Vulnerability Management', 'Secure SDLC', 'Logging', 'Compliance', 'OWASP']
      case 'frontend':
        return ['React', 'TypeScript', 'Web Performance', 'Accessibility', 'Design Systems', 'Testing', 'State Management', 'CSS']
      case 'backend':
        return ['APIs', 'Distributed Systems', 'Databases', 'Caching', 'Observability', 'Performance', 'Security', 'Cloud']
      default:
        return ['Communication', 'Problem Solving', 'Ownership', 'Quality', 'Collaboration', 'Delivery', 'Documentation', 'Testing']
    }
  })()

  const defaultBullets = (title: string, company: string): string[] => {
    switch (archetype) {
      case 'data':
        return [
          `Built and maintained ELT/ETL pipelines for ${company} as ${title}, integrating multiple sources into curated models with automated validation to improve data freshness and reliability for analytics consumers.`,
          `Designed scalable warehouse/lakehouse schemas and data models, standardizing dimensions and facts to reduce query complexity and accelerate dashboard development and self-serve analysis.`,
          `Implemented orchestration and observability for data workflows, adding lineage, alerting, and retry strategies to cut pipeline failures and shorten time-to-detect for data incidents.`,
          `Optimized performance and cost across compute and storage, tuning partitions and incremental loads to reduce runtimes and spend while meeting SLAs for critical datasets.`,
          `Partnered with analysts and stakeholders to translate requirements into data contracts and documentation, ensuring consistent definitions and trusted metrics across reporting surfaces.`,
          `Hardened data quality and governance with access controls, PII handling, and audit-friendly practices, improving compliance readiness while preserving usability for authorized teams.`,
        ]
      case 'ml':
        return [
          `Developed and productionized machine learning workflows for ${company} as ${title}, aligning features, training, evaluation, and deployment to deliver measurable improvements in key product metrics.`,
          `Built reliable data and feature pipelines, adding validation and drift monitoring to improve model stability and reduce regression risk across releases and changing data distributions.`,
          `Optimized model performance and latency through experimentation and profiling, balancing accuracy, throughput, and cost constraints to meet service-level targets.`,
          `Implemented monitoring and alerting for model quality and infrastructure, shortening time-to-detect for degraded predictions and enabling fast rollback and mitigation.`,
          `Partnered with stakeholders to define success metrics and offline/online evaluation, ensuring model outcomes matched business goals and were interpretable for decision-makers.`,
          `Documented model assumptions, limitations, and governance controls, improving reproducibility, compliance readiness, and cross-team collaboration during reviews.`,
        ]
      case 'devops':
        return [
          `Automated infrastructure provisioning for ${company} as ${title} using IaC, standardizing environments to reduce drift and speed up secure, repeatable deployments.`,
          `Built CI/CD pipelines with quality gates and rollbacks, improving release frequency while reducing failure rates and mean time to recovery during incidents.`,
          `Implemented observability with metrics, logs, and tracing, enabling faster root-cause analysis and tighter SLO/SLA tracking for critical services.`,
          `Improved reliability through capacity planning and performance testing, mitigating bottlenecks and scaling risks under peak traffic conditions.`,
          `Established incident response runbooks and on-call practices, strengthening operational readiness and reducing customer impact during outages.`,
          `Partnered with engineering teams to improve service hardening (timeouts, retries, rate limits), reducing cascading failures and improving overall system resilience.`,
        ]
      case 'security':
        return [
          `Drove application security improvements for ${company} as ${title}, integrating security checks into CI/CD to reduce vulnerable releases and accelerate remediation.`,
          `Implemented secure authentication/authorization patterns and least-privilege access controls, reducing exposure while maintaining usability for internal and external users.`,
          `Performed threat modeling and design reviews, identifying high-risk flows early and guiding mitigations that improved security posture without blocking delivery.`,
          `Built vulnerability management workflows and SLAs, improving triage quality and reducing time-to-fix for critical issues across teams.`,
          `Enhanced logging and auditability, enabling better detection, forensics, and compliance evidence for security and privacy requirements.`,
          `Partnered with stakeholders to translate policy into engineering standards, aligning secure SDLC practices with product timelines and business needs.`,
        ]
      case 'frontend':
        return [
          `Built and shipped accessible, performant UI features for ${company} as ${title}, improving usability and responsiveness while maintaining consistent design-system patterns.`,
          `Optimized rendering and bundle performance, reducing load times and improving Core Web Vitals through code-splitting, memoization, and profiling-driven fixes.`,
          `Implemented robust state management and data fetching patterns, reducing UI bugs and improving maintainability across complex user flows.`,
          `Hardened quality with component and E2E testing, increasing confidence in releases and reducing regressions across browsers and devices.`,
          `Partnered with design and product to refine UX and interaction details, aligning implementation with user research and measurable engagement outcomes.`,
          `Improved accessibility and internationalization support, ensuring inclusive experiences and consistent behavior across locales and assistive technologies.`,
        ]
      case 'backend':
        return [
          `Designed and delivered scalable API services for ${company} as ${title}, improving reliability and throughput while meeting performance and availability targets.`,
          `Optimized database access patterns and caching strategies, reducing latency and error rates through indexing, query tuning, and safe rollout practices.`,
          `Implemented observability and defensive engineering (timeouts, retries, circuit breakers), improving incident detectability and reducing customer-impacting failures.`,
          `Built secure authentication/authorization flows and data validation, reducing risk while preserving developer ergonomics and API consistency.`,
          `Collaborated with cross-functional teams to translate requirements into milestones, delivering predictable releases aligned with business outcomes.`,
          `Improved CI/CD and release safety with automated tests and canary strategies, reducing regressions and speeding up iteration cycles.`,
        ]
      default:
        return [
          `Led end-to-end delivery for ${company} as ${title}, aligning stakeholders to ship reliable improvements that supported measurable business outcomes and improved user experience.`,
          `Translated ambiguous requirements into clear technical plans, balancing scope, quality, and timelines to maintain predictable delivery and high team velocity.`,
          `Improved system performance and reliability by identifying bottlenecks, adding monitoring, and implementing optimizations that reduced errors and improved customer satisfaction.`,
          `Built maintainable components and shared patterns, reducing duplication and simplifying onboarding while keeping code quality high through reviews and testing.`,
          `Automated repetitive workflows and introduced tooling, shortening feedback loops and reducing operational overhead while improving developer productivity.`,
          `Mentored teammates and facilitated cross-team collaboration, raising engineering standards and improving outcomes across multiple workstreams.`,
        ]
    }
  }

  return {
    ...prev,
    targetTitle: role,
    summary,
    skills,
    coverLetter: prev.coverLetter?.trim() || buildCoverLetter(fullName, role, location, language),
    workHistory: prev.workHistory.map((item) => ({
      ...item,
      resume_title: role,
      bullets: defaultBullets(role || 'role', item.company || 'team'),
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

const sanitizeFileName = (value: string, fallback: string) => {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ') // Windows-invalid + control chars
    .replace(/\s+/g, ' ')
    .trim()
  const truncated = cleaned.length > 120 ? cleaned.slice(0, 120).trim() : cleaned
  return truncated || fallback
}

const stripTrailingEstimateTag = (value: string) =>
  (value ?? '').replace(/\s*\(est\.\)\s*$/i, '').trim()

const stripBracketedMetrics = (value: string) => {
  const s = (value ?? '').toString()
  if (!s) return s

  // Replace simple bracketed metric tokens like:
  // [30%] -> 30%, [$5k] -> $5k, [2x] -> 2x, [120ms] -> 120ms, [p95] -> p95, [X%] -> X%
  return s.replace(
    /\[\s*(\$?\s*(?:[Xx]|\d[\d,]*)(?:\.\d+)?\s*(?:%|x|ms|s|sec|secs|seconds|min|mins|minutes|hr|hrs|hours|day|days|week|weeks|month|months|year|years)|p(?:50|95|99))\s*\]/g,
    (_m, inner) => (inner ?? '').toString().replace(/\s+/g, ''),
  )
}

// Some model responses fall back to a literal "X" placeholder (e.g. "X%", "X percent", "[X%]") instead of
// a real number when no metric is available, despite prompt instructions not to. Strip those placeholder
// phrases (including a leading preposition like "by X%") so an unresolved "X" never reaches the resume.
// Real numbers (e.g. "30%") are untouched since the lookbehind/lookahead require a standalone "X" token.
// Longer unit words must precede their prefixes (e.g. "minutes?" before "mins?") so the regex
// engine doesn't stop at the shorter alternative and leave a dangling suffix like "utes" behind.
const PLACEHOLDER_METRIC_UNIT =
  '%|percent(?:age)?(?:[ \\t]+points?)?|\\$|ms|seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?'
// Note: no leading [ \t]* — only the trailing whitespace is consumed, so exactly one of the two
// surrounding spaces survives instead of gluing the words on either side together.
const PLACEHOLDER_METRIC_WITH_PREPOSITION = new RegExp(
  `\\b(?:by|of|to|at|with)[ \\t]+\\[?(?<![A-Za-z0-9])X(?![A-Za-z0-9])[ \\t]*(?:${PLACEHOLDER_METRIC_UNIT})[ \\t]*\\]?`,
  'gi',
)
const PLACEHOLDER_METRIC_STANDALONE = new RegExp(
  `\\[?(?<![A-Za-z0-9])X(?![A-Za-z0-9])[ \\t]*(?:${PLACEHOLDER_METRIC_UNIT})[ \\t]*\\]?`,
  'gi',
)

// Candidate-authored text (draft bullets, key achievements, projects) is the only source of real,
// verifiable metrics available to the generator, so it is passed to the model as evidence.
const collectEvidenceLines = (values?: string[]) =>
  (values ?? []).map((value) => (value ?? '').toString().trim()).filter(Boolean)

const stripPlaceholderMetrics = (value: string) => {
  const s = (value ?? '').toString()
  if (!s) return s

  return s
    .replace(PLACEHOLDER_METRIC_WITH_PREPOSITION, '')
    .replace(PLACEHOLDER_METRIC_STANDALONE, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([.,;:!?])/g, '$1')
        .trim(),
    )
    .join('\n')
}

// Records a UI edit into the candidate-authored source draft (see candidateSourceRef): only the
// fields that changed in this edit are copied, so generated content elsewhere in the draft is
// never promoted to "the candidate's own".
const sameLines = (a: string[] | undefined, b: string[] | undefined) =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

const mergeCandidateEdits = (source: ResumeDraft, prev: ResumeDraft, next: ResumeDraft): ResumeDraft => {
  const merged: ResumeDraft = { ...source }
  if (next.summary !== prev.summary) merged.summary = next.summary
  if (!sameLines(next.skills, prev.skills)) merged.skills = next.skills
  if (!sameLines(next.keyAchievements, prev.keyAchievements)) merged.keyAchievements = next.keyAchievements
  if (!sameLines(next.projects, prev.projects)) merged.projects = next.projects
  const prevById = new Map(prev.workHistory.map((item) => [item.id, item]))
  merged.workHistory = source.workHistory.map((role) => {
    const after = next.workHistory.find((item) => item.id === role.id)
    const before = prevById.get(role.id)
    return after && !sameLines(after.bullets, before?.bullets) ? { ...role, bullets: after.bullets } : role
  })
  return merged
}

const buildCandidateFullName = (profile: ReturnType<typeof useAuth>['profile']) =>
  [profile?.first_name, profile?.middle_name, profile?.last_name]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ')
    .trim()

const normalizeSkillsForDisplay = (skills: string[]) => {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of skills ?? []) {
    const trimmed = (raw ?? '').trim()
    if (!trimmed) continue

    const idx = trimmed.indexOf(':')
    const withoutCategory = idx >= 0 ? (trimmed.slice(idx + 1).trim() || trimmed) : trimmed
    const parts = withoutCategory
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const finalParts = parts.length > 0 ? parts : [withoutCategory]

    for (const p of finalParts) {
      const key = p.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(p)
    }
  }
  return out
}

// Flattens whatever skill shape the model returned (categorized object, or a legacy flat
// claimedSkills/skills array) into a single list, so counts and repair passes work either way.
const flattenClaimedSkills = (parsed: unknown, sanitize: (value: unknown) => string): string[] => {
  const source = parsed as Record<string, unknown> | null | undefined
  const byCategory = source?.claimedSkillsByCategory
  if (byCategory && typeof byCategory === 'object' && !Array.isArray(byCategory)) {
    const values = Object.values(byCategory as Record<string, unknown>)
      .flatMap((list) => (Array.isArray(list) ? list : []))
      .map((value) => sanitize(value))
      .filter(Boolean)
    if (values.length > 0) return values
  }

  const flat = Array.isArray(source?.claimedSkills)
    ? source.claimedSkills
    : Array.isArray(source?.skills)
      ? source.skills
      : []
  return flat.map((value) => sanitize(value)).filter(Boolean)
}

// A rendered skills line, split so the category label can be bolded independently of the skills.
// `label` is empty for the uncategorized fallback, which renders as one plain line.
type SkillLine = { label: string; skills: string }

// One rendered line per skill category ("Languages: TypeScript, Python"). Falls back to the
// previous single bullet-separated line when the draft has no categories.
const buildSkillLines = (draft: ResumeDraft): SkillLine[] => {
  const categories = (draft.skillCategories ?? [])
    .map((entry) => ({
      category: (entry?.category ?? '').trim(),
      skills: normalizeSkillsForDisplay(entry?.skills ?? []),
    }))
    .filter((entry) => entry.category && entry.skills.length > 0)

  if (categories.length > 0) {
    return categories.map((entry) => ({ label: entry.category, skills: entry.skills.join(', ') }))
  }

  const flat = normalizeSkillsForDisplay(draft.skills)
  return flat.length > 0 ? [{ label: '', skills: flat.join(' • ') }] : []
}

// Bucket for skills the user adds by hand when the draft is already categorized.
const OTHER_SKILL_CATEGORY = 'Additional'

const sameSkill = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Skills and skillCategories must stay in sync: the flat list feeds the saved record while the
// categories drive the rendered resume, so an edit to one has to be applied to the other.
const removeSkillFromDraft = (draft: ResumeDraft, skill: string): ResumeDraft => ({
  ...draft,
  skills: draft.skills.filter((value) => !sameSkill(value, skill)),
  skillCategories: draft.skillCategories
    ? draft.skillCategories
        .map((entry) => ({ ...entry, skills: entry.skills.filter((value) => !sameSkill(value, skill)) }))
        .filter((entry) => entry.skills.length > 0)
    : undefined,
})

const addSkillToDraft = (draft: ResumeDraft, skill: string, category?: string): ResumeDraft => {
  const trimmed = skill.trim()
  if (!trimmed || draft.skills.some((value) => sameSkill(value, trimmed))) return draft

  const categories = draft.skillCategories
  if (!categories || categories.length === 0) {
    return { ...draft, skills: [...draft.skills, trimmed] }
  }

  const target = categories.some((entry) => entry.category === category) ? category : OTHER_SKILL_CATEGORY
  const nextCategories = categories.some((entry) => entry.category === target)
    ? categories.map((entry) =>
        entry.category === target ? { ...entry, skills: [...entry.skills, trimmed] } : entry,
      )
    : [...categories, { category: OTHER_SKILL_CATEGORY, skills: [trimmed] }]

  return { ...draft, skills: [...draft.skills, trimmed], skillCategories: nextCategories }
}

const hasMeasurableImpact = (text: unknown) => {
  const s = (text ?? '').toString()
  if (!s.trim()) return false
  // Require a number with a unit/symbol to avoid counting years like "2023".
  return /(\$[\d,.]+|\b\d[\d,.]*\s?(%|ms|s|sec|secs|seconds|min|mins|minutes|hr|hrs|hours|day|days|week|weeks|month|months|year|years|x)\b|\b\d[\d,.]*x\b|\bp(50|95|99)\b)/i.test(
    s,
  )
}

const SECTION_LABELS: Record<
  ResumeLanguage,
  {
    summary: string
    skills: string
    experience: string
    education: string
    achievements: string
    projects: string
    coverLetter: string
  }
> = {
  English: {
    summary: 'SUMMARY',
    skills: 'SKILLS',
    experience: 'EXPERIENCE',
    education: 'EDUCATION',
    achievements: 'KEY ACHIEVEMENTS',
    projects: 'PROJECTS',
    coverLetter: 'COVER LETTER',
  },
  Japanese: {
    summary: '概要',
    skills: '技術スキル',
    experience: '職務経歴',
    education: '学歴',
    achievements: '主な実績',
    projects: 'プロジェクト',
    coverLetter: 'カバーレター',
  },
  Chinese: {
    summary: '概要',
    skills: '技术技能',
    experience: '工作经历',
    education: '教育背景',
    achievements: '关键成果',
    projects: '项目',
    coverLetter: '求职信',
  },
  Spanish: {
    summary: 'PERFIL PROFESIONAL',
    skills: 'HABILIDADES',
    experience: 'EXPERIENCIA',
    education: 'EDUCACIÓN',
    achievements: 'LOGROS CLAVE',
    projects: 'PROYECTOS',
    coverLetter: 'CARTA DE PRESENTACIÓN',
  },
}

const getCanvasFontStack = (language: ResumeLanguage, preferred?: string) => {
  const pref = (preferred ?? '').trim()
  const quotedPref = pref ? `"${pref.replace(/"/g, '')}"` : null
  switch (language) {
    case 'Japanese':
      return [
        quotedPref,
        `"Yu Gothic"`,
        `"Meiryo"`,
        `"MS PGothic"`,
        `"Hiragino Kaku Gothic ProN"`,
        `"Noto Sans JP"`,
        'sans-serif',
      ]
        .filter(Boolean)
        .join(',')
    case 'Chinese':
      return [
        quotedPref,
        `"Microsoft YaHei"`,
        `"PingFang SC"`,
        `"SimSun"`,
        `"Noto Sans SC"`,
        'sans-serif',
      ]
        .filter(Boolean)
        .join(',')
    default:
      return [quotedPref, `"Segoe UI"`, `"Calibri"`, `"Times New Roman"`, 'sans-serif']
        .filter(Boolean)
        .join(',')
  }
}

const wrapTextByMeasure = (args: {
  text: string
  measure: (s: string) => number
  maxWidth: number
  language: ResumeLanguage
  // Narrower budget for the first line, to leave room for an inline label drawn before it.
  firstLineMaxWidth?: number
}) => {
  const { text, measure, maxWidth, language, firstLineMaxWidth } = args
  const trimmed = text ?? ''
  if (!trimmed) return ['']

  // For CJK, wrap by character; for English, wrap by words/spaces.
  const parts =
    language === 'English'
      ? trimmed.split(/(\s+)/).filter((p) => p.length > 0)
      : Array.from(trimmed)

  const lines: string[] = []
  let current = ''
  const limitFor = (lineIndex: number) =>
    lineIndex === 0 && typeof firstLineMaxWidth === 'number' ? firstLineMaxWidth : maxWidth
  for (const part of parts) {
    const next = current ? current + part : part
    if (measure(next) <= limitFor(lines.length) || !current) {
      current = next
      continue
    }
    lines.push(current.trimEnd())
    current = part.trimStart()
  }
  if (current) lines.push(current.trimEnd())
  return lines.length > 0 ? lines : ['']
}

const buildResumePdfBlobRasterized = (args: {
  profile: ReturnType<typeof useAuth>['profile']
  draft: ResumeDraft
  jobTitle: string
  language: ResumeLanguage
  style: ResumeStyle
}) => {
  const { profile, draft, jobTitle, language, style } = args
  const preset = getResumeStylePreset(style)

  // Render each PDF page as an image drawn on a canvas using system fonts (Unicode-safe),
  // then embed the image into a PDF.
  const pdf = new jsPDF({ unit: 'pt', format: preset.pdfPageSizePt ?? 'letter' })
  const pageWidthPt = pdf.internal.pageSize.getWidth()
  const pageHeightPt = pdf.internal.pageSize.getHeight()
  const marginPtX = preset.pdfMarginPtX ?? preset.pdfMarginPt ?? 54
  const marginPtY = preset.pdfMarginPtY ?? preset.pdfMarginPt ?? 54

  const scale = 2
  const pageWidthPx = Math.round(pageWidthPt * scale)
  const pageHeightPx = Math.round(pageHeightPt * scale)
  const marginPxX = Math.round(marginPtX * scale)
  const marginPxY = Math.round(marginPtY * scale)

  const fontFamily = getCanvasFontStack(language, preset.fontFamily)

  const fullName = buildCandidateFullName(profile) || 'Candidate'
  const titleLine = jobTitle.trim()
  const locationLine = profile?.location?.trim() || ''
  const contactLine = [profile?.phone_number, getResumeContactEmail(profile), profile?.linkedin_url, profile?.github_url]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' | ')

  const toRgb = (hex: string) => {
    const normalized = hex.replace('#', '')
    const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return { r, g, b }
  }
  const rgbStr = (hex: string) => {
    const { r, g, b } = toRgb(hex)
    return `rgb(${r},${g},${b})`
  }

  const newPageCanvas = () => {
    const canvas = document.createElement('canvas')
    canvas.width = pageWidthPx
    canvas.height = pageHeightPx
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Missing canvas context')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#111111'
    return { canvas, ctx }
  }

  const embedCanvasPage = (canvas: HTMLCanvasElement, isFirst: boolean) => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
    if (!isFirst) pdf.addPage()
    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageWidthPt, pageHeightPt)
  }

  let { canvas, ctx } = newPageCanvas()
  let isFirstPage = true
  let y = marginPxY

  const maxWidthPx = pageWidthPx - marginPxX * 2

  const setFont = (sizePt: number, bold = false) => {
    const sizePx = Math.round(sizePt * scale)
    ctx.font = `${bold ? '700' : '400'} ${sizePx}px ${fontFamily}`
  }

  const ensureSpace = (neededPx: number) => {
    if (y + neededPx <= pageHeightPx - marginPxY) return
    embedCanvasPage(canvas, isFirstPage)
    isFirstPage = false
    ;({ canvas, ctx } = newPageCanvas())
    y = marginPxY
  }

  const drawHeader = (text: string, sizePt: number, bold: boolean, colorHex: string, afterPx: number) => {
    setFont(sizePt, bold)
    ctx.fillStyle = rgbStr(colorHex)
    const lines = wrapTextByMeasure({
      text,
      measure: (s) => ctx.measureText(s).width,
      maxWidth: maxWidthPx,
      language,
    })
    const lineHeight = Math.round((sizePt * 1.35) * scale)
    for (const line of lines) {
      ensureSpace(lineHeight)
      const w = ctx.measureText(line).width
      const x =
        preset.headerAlign === 'center'
          ? Math.round((pageWidthPx - w) / 2)
          : marginPxX
      ctx.fillText(line, x, y)
      y += lineHeight
    }
    y += afterPx
  }

  const drawDivider = () => {
    if (preset.dividerStyle === 'none') return
    ensureSpace(Math.round(10 * scale))
    ctx.strokeStyle = rgbStr(preset.accentHex)
    ctx.lineWidth = Math.round((preset.dividerStyle === 'thick' ? 2.25 : 1.25) * scale)
    ctx.beginPath()
    ctx.moveTo(marginPxX, y)
    ctx.lineTo(pageWidthPx - marginPxX, y)
    ctx.stroke()
    y += Math.round(18 * scale)
  }

  const drawSectionHeading = (label: string) => {
    const text = formatSectionHeading(label, preset)
    y += Math.round(10 * scale)
    ensureSpace(Math.round(18 * scale))
    setFont(preset.pdf.headingSize, true)

    if (preset.headingStyle === 'shaded') {
      const h = Math.round(18 * scale)
      ensureSpace(h)
      ctx.fillStyle = 'rgb(238,238,238)'
      ctx.fillRect(marginPxX, y - Math.round(13 * scale), pageWidthPx - marginPxX * 2, h)
      ctx.fillStyle = rgbStr('111111')
      ctx.fillText(text, marginPxX + Math.round(8 * scale), y)
      y += Math.round(16 * scale)
      return
    }

    if (preset.headingStyle === 'boxed') {
      const paddingX = Math.round(8 * scale)
      const paddingY = Math.round(5 * scale)
      const w = ctx.measureText(text).width
      const boxW = Math.min(pageWidthPx - marginPxX * 2, w + paddingX * 2)
      const boxH = Math.round(18 * scale)
      ensureSpace(boxH)
      ctx.fillStyle = rgbStr(preset.accentHex)
      ctx.fillRect(marginPxX, y - Math.round(13 * scale) - paddingY, boxW, boxH + paddingY)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(text, marginPxX + paddingX, y)
      y += Math.round(18 * scale)
      return
    }

    if (preset.headingStyle === 'bar') {
      const barW = Math.round(4 * scale)
      const barH = Math.round(16 * scale)
      ctx.fillStyle = rgbStr(preset.accentHex)
      ctx.fillRect(marginPxX, y - Math.round(12 * scale), barW, barH)
      ctx.fillStyle = rgbStr('111111')
      ctx.fillText(text, marginPxX + Math.round(10 * scale), y)
      y += Math.round(18 * scale)
      return
    }

    // underline / none
    ctx.fillStyle = rgbStr('111111')
    ctx.fillText(text, marginPxX, y)
    if (preset.headingStyle === 'underline') {
      y += Math.round(6 * scale)
      ctx.strokeStyle = rgbStr(preset.accentHex)
      ctx.lineWidth = Math.round(1.5 * scale)
      ctx.beginPath()
      ctx.moveTo(marginPxX, y)
      ctx.lineTo(pageWidthPx - marginPxX, y)
      ctx.stroke()
      y += Math.round(16 * scale)
    } else {
      y += Math.round(16 * scale)
    }
  }

  const drawParagraph = (text: string, sizePt: number, colorHex: string, lineHeightPt: number, afterPt: number) => {
    setFont(sizePt, false)
    ctx.fillStyle = rgbStr(colorHex)
    const lineHeightPx = Math.round(lineHeightPt * scale)
    const lines = wrapTextByMeasure({
      text,
      measure: (s) => ctx.measureText(s).width,
      maxWidth: maxWidthPx,
      language,
    })
    for (const line of lines) {
      ensureSpace(lineHeightPx)
      ctx.fillText(line, marginPxX, y)
      y += lineHeightPx
    }
    y += Math.round(afterPt * scale)
  }

  // Skills line with a bold category label followed by plain skills on the same line.
  // The first wrapped line is narrowed by the label width so the two never overlap.
  const drawSkillLine = (line: SkillLine, afterPt: number) => {
    const sizePt = 10.5
    const lineHeightPx = Math.round(16 * scale)
    const labelText = line.label ? `${line.label}: ` : ''

    setFont(sizePt, true)
    const labelWidth = labelText ? ctx.measureText(labelText).width : 0

    setFont(sizePt, false)
    const lines = wrapTextByMeasure({
      text: line.skills,
      measure: (s) => ctx.measureText(s).width,
      maxWidth: maxWidthPx,
      language,
      firstLineMaxWidth: maxWidthPx - labelWidth,
    })

    lines.forEach((text, index) => {
      // ensureSpace can swap in a fresh page canvas, so re-apply font and color after it.
      ensureSpace(lineHeightPx)
      if (index === 0 && labelText) {
        setFont(sizePt, true)
        ctx.fillStyle = rgbStr('111111')
        ctx.fillText(labelText, marginPxX, y)
      }
      setFont(sizePt, false)
      ctx.fillStyle = rgbStr('111111')
      ctx.fillText(text, index === 0 ? marginPxX + labelWidth : marginPxX, y)
      y += lineHeightPx
    })
    y += Math.round(afterPt * scale)
  }

  const drawBullet = (text: string) => {
    const lineHeightPx = Math.round(16 * scale)
    setFont(10, false)
    ctx.fillStyle = '#111111'
    ensureSpace(lineHeightPx)
    ctx.fillText(preset.bulletChar, marginPxX, y)
    const indentPx = Math.round(12 * scale)
    const bulletMaxWidthPx = maxWidthPx - indentPx
    const lines = wrapTextByMeasure({
      text,
      measure: (s) => ctx.measureText(s).width,
      maxWidth: bulletMaxWidthPx,
      language,
    })
    let first = true
    for (const line of lines) {
      if (!first) ensureSpace(lineHeightPx)
      ctx.fillText(line, marginPxX + indentPx, y)
      y += lineHeightPx
      first = false
    }
    y += Math.round(20 * scale)
  }

  const drawRightAligned = (text: string, sizePt: number, colorHex: string) => {
    setFont(sizePt, false)
    ctx.fillStyle = rgbStr(colorHex)
    const w = ctx.measureText(text).width
    const x = pageWidthPx - marginPxX - w
    ctx.fillText(text, x, y)
  }

  drawHeader(fullName, preset.pdf.nameSize, true, '111111', Math.round(2 * scale))
  if (titleLine) drawHeader(titleLine, preset.pdf.titleSize, true, '333333', 0)
  if (locationLine) drawHeader(locationLine, preset.pdf.contactSize, false, '555555', 0)
  if (contactLine) drawHeader(contactLine, preset.pdf.contactSize, false, '555555', 0)
  drawDivider()

  drawSectionHeading(SECTION_LABELS[language].summary)
  const summary = (draft.summary || '').trim()
  if (summary) drawParagraph(summary, 10.5, '111111', 16, 20)

  drawSectionHeading(SECTION_LABELS[language].skills)
  const skillLines = buildSkillLines(draft)
  skillLines.forEach((line, index) =>
    drawSkillLine(line, index === skillLines.length - 1 ? 20 : 4),
  )

  drawSectionHeading(SECTION_LABELS[language].experience)
  for (const item of draft.workHistory) {
    const dates = `${monthToLabel(item.start, language)} - ${item.end === 'Present' ? presentLabel(language) : monthToLabel(item.end, language)}`
    const locMode = [item.location, workModeLabel(item.workMode, language)].filter(Boolean).join(' | ')

    ensureSpace(Math.round(16 * scale))
    setFont(10.5, true)
    ctx.fillStyle = '#111111'
    const leftTitle = item.resume_title || 'Role'
    const leftLines = wrapTextByMeasure({
      text: leftTitle,
      measure: (s) => ctx.measureText(s).width,
      maxWidth: maxWidthPx * 0.62,
      language,
    })
    ctx.fillText(leftLines[0] ?? '', marginPxX, y)
    drawRightAligned(dates, 9.5, '555555')
    y += Math.round(16 * scale)
    for (const extra of leftLines.slice(1)) {
      ensureSpace(Math.round(16 * scale))
      ctx.fillText(extra, marginPxX, y)
      y += Math.round(16 * scale)
    }
    y += Math.round(10 * scale)

    ensureSpace(Math.round(16 * scale))
    setFont(10.5, false)
    ctx.fillStyle = '#1f4e79'
    const company = item.company || 'Company'
    const companyLines = wrapTextByMeasure({
      text: company,
      measure: (s) => ctx.measureText(s).width,
      maxWidth: maxWidthPx * 0.62,
      language,
    })
    ctx.fillText(companyLines[0] ?? '', marginPxX, y)
    drawRightAligned(locMode, 9.5, '555555')
    y += Math.round(16 * scale)
    for (const extra of companyLines.slice(1)) {
      ensureSpace(Math.round(16 * scale))
      ctx.fillText(extra, marginPxX, y)
      y += Math.round(16 * scale)
    }
    y += Math.round(12 * scale)

    for (const bullet of (item.bullets ?? []).map((b) => b.trim()).filter(Boolean)) drawBullet(bullet)
    y += Math.round(18 * scale)
  }

  drawSectionHeading(SECTION_LABELS[language].education)
  for (const edu of draft.education) {
    const degree = `${edu.degree} ${edu.field ? `in ${edu.field}` : ''}`.trim()
    const meta = [
      [edu.school, edu.location].filter(Boolean).join(' | '),
      `${monthToLabel(edu.start, language)} - ${edu.end === 'Present' ? presentLabel(language) : monthToLabel(edu.end, language)}`,
    ]
      .filter(Boolean)
      .join(' | ')

    drawParagraph(degree, 10.5, '111111', 16, 4)
    drawParagraph(meta, 9.5, '555555', 14, 12)
  }

  embedCanvasPage(canvas, isFirstPage)
  return pdf.output('blob')
}

const buildResumePdfBlobDocxStyle = (args: {
  profile: ReturnType<typeof useAuth>['profile']
  draft: ResumeDraft
  companyName: string
  jobTitle: string
  language: ResumeLanguage
  style: ResumeStyle
}) => {
  const { profile, draft, jobTitle, language, style } = args
  const preset = getResumeStylePreset(style)
  if (needsRasterizedPdf(language)) {
    return buildResumePdfBlobRasterized({ profile, draft, jobTitle, language, style })
  }

  const fullName = buildCandidateFullName(profile) || 'Candidate'
  const titleLine = jobTitle.trim()
  const locationLine = profile?.location?.trim() || ''
  const contactLine = [profile?.phone_number, getResumeContactEmail(profile), profile?.linkedin_url, profile?.github_url]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' | ')

  // Uses jsPDF built-in PDF fonts. We pick font per resume style.
  const pdf = new jsPDF({ unit: 'pt', format: preset.pdfPageSizePt ?? 'letter' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const marginX = preset.pdfMarginPtX ?? preset.pdfMarginPt ?? 54
  const marginY = preset.pdfMarginPtY ?? preset.pdfMarginPt ?? 54
  const maxWidth = pageWidth - marginX * 2

  // PDF spacing controls (tune UX here).
  const PDF_SPACING = {
    sectionHeadingToContent: 16, // gap after underline to first content line
    summaryLineHeight: 16,
    summaryAfter: 20,
    bulletLineHeight: 12,
    bulletAfter: 16, // space between bullet points
    skillBulletAfter: 14,
    experienceTitleToCompany: 10, // space between title line and company line
    experienceCompanyToBullets: 12, // space between company line and first bullet
    experienceAfterJob: 18, // space between jobs
    educationLineHeight: 16,
    educationMetaLineHeight: 14,
    footerLineHeight: 14,
  }

  const hexToRgb = (hex: string) => {
    const normalized = hex.replace('#', '')
    const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    return { r, g, b }
  }
  const setTextColorHex = (hex: string) => {
    const { r, g, b } = hexToRgb(hex)
    pdf.setTextColor(r, g, b)
  }

  const ensureSpace = (y: number, needed: number) => {
    if (y + needed <= pageHeight - marginY) return y
    pdf.addPage()
    return marginY
  }


  type Token = { text: string; bold: boolean }

  const pdfFontFamily = preset.pdfFontFamily

  // Body text is never keyword-bolded. Bold is reserved for structural elements
  // (candidate name, section headings, role titles), which set it explicitly.
  const buildHighlightedTokens = (text: string): Token[] => [{ text, bold: false }]

  const expandWhitespace = (tokens: Token[]) => {
    const expanded: Token[] = []
    for (const token of tokens) {
      const parts = token.text.split(/(\s+)/).filter(Boolean)
      for (const part of parts) expanded.push({ text: part, bold: token.bold })
    }
    return expanded
  }

  const measure = (text: string, size: number, bold: boolean) => {
    pdf.setFont(pdfFontFamily, bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    return pdf.getTextWidth(text)
  }

  const drawWrappedTokens = (opts: {
    tokens: Token[]
    x: number
    y: number
    maxWidth: number
    fontSize: number
    lineHeight: number
    colorHex: string
  }) => {
    setTextColorHex(opts.colorHex)
    const expanded = expandWhitespace(opts.tokens)
    let x = opts.x
    let y = opts.y
    const xMax = opts.x + opts.maxWidth

    for (const token of expanded) {
      if (x === opts.x && /^\s+$/.test(token.text)) continue
      const w = measure(token.text, opts.fontSize, token.bold)
      if (x + w > xMax && !/^\s+$/.test(token.text)) {
        y = ensureSpace(y + opts.lineHeight, opts.lineHeight)
        x = opts.x
      }
      pdf.setFont(pdfFontFamily, token.bold ? 'bold' : 'normal')
      pdf.setFontSize(opts.fontSize)
      pdf.text(token.text, x, y)
      x += w
    }
    return y
  }

  const drawHeaderWrapped = (text: string, y: number, size: number, bold: boolean, colorHex: string) => {
    pdf.setFont(pdfFontFamily, bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    setTextColorHex(colorHex)
    const lines = pdf.splitTextToSize(text, maxWidth) as string[]
    for (const line of lines) {
      y = ensureSpace(y, size + 6)
      if (preset.headerAlign === 'center') {
        pdf.text(line, pageWidth / 2, y, { align: 'center' })
      } else {
        pdf.text(line, marginX, y)
      }
      y += size + 4
    }
    return y
  }

  const drawDivider = (y: number) => {
    if (preset.dividerStyle === 'none') return y
    y = ensureSpace(y, 10)
    const { r, g, b } = hexToRgb(preset.accentHex)
    pdf.setDrawColor(r, g, b)
    pdf.setLineWidth(preset.dividerStyle === 'thick' ? 2.25 : 1.25)
    pdf.line(marginX, y, pageWidth - marginX, y)
    pdf.setLineWidth(1)
    return y + 18
  }

  const drawSectionHeading = (label: string, y: number) => {
    y = ensureSpace(y + 10, 18) // before: 10pt
    pdf.setFont(pdfFontFamily, 'bold')
    pdf.setFontSize(preset.pdf.headingSize)
    const text = formatSectionHeading(label, preset)

    if (preset.headingStyle === 'shaded') {
      const fill = { r: 238, g: 238, b: 238 }
      pdf.setFillColor(fill.r, fill.g, fill.b)
      pdf.rect(marginX, y - 12, maxWidth, 18, 'F')
      setTextColorHex('111111')
      pdf.text(text, marginX + 8, y)
      return y + 22
    }

    if (preset.headingStyle === 'boxed') {
      const { r, g, b } = hexToRgb(preset.accentHex)
      pdf.setFillColor(r, g, b)
      // keep it as a compact box starting at margin
      const w = Math.min(maxWidth, pdf.getTextWidth(text) + 16)
      pdf.rect(marginX, y - 12, w, 18, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.text(text, marginX + 8, y)
      setTextColorHex('111111')
      return y + 22
    }

    if (preset.headingStyle === 'bar') {
      const { r, g, b } = hexToRgb(preset.accentHex)
      pdf.setFillColor(r, g, b)
      pdf.rect(marginX, y - 12, 4, 16, 'F')
      setTextColorHex('111111')
      pdf.text(text, marginX + 10, y)
      return y + 22
    }

    // underline / none
    setTextColorHex('111111')
    pdf.text(text, marginX, y)
    if (preset.headingStyle === 'underline') {
      y += 6
      const { r, g, b } = hexToRgb(preset.accentHex)
      pdf.setDrawColor(r, g, b)
      pdf.setLineWidth(1.5)
      pdf.line(marginX, y, pageWidth - marginX, y)
      pdf.setLineWidth(1)
      return y + PDF_SPACING.sectionHeadingToContent
    }

    return y + 16
  }

  const drawExperienceLine = (opts: {
    left: string
    right: string
    y: number
    boldLeft: boolean
    leftColorHex: string
    leftSize: number
    rightSize: number
  }) => {
    let y = ensureSpace(opts.y, 16)

    // reserve space for right column to avoid overlap
    pdf.setFont(pdfFontFamily, 'normal')
    pdf.setFontSize(opts.rightSize)
    setTextColorHex('555555')
    const rightWidth = opts.right ? pdf.getTextWidth(opts.right) : 0
    const leftMax = Math.max(120, maxWidth - rightWidth - 12)
    const leftLines = pdf.splitTextToSize(opts.left, leftMax) as string[]

    pdf.setFont(pdfFontFamily, opts.boldLeft ? 'bold' : 'normal')
    pdf.setFontSize(opts.leftSize)
    setTextColorHex(opts.leftColorHex)
    pdf.text(leftLines[0] || '', marginX, y)

    if (opts.right) {
      pdf.setFont(pdfFontFamily, 'normal')
      pdf.setFontSize(opts.rightSize)
      setTextColorHex('555555')
      pdf.text(opts.right, pageWidth - marginX, y, { align: 'right' })
    }

    for (const line of leftLines.slice(1)) {
      y = ensureSpace(y + 14, 14)
      pdf.setFont(pdfFontFamily, opts.boldLeft ? 'bold' : 'normal')
      pdf.setFontSize(opts.leftSize)
      setTextColorHex(opts.leftColorHex)
      pdf.text(line, marginX, y)
    }

    return y + 8
  }

  const drawBullet = (text: string, y: number) => {
    const lineHeight = PDF_SPACING.bulletLineHeight
    y = ensureSpace(y, lineHeight)
    pdf.setFont(pdfFontFamily, 'normal')
    pdf.setFontSize(10) // 20 half-points
    setTextColorHex('111111')
    pdf.text(preset.bulletChar, marginX, y)
    y = drawWrappedTokens({
      tokens: buildHighlightedTokens(text),
      x: marginX + 12,
      y,
      maxWidth: maxWidth - 12,
      fontSize: 10,
      lineHeight,
      colorHex: '111111',
    })
    return y + PDF_SPACING.bulletAfter
  }

  // --- Render (mirrors DOCX order/labels) ---
  let y = marginY
  y = drawHeaderWrapped(fullName, y, preset.pdf.nameSize, true, preset.headerNameUsesAccent ? preset.accentHex : '111111')
  y += 2
  if (titleLine)
    y = drawHeaderWrapped(titleLine, y, preset.pdf.titleSize, true, preset.headerTitleUsesAccent ? preset.accentHex : '333333')
  if (locationLine) y = drawHeaderWrapped(locationLine, y, preset.pdf.contactSize, false, '555555')
  if (contactLine) y = drawHeaderWrapped(contactLine, y, preset.pdf.contactSize, false, '555555')
  y = drawDivider(y)

  y = drawSectionHeading(SECTION_LABELS[language].summary, y)
  const summary = (draft.summary || '').trim()
  if (summary) {
    y = drawWrappedTokens({
      tokens: buildHighlightedTokens(summary),
      x: marginX,
      y,
      maxWidth,
      fontSize: 10.5, // 21 half-points
      lineHeight: PDF_SPACING.summaryLineHeight,
      colorHex: '111111',
    })
    y += PDF_SPACING.summaryAfter
  } else {
    y += 10
  }

  y = drawSectionHeading(SECTION_LABELS[language].skills, y)
  const skillLines = buildSkillLines(draft)
  if (skillLines.length > 0) {
    for (const line of skillLines) {
      y = drawWrappedTokens({
        // Category label is bold; the skills themselves stay plain (no keyword bolding).
        tokens: [
          ...(line.label ? [{ text: `${line.label}: `, bold: true }] : []),
          { text: line.skills, bold: false },
        ],
        x: marginX,
        y,
        maxWidth,
        fontSize: 10,
        lineHeight: 14,
        colorHex: '111111',
      })
      y += 14
    }
    y += 2
  } else {
    y += 10
  }

  y = drawSectionHeading(SECTION_LABELS[language].experience, y)
  for (const item of draft.workHistory) {
    const titleForResume = item.resume_title
    const dates = `${monthToLabel(item.start, language)} - ${item.end === 'Present' ? presentLabel(language) : monthToLabel(item.end, language)}`
    const locMode = [item.location, workModeLabel(item.workMode, language)].filter(Boolean).join(' | ')

    y = drawExperienceLine({
      left: titleForResume || 'Role',
      right: dates,
      y,
      boldLeft: true,
      leftColorHex: '111111',
      leftSize: 10.5,
      rightSize: 9.5,
    })

    y = ensureSpace(y + PDF_SPACING.experienceTitleToCompany, PDF_SPACING.experienceTitleToCompany)
    y = drawExperienceLine({
      left: item.company || 'Company',
      right: locMode,
      y,
      boldLeft: false,
      leftColorHex: '1f4e79',
      leftSize: 10.5,
      rightSize: 9.5,
    })

    y = ensureSpace(y + PDF_SPACING.experienceCompanyToBullets, PDF_SPACING.experienceCompanyToBullets)
    const bullets = (item.bullets ?? []).map((b) => b.trim()).filter(Boolean)
    for (const bullet of bullets) {
      y = drawBullet(bullet, y)
    }
    y = ensureSpace(y + PDF_SPACING.experienceAfterJob, PDF_SPACING.experienceAfterJob)
  }

  y = drawSectionHeading(SECTION_LABELS[language].education, y)
  for (const edu of draft.education) {
    const degree = `${edu.degree} ${edu.field ? `in ${edu.field}` : ''}`.trim()
    const meta = [
      [edu.school, edu.location].filter(Boolean).join(' | '),
      `${monthToLabel(edu.start, language)} - ${edu.end === 'Present' ? presentLabel(language) : monthToLabel(edu.end, language)}`,
    ]
      .filter(Boolean)
      .join(' | ')

    y = ensureSpace(y, 16)
    pdf.setFont(pdfFontFamily, 'bold')
    pdf.setFontSize(10.5)
    setTextColorHex('111111')
    for (const line of (pdf.splitTextToSize(degree || ' ', maxWidth) as string[])) {
      y = ensureSpace(y, PDF_SPACING.educationLineHeight)
      pdf.text(line, marginX, y)
      y += PDF_SPACING.educationLineHeight
    }

    pdf.setFont(pdfFontFamily, 'normal')
    pdf.setFontSize(9.5)
    setTextColorHex('555555')
    for (const line of (pdf.splitTextToSize(meta || ' ', maxWidth) as string[])) {
      y = ensureSpace(y, PDF_SPACING.educationMetaLineHeight)
      pdf.text(line, marginX, y)
      y += PDF_SPACING.educationMetaLineHeight
    }

    y += 6
  }

  // Key Achievements
  const achievements = (draft.keyAchievements ?? []).map((s) => s.trim()).filter(Boolean)
  if (achievements.length > 0) {
    y = drawSectionHeading(SECTION_LABELS[language].achievements, y)
    for (const a of achievements) {
      y = drawBullet(a, y)
    }
    y = ensureSpace(y + 6, 12)
  }

  // Projects
  const projects = (draft.projects ?? []).map((s) => s.trim()).filter(Boolean)
  if (projects.length > 0) {
    y = drawSectionHeading(SECTION_LABELS[language].projects, y)
    for (const p of projects) {
      y = drawBullet(p, y)
    }
    y = ensureSpace(y + 6, 12)
  }

  return pdf.output('blob')
}

const buildCoverLetterPdfBlob = (args: {
  profile: ReturnType<typeof useAuth>['profile']
  draft: ResumeDraft
  language: ResumeLanguage
}) => {
  const { profile, draft, language } = args
  const fullName = buildCandidateFullName(profile) || 'Candidate'

  if (needsRasterizedPdf(language)) {
    // Rasterized cover letter PDF for CJK (Unicode-safe)
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
    const pageWidthPt = pdf.internal.pageSize.getWidth()
    const pageHeightPt = pdf.internal.pageSize.getHeight()
    const marginPt = 54
    const scale = 2
    const pageWidthPx = Math.round(pageWidthPt * scale)
    const pageHeightPx = Math.round(pageHeightPt * scale)
    const marginPx = Math.round(marginPt * scale)
    const maxWidthPx = pageWidthPx - marginPx * 2
    const fontFamily = getCanvasFontStack(language)

    const newCanvas = () => {
      const canvas = document.createElement('canvas')
      canvas.width = pageWidthPx
      canvas.height = pageHeightPx
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Missing canvas context')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = '#111111'
      return { canvas, ctx }
    }

    const embed = (canvas: HTMLCanvasElement, first: boolean) => {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
      if (!first) pdf.addPage()
      pdf.addImage(dataUrl, 'JPEG', 0, 0, pageWidthPt, pageHeightPt)
    }

    let { canvas, ctx } = newCanvas()
    let first = true
    let y = marginPx

    const setFont = (sizePt: number, bold = false) => {
      const sizePx = Math.round(sizePt * scale)
      ctx.font = `${bold ? '700' : '400'} ${sizePx}px ${fontFamily}`
    }
    const ensureSpace = (neededPx: number) => {
      if (y + neededPx <= pageHeightPx - marginPx) return
      embed(canvas, first)
      first = false
      ;({ canvas, ctx } = newCanvas())
      y = marginPx
    }

    const drawCentered = (text: string, sizePt: number, bold: boolean) => {
      setFont(sizePt, bold)
      const lines = wrapTextByMeasure({
        text,
        measure: (s) => ctx.measureText(s).width,
        maxWidth: maxWidthPx,
        language,
      })
      const lineHeight = Math.round((sizePt * 1.35) * scale)
      for (const line of lines) {
        ensureSpace(lineHeight)
        const w = ctx.measureText(line).width
        const x = Math.round((pageWidthPx - w) / 2)
        ctx.fillText(line, x, y)
        y += lineHeight
      }
    }

    const drawParagraphs = (text: string) => {
      setFont(10.5, false)
      const lineHeight = Math.round(16 * scale)
      const paragraphs = text.split(/\n{2,}/g).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean)
      for (const p of paragraphs) {
        const lines = wrapTextByMeasure({
          text: p,
          measure: (s) => ctx.measureText(s).width,
          maxWidth: maxWidthPx,
          language,
        })
        for (const line of lines) {
          ensureSpace(lineHeight)
          ctx.fillText(line, marginPx, y)
          y += lineHeight
        }
        y += Math.round(22 * scale)
      }
    }

    drawCentered(fullName, 19, true)
    const coverTitle = language === 'Japanese' ? 'カバーレター' : '求职信'
    drawCentered(coverTitle, 11.5, true)

    // divider
    ensureSpace(Math.round(10 * scale))
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = Math.round(2.25 * scale)
    ctx.beginPath()
    ctx.moveTo(marginPx, y)
    ctx.lineTo(pageWidthPx - marginPx, y)
    ctx.stroke()
    y += Math.round(18 * scale)

    drawParagraphs((draft.coverLetter || '').trim() || (language === 'Japanese' ? '（カバーレター本文がありません）' : '（求职信正文为空）'))

    embed(canvas, first)
    return pdf.output('blob')
  }

  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 54
  const maxWidth = pageWidth - margin * 2

  const ensureSpace = (y: number, needed: number) => {
    if (y + needed <= pageHeight - margin) return y
    pdf.addPage()
    return margin
  }

  // Only Latin-script languages reach this branch; CJK returned from the rasterized path above.
  const coverLetterHeading = language === 'Spanish' ? 'Carta de Presentación' : 'Cover Letter'
  const emptyCoverLetterText =
    language === 'Spanish'
      ? 'No se generó el texto de la carta de presentación.'
      : 'No cover letter text was generated.'

  let y = margin
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text(`${fullName} — ${coverLetterHeading}`, margin, y)
  y += 22

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)

  const body = (draft.coverLetter || '').trim()
  const paragraphs = body.length > 0 ? body.split(/\n{2,}/g) : []
  if (paragraphs.length === 0) {
    const wrapped = pdf.splitTextToSize(emptyCoverLetterText, maxWidth) as string[]
    for (const line of wrapped) {
      y = ensureSpace(y, 16)
      pdf.text(line, margin, y)
      y += 16
    }
    return pdf.output('blob')
  }

  for (const paragraph of paragraphs) {
    const wrapped = pdf.splitTextToSize(paragraph.replace(/\n/g, ' ').trim(), maxWidth) as string[]
    for (const line of wrapped) {
      y = ensureSpace(y, 16)
      pdf.text(line, margin, y)
      y += 16
    }
    y += 22
  }

  return pdf.output('blob')
}

const buildFileNames = (
  profile: ReturnType<typeof useAuth>['profile'],
  _companyName: string,
  role?: string,
): SavedFiles => {
  const fullName = sanitizeFileName(buildCandidateFullName(profile), 'Candidate')
  const title = sanitizeFileName(role ?? '', 'Role')
  const baseName = `${fullName} - ${title}`
  return {
    resume: `${baseName}.docx`,
    coverLetter: `${baseName} - Cover Letter.txt`,
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
  const [jobQuestions, setJobQuestions] = useState('')
  const [jobAnswers, setJobAnswers] = useState('')
  const [isGeneratingAnswers, setIsGeneratingAnswers] = useState(false)
  const [qaError, setQaError] = useState<string | null>(null)
  const [jobListItems, setJobListItems] = useState<JobListItem[]>([])
  const [jobListError, setJobListError] = useState<string | null>(null)
  const [jobListSourceName, setJobListSourceName] = useState<string | null>(null)
  const [isBatchGenerating, setIsBatchGenerating] = useState(false)
  const [batchIndex, setBatchIndex] = useState<number | null>(null)
  const abortBatchRef = useRef(false)
  const [jobUrl, setJobUrl] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [resumeLanguage, setResumeLanguage] = useState<ResumeLanguage>(() => {
    try {
      const saved = localStorage.getItem('resume_generator_language')
      if (saved === 'English' || saved === 'Japanese' || saved === 'Chinese' || saved === 'Spanish') return saved
    } catch {
      // ignore
    }
    return 'English'
  })
  const [resumeStyle, setResumeStyle] = useState<ResumeStyle>(() => {
    try {
      const saved = localStorage.getItem('resume_generator_style')
      if (
        saved === 'Classic' ||
        saved === 'Modern' ||
        saved === 'Minimal' ||
        saved === 'Executive' ||
        saved === 'Creative' ||
        saved === 'TrueCircle' ||
        saved === 'Wide'
      ) {
        return saved
      }
    } catch {
      // ignore
    }
    return 'Classic'
  })
  // Section toggles, off unless the user has explicitly opted in. These control what the
  // generator is asked for and what the exported files contain; they never delete what you
  // have typed into the draft, so turning a section back on restores it untouched.
  const [includeKeyAchievements, setIncludeKeyAchievements] = useState<boolean>(() => {
    try {
      return localStorage.getItem('resume_generator_include_achievements') === 'true'
    } catch {
      return false
    }
  })
  const [includeProjects, setIncludeProjects] = useState<boolean>(() => {
    try {
      return localStorage.getItem('resume_generator_include_projects') === 'true'
    } catch {
      return false
    }
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skillInput, setSkillInput] = useState('')
  const [skillCategoryInput, setSkillCategoryInput] = useState('')
  const [downloadHandle, setDownloadHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [downloadHandleName, setDownloadHandleName] = useState<string | null>(null)
  const [resultDialog, setResultDialog] = useState<{
    companyName: string
    jobTitle: string
    rootFolderName: string | null
    folderName: string
    files: string[]
  } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem('resume_generator_language', resumeLanguage)
    } catch {
      // ignore
    }
  }, [resumeLanguage])

  useEffect(() => {
    try {
      localStorage.removeItem('resume_generator_job_url')
      localStorage.removeItem('resume_generator_job_questions')
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('resume_generator_style', resumeStyle)
    } catch {
      // ignore
    }
  }, [resumeStyle])

  useEffect(() => {
    try {
      localStorage.setItem('resume_generator_include_achievements', String(includeKeyAchievements))
    } catch {
      // ignore
    }
  }, [includeKeyAchievements])

  useEffect(() => {
    try {
      localStorage.setItem('resume_generator_include_projects', String(includeProjects))
    } catch {
      // ignore
    }
  }, [includeProjects])

  // Single choke point for output: every renderer already skips a section whose array
  // is empty, so clearing them here omits the section from DOCX and both PDF paths.
  const applySectionToggles = (source: ResumeDraft): ResumeDraft => ({
    ...source,
    keyAchievements: includeKeyAchievements ? source.keyAchievements : [],
    projects: includeProjects ? source.projects : [],
  })

  // (ATS Print-to-PDF export removed; reverted to previous behavior.)

  const ensureDirectoryReadWritePermission = async (handle: FileSystemDirectoryHandle) => {
    const anyHandle = handle as unknown as {
      queryPermission?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<string>
      requestPermission?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<string>
    }

    if (typeof anyHandle.queryPermission !== 'function' || typeof anyHandle.requestPermission !== 'function') {
      return true
    }

    try {
      const current = await anyHandle.queryPermission({ mode: 'readwrite' })
      if (current === 'granted') return true
      const next = await anyHandle.requestPermission({ mode: 'readwrite' })
      return next === 'granted'
    } catch {
      return false
    }
  }

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
        const hasPermission = await ensureDirectoryReadWritePermission(dir)
        if (!hasPermission) {
          toast.error('Folder permission denied. Please choose a folder again.')
          return
        }
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

  // Candidate-authored content only, kept apart from generated output. UI edits come through
  // updateDraft and are recorded here; generation writes with setDraft and never lands here. So a
  // second generation (new job, new title) starts from the candidate's own material rather than
  // from the previous resume, and generated text is never mistaken for metric evidence or for the
  // candidate's own technology record.
  const candidateSourceRef = useRef<ResumeDraft>(baseDraft)

  const updateDraft = (updater: (prev: ResumeDraft) => ResumeDraft) => {
    setDraft((prev) => {
      const next = updater(prev)
      candidateSourceRef.current = mergeCandidateEdits(candidateSourceRef.current, prev, next)
      return next
    })
    setIsSaved(false)
    setIsDraftDirty(true)
    setHasGenerated(false)
  }

  // Regenerating replaces the category set, so a previously picked category can go stale.
  // Resolve once here so the dropdown and the add action always agree on the target.
  const skillCategoryNames = (draft.skillCategories ?? []).map((entry) => entry.category)
  const resolvedSkillCategory =
    skillCategoryInput &&
    (skillCategoryNames.includes(skillCategoryInput) || skillCategoryInput === OTHER_SKILL_CATEGORY)
      ? skillCategoryInput
      : (skillCategoryNames[0] ?? '')

  const handleAddSkill = () => {
    const nextSkill = skillInput.trim()
    if (!nextSkill) return
    updateDraft((prev) => addSkillToDraft(prev, nextSkill, resolvedSkillCategory || undefined))
    setSkillInput('')
  }

  const handleReset = () => {
    setDraft(baseDraft)
    candidateSourceRef.current = baseDraft
    setNotes('')
    setJobQuestions('')
    setJobAnswers('')
    setQaError(null)
    setCompanyName('')
    setJobTitle('')
    setJobUrl('')
    setError(null)
    setIsSaved(false)
    setIsDraftDirty(false)
    setHasGenerated(false)
    setResultDialog(null)
  }

  const handleGenerateAnswers = async () => {
    const questionsText = (jobQuestions ?? '').trim()
    if (!questionsText) {
      const msg = 'Please paste job application questions first.'
      setQaError(msg)
      toast.error(msg)
      return
    }

    const jdText = (notes ?? '').trim()
    if (jdText.length < 50) {
      const msg = 'Please add a job description (at least 50 characters) so the answers can be relevant.'
      setQaError(msg)
      toast.error(msg)
      return
    }

    setIsGeneratingAnswers(true)
    setQaError(null)

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
    if (!apiKey) {
      const msg = 'Missing OpenAI API key. Please add it to your environment variables.'
      setQaError(msg)
      toast.error(msg)
      setIsGeneratingAnswers(false)
      return
    }

    const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? 'gpt-4o-mini'

    const candidateSnapshot = {
      name: buildCandidateFullName(profile),
      location: profile?.location ?? '',
      headline: (draft.targetTitle ?? '').trim(),
      summary: (draft.summary ?? '').trim(),
      skills: Array.isArray(draft.skills) ? draft.skills : [],
      workHistory: Array.isArray(draft.workHistory)
        ? draft.workHistory.map((w) => ({
            company: w.company ?? '',
            title: w.resume_title ?? w.title ?? '',
            start: w.start ?? '',
            end: w.end ?? '',
            location: w.location ?? '',
            bullets: Array.isArray(w.bullets) ? w.bullets.filter((b) => (b ?? '').trim()) : [],
          }))
        : [],
      education: Array.isArray(draft.education)
        ? draft.education.map((e) => ({
            school: e.school ?? '',
            degree: e.degree ?? '',
            field: e.field ?? '',
            start: e.start ?? '',
            end: e.end ?? '',
          }))
        : [],
    }

    const jobContext = {
      companyName: (companyName ?? '').trim(),
      jobTitle: (jobTitle ?? '').trim(),
      jobUrl: (jobUrl ?? '').trim(),
      jobDescription: jdText,
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
          ...temperatureParam(model, 0.3),
          messages: [
            {
              role: 'system',
              content: `You write high-quality job application answers that are tightly grounded in the provided job details and candidate snapshot.

Rules:
- Answer in ${resumeLanguage}.
- Keep answers relevant to the job description and the role.
- Do not invent facts, metrics, employers, certifications, or tools not present in the candidate snapshot.
- If a question needs missing info (e.g., salary expectations, notice period), propose a safe template answer with placeholders like [YOUR NUMBER] or [YOUR DATE].
- Preserve the original question order.
- Output plain text only (no markdown, no code fences).`,
            },
            {
              role: 'user',
              content: `JOB CONTEXT:
${JSON.stringify(jobContext)}

CANDIDATE SNAPSHOT:
${JSON.stringify(candidateSnapshot)}

QUESTIONS (paste):
${questionsText}

Return answers in this format for each question:
Q: <original question>
A: <answer>
`,
            },
          ],
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const message = data?.error?.message ?? `OpenAI request failed (${response.status}).`
        throw new Error(message)
      }

      const content = (data?.choices?.[0]?.message?.content ?? '').toString()
      const sanitized = content
        .replace(/^```text\s*/i, '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()

      if (!sanitized) throw new Error('Empty response from AI.')
      setJobAnswers(sanitized)
      toast.success('Generated answers.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate answers.'
      setQaError(message)
      toast.error(message)
    } finally {
      setIsGeneratingAnswers(false)
    }
  }

  useEffect(() => {
    if (!isDraftDirty) {
      setDraft(baseDraft)
      candidateSourceRef.current = baseDraft
    }
  }, [baseDraft, isDraftDirty])

  const applyParsedToDraft = (
    prev: ResumeDraft,
    args: { parsed: any; parsedWithTitles: any; inputJobTitle: string },
  ): ResumeDraft => {
    const { parsedWithTitles, inputJobTitle } = args

    // determine grouped skill categories and the flattened list that mirrors them
    let flatSkills: string[] | undefined = undefined
    let skillCategories: SkillCategory[] | undefined = undefined

    // Keeps each skill in exactly one category, preserving the model's ordering.
    const toSkillCategories = (raw: Record<string, unknown>): SkillCategory[] => {
      const seen = new Set<string>()
      const out: SkillCategory[] = []
      for (const [rawCategory, rawSkills] of Object.entries(raw ?? {})) {
        const category = (rawCategory ?? '').toString().trim()
        const skills: string[] = []
        for (const value of Array.isArray(rawSkills) ? rawSkills : []) {
          const skill = (value ?? '').toString().trim()
          if (!skill) continue
          const key = skill.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          skills.push(skill)
        }
        if (category && skills.length > 0) out.push({ category, skills })
      }
      return out
    }

    // Fallback for a flat list where the model still encoded groups as "Category: a, b".
    const skillCategoriesFromFlat = (values: string[]): SkillCategory[] => {
      const out: SkillCategory[] = []
      for (const value of values) {
        const idx = value.indexOf(':')
        if (idx <= 0) continue
        const category = value.slice(0, idx).trim()
        const skills = value
          .slice(idx + 1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (category && skills.length > 0) out.push({ category, skills })
      }
      return out
    }

    if (parsedWithTitles?.claimedSkillsByCategory && typeof parsedWithTitles.claimedSkillsByCategory === 'object') {
      // prefer categorized response
      skillCategories = toSkillCategories(parsedWithTitles.claimedSkillsByCategory as Record<string, unknown>)
      flatSkills = skillCategories.flatMap((entry) => entry.skills)
    } else if (Array.isArray(parsedWithTitles?.claimedSkills)) {
      // fallback: model returned flat claimedSkills
      const values = parsedWithTitles.claimedSkills.map((s: string) => (s ?? '').trim()).filter(Boolean)
      const derived = skillCategoriesFromFlat(values)
      if (derived.length > 0) {
        skillCategories = derived
        flatSkills = derived.flatMap((entry) => entry.skills)
      } else {
        flatSkills = values
      }
    } else if (Array.isArray(parsedWithTitles?.skills)) {
      // legacy fallback
      flatSkills = parsedWithTitles.skills.map((s: string) => (s ?? '').trim()).filter(Boolean)
    }

    if (skillCategories && skillCategories.length === 0) skillCategories = undefined

    // helper to sanitize text returned from the model (single-line)
    const sanitizeText = (s: string) =>
      (s ?? '')
        .replace(/`+/g, '') // strip inline/backtick code markers
        .replace(/^\s+|\s+$/g, '')
        .replace(/\s+/g, ' ')

    // helper: sanitize multiline text (preserve line breaks)
    const sanitizeMultilineText = (s: unknown) => {
      const raw = (s ?? '').toString().replace(/`+/g, '').replace(/\r\n?/g, '\n').trim()
      if (!raw) return ''

      // Trim each line but keep empty lines; collapse internal whitespace per line.
      const lines = raw
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())

      // If there are line breaks but no blank lines, treat each newline as a paragraph break for readability.
      const hasAnyNewline = lines.length > 1
      const hasBlankLine = lines.some((l) => l.length === 0)
      let normalized = lines.join('\n').trim()
      if (hasAnyNewline && !hasBlankLine) {
        normalized = normalized.replace(/\n+/g, '\n\n')
      }

      // If the model returned a single long line, try to add safe breaks around greeting/closing.
      if (!normalized.includes('\n')) {
        const greetingMatch = normalized.match(/^.{0,80}?,\s+/)
        if (greetingMatch && greetingMatch.index === 0) {
          const cut = greetingMatch[0].length
          normalized = `${normalized.slice(0, cut).trim()}\n\n${normalized.slice(cut).trim()}`
        }

        const closingMatch = normalized.match(
          /\b(Kind regards|Sincerely|Best regards|Regards|Yours sincerely|Yours truly|Thank you|Thanks)\b/i,
        )
        if (closingMatch && typeof closingMatch.index === 'number') {
          const idx = closingMatch.index
          normalized = `${normalized.slice(0, idx).trim()}\n\n${normalized.slice(idx).trim()}`
        }
      }

      // Collapse 3+ newlines down to 2 (single blank line).
      normalized = normalized.replace(/\n{3,}/g, '\n\n').trim()
      return normalized
    }

    // helper: cap bullets at MAX_BULLETS_PER_ROLE. The minimum is reached upstream by asking the
    // model for more real bullets (ensureBulletCount), never by padding here: the old padding
    // ("Contributed to ..." copies, bullets split at "and" into verb-less fragments) produced
    // exactly the generic filler a reviewer discounts.
    const normalizeCount = (bullets: string[]) =>
      bullets.map((b) => sanitizeText(b)).filter(Boolean).slice(0, MAX_BULLETS_PER_ROLE)

    // deduplicate and normalize bullets for each company
    // use a globalSeen set to avoid repeating semantically identical bullets across companies
    const normalize = (s: string) => sanitizeText(s).toLowerCase()

    const globalSeen = new Set<string>()

    const workHistory = prev.workHistory.map((item) => {
      const next = parsedWithTitles?.workHistory?.find((entry: { id: string }) => entry.id === item.id)
      const incoming = Array.isArray(next?.bullets) && next.bullets.length > 0 ? next.bullets : item.bullets
      const nextResumeTitle =
        typeof next?.resumeTitle === 'string' && next.resumeTitle.trim() ? sanitizeText(next.resumeTitle) : undefined
      const localSeen = new Set<string>()
      const deduped: string[] = []

      for (const raw of incoming.map((b: string) => (b ?? '').trim()).filter(Boolean)) {
        const b = stripPlaceholderMetrics(stripBracketedMetrics(sanitizeText(raw)))
        if (!b) continue
        const key = normalize(b)

        // A repeated bullet is dropped. Rewording it as "As a <title>, ..." kept the duplicate
        // claim and added a robotic prefix.
        if (localSeen.has(key) || globalSeen.has(key)) continue

        localSeen.add(key)
        globalSeen.add(key)
        deduped.push(b)
      }

      const finalBullets = normalizeCount(deduped.length > 0 ? deduped : item.bullets)
      return {
        ...item,
        // Never fall back to saved company-history titles in the generated resume output.
        // If the model didn't provide a resumeTitle for this entry, use the generated targetTitle/jobTitle.
        resume_title:
          nextResumeTitle ??
          item.resume_title ??
          sanitizeText(inputJobTitle || '') ??
          '',
        bullets: finalBullets,
      }
    })

    return {
      ...prev,
      // The headline title is always the job title the user entered, never the model's rewording.
      targetTitle: inputJobTitle || prev.targetTitle,
      summary: parsedWithTitles?.summary
        ? stripPlaceholderMetrics(sanitizeText(parsedWithTitles.summary))
        : prev.summary,
      skills: Array.isArray(flatSkills) && flatSkills.length > 0 ? flatSkills : prev.skills,
      skillCategories:
        Array.isArray(flatSkills) && flatSkills.length > 0 ? skillCategories : prev.skillCategories,
      coverLetter: parsedWithTitles?.coverLetter
        ? stripPlaceholderMetrics(sanitizeMultilineText(parsedWithTitles.coverLetter))
        : prev.coverLetter,
      keyAchievements: Array.isArray(parsedWithTitles?.keyAchievements)
        ? parsedWithTitles.keyAchievements
            .map((s: string) => stripPlaceholderMetrics(stripBracketedMetrics(sanitizeText(s))))
            .filter(Boolean)
        : prev.keyAchievements,
      projects: Array.isArray(parsedWithTitles?.projects)
        ? parsedWithTitles.projects
            .map((s: string) => stripPlaceholderMetrics(stripTrailingEstimateTag(stripBracketedMetrics(sanitizeText(s)))))
            .filter(Boolean)
        : prev.projects,
      workHistory,
    }
  }

  const parseJobListFile = async (file: File): Promise<JobListItem[]> => {
    const normalizeKey = (raw: string) =>
      (raw ?? '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')

    const pick = (row: Record<string, any>, keys: string[]) => {
      for (const k of keys) {
        const v = row[k]
        if (typeof v === 'string' && v.trim()) return v.trim()
        if (typeof v === 'number' && Number.isFinite(v)) return String(v)
      }
      return ''
    }

    const toItem = (row: Record<string, any>, idx: number): JobListItem => {
      const company = pick(row, ['company_name', 'company', 'employer'])
      const title = pick(row, ['job_title', 'title', 'role', 'position'])
      const url = pick(row, [
        'application_link',
        'application_url',
        'applicationlink',
        'job_url',
        'joburl',
        'url',
        'link',
      ])
      const jd = pick(row, ['job_description', 'description', 'jd', 'notes'])
      const id = (globalThis.crypto as unknown as { randomUUID?: () => string })?.randomUUID?.() ?? `job_${Date.now()}_${idx}`
      return {
        id,
        companyName: company,
        jobTitle: title,
        jobUrl: url,
        jobDescription: jd,
        status: 'pending',
      }
    }

    const parseCsv = (text: string) => {
      const rows: string[][] = []
      let row: string[] = []
      let field = ''
      let inQuotes = false

      const pushField = () => {
        row.push(field)
        field = ''
      }
      const pushRow = () => {
        // skip empty trailing row
        if (row.length === 1 && !row[0]?.trim()) {
          row = []
          return
        }
        rows.push(row)
        row = []
      }

      for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        const next = text[i + 1]
        if (inQuotes) {
          if (ch === '"' && next === '"') {
            field += '"'
            i++
          } else if (ch === '"') {
            inQuotes = false
          } else {
            field += ch
          }
          continue
        }

        if (ch === '"') {
          inQuotes = true
          continue
        }
        if (ch === ',') {
          pushField()
          continue
        }
        if (ch === '\n') {
          pushField()
          pushRow()
          continue
        }
        if (ch === '\r') continue
        field += ch
      }
      pushField()
      if (row.length > 0) pushRow()
      return rows
    }

    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (ext === 'csv') {
      const text = await file.text()
      const parsed = parseCsv(text)
      const header = (parsed[0] ?? []).map(normalizeKey)
      const items: JobListItem[] = []
      for (let i = 1; i < parsed.length; i++) {
        const cells = parsed[i]
        const rowObj: Record<string, any> = {}
        for (let c = 0; c < header.length; c++) {
          rowObj[header[c]] = (cells[c] ?? '').toString()
        }
        items.push(toItem(rowObj, i - 1))
      }
      return items.filter((it) => it.companyName || it.jobTitle || it.jobUrl || it.jobDescription)
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheetName = wb.SheetNames?.[0]
      if (!sheetName) return []
      const sheet = wb.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[]
      const normalized = json.map((row) => {
        const out: Record<string, any> = {}
        for (const [k, v] of Object.entries(row)) out[normalizeKey(k)] = v
        return out
      })
      return normalized.map((r, idx) => toItem(r, idx)).filter((it) => it.companyName || it.jobTitle || it.jobUrl || it.jobDescription)
    }

    throw new Error('Unsupported file type. Please upload a .csv or .xlsx file.')
  }

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

    const exactJobTitle = normalizeJobTitle(jobTitle)

    if (!jobUrl.trim()) {
      const msg = 'Please enter a Job URL before generating.'
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

    // Heads-up only: flag constraint keywords in the JD without blocking generation.
    const jdLower = notes.toLowerCase()
    const warningWords = ['hybrid', 'onsite', 'on-site', 'clearance'] as const
    const matched = warningWords.filter((w) => jdLower.includes(w))
    if (matched.length > 0) {
      toast(`Heads-up: the job description mentions ${Array.from(new Set(matched)).join(', ')}.`, {
        icon: 'ℹ️',
        duration: 6000,
      })
    }

    if (!profile?.id) {
      const msg = 'Unable to save without a profile.'
      setError(msg)
      toast.error(msg)
      return
    }

    if (!downloadHandle) {
      const msg = 'Please choose a download folder before generating.'
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
    const yearsOfExperience = computeExperienceYears(draft.workHistory)
    // Evidence comes from what the candidate wrote, never from a previous generation's output.
    const source = candidateSourceRef.current
    const sourceBulletsFor = (id: string) =>
      collectEvidenceLines(source.workHistory.find((entry) => entry.id === id)?.bullets)
    const payload = {
      candidateName: buildCandidateFullName(profile),
      resumeLanguage,
      // Whole years, gaps excluded and overlaps merged; null when no role has a start date.
      yearsOfExperience,
      summary: source.summary,
      skills: source.skills,
      workHistory: draft.workHistory.map((item) => ({
        id: item.id,
        company: item.company,
        // Keep the original stored title for reference only; resume output titles come from resumeTitle.
        title: item.title,
        start: item.start,
        end: item.end,
        location: item.location,
        // Candidate-authored bullets: the only trustworthy source of real metrics and of the
        // candidate's own technology record.
        existingBullets: sourceBulletsFor(item.id),
      })),
      education: draft.education,
      // Candidate-authored achievements/projects, also a source of real metrics.
      existingKeyAchievements: collectEvidenceLines(source.keyAchievements),
      existingProjects: collectEvidenceLines(source.projects),
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
          ...temperatureParam(model, 0.4),
          messages: [
            {
              role: 'system',
              content:
                RESUME_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: buildResumePrompt({
                jobTitle: exactJobTitle,
                jobDescription: notes,
                resumeLanguage,
                includeKeyAchievements,
                includeProjects,
                payload,
              }),
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

      const sanitizeModelText = (s: unknown) =>
        (s ?? '')
          .toString()
          .replace(/`+/g, '')
          .replace(/^\s+|\s+$/g, '')
          .replace(/\s+/g, ' ')

      const parseModelJson = (raw: unknown) => {
        const content = (raw ?? '').toString()
        const cleaned = content
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim()
        return JSON.parse(cleaned)
      }

      const ensureSkills = async (draftParsed: any) => {
        // Generic entries ("Databases", "Communication") are removed first so they never count as skills.
        const existing = flattenClaimedSkills(Object.assign(draftParsed, refineParsedSkills(draftParsed)), sanitizeModelText)

        const unique = Array.from(new Set(existing.map((s: string) => s.trim()).filter(Boolean)))
        if (unique.length >= 35) {
          // Keep the flat mirror in sync for the downstream repair passes.
          draftParsed.claimedSkills = unique
          return draftParsed
        }

        const repairPayload = {
          resumeLanguage,
          targetJobTitle: jobTitle,
          jobDescription: notes,
          existingSkills: unique,
          existingCategories: draftParsed?.claimedSkillsByCategory ?? {},
          // provide evidence sources: profile skills + generated workHistory bullets (post-generation will include JD tech)
          payloadSkills: payload.skills ?? [],
          workHistory: payload.workHistory ?? [],
          // The bullets just written; every technology they name must also be listed as a skill.
          generatedBullets: Array.isArray(draftParsed?.workHistory)
            ? draftParsed.workHistory.flatMap((w: { bullets?: unknown }) => (Array.isArray(w?.bullets) ? w.bullets : []))
            : [],
        }

        const repairResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            ...temperatureParam(model, 0.2),
            messages: [
              {
                role: 'system',
                content:
                  'Output ONLY valid JSON (no markdown). Return: { claimedSkillsByCategory: { [category: string]: string[] } } and nothing else.',
              },
              {
                role: 'user',
                content: `Expand the resume skills to 35–50 items IN TOTAL, grouped into categories, prioritizing job-description relevance. Every item must be a specific, named technology, tool, service, library, protocol or method. Grow the list by getting MORE SPECIFIC (individual cloud services, libraries, testing tools, protocols, observability and day-to-day tools), never by adding generic terms. Every technology named in generatedBullets must be included.

Rules:
- Output claimedSkillsByCategory as an object mapping each category name to an array of skill strings.
- Use 5–8 categories derived from what the job description emphasizes (e.g. Languages, Frameworks & Libraries, Databases & Storage, Cloud & Infrastructure, DevOps & CI/CD, Testing, APIs & Protocols, Methods), using conventional category names rather than headings or phrases copied from the job description.
- Aim for roughly 5–9 skills per category, covering the job description's stack and the candidate's (languages, frameworks, libraries, datastores, individual cloud services, containers and IaC, CI/CD, testing, APIs/protocols/auth, data formats, observability, day-to-day tools).
- Be specific: name the actual thing, not the area. "PostgreSQL" not "Databases"; "AWS Lambda" or "S3" not "Cloud Computing"; "GitHub Actions" not "CI/CD tools"; "Jest" not "Testing"; "React" not "Frontend Development"; "Git" not "Version Control".
- Never include soft skills or umbrella terms: communication, teamwork, leadership, problem solving, software development, web development, programming, databases, cloud computing, debugging, best practices, system design, OOP. Named methods are fine (CI/CD, Microservices, REST, TDD, Agile, Scrum).
- Keep each item to 1–3 words: no "Proficient in", no descriptions, no parentheses.
- Order categories by relevance to the job description (most relevant first), and order skills within each category by importance to the role; never reproduce the order in which the job description lists them. Keep the candidate's own relevant skills from payloadSkills alongside the job's.
- Every skill must appear in exactly ONE category (no duplicates across categories).
- Avoid a generic "Other"/"Miscellaneous" category unless a relevant skill fits nowhere else.
- Include the P1 job-description technologies the candidate can plausibly claim, and P2 ones where supported.
- Do not invent certifications or tools with no plausible evidence; if adding a JD tool not present in payloadSkills, it must be consistent with the work history context.
- Keep items concise (1–3 words each where possible), deduplicate, and avoid near-duplicates.

Payload:
${JSON.stringify(repairPayload)}`,
              },
            ],
          }),
        })

        const repairData = await repairResponse.json().catch(() => null)
        if (!repairResponse.ok) return draftParsed

        const repairContent = repairData?.choices?.[0]?.message?.content ?? ''
        const repaired = parseModelJson(repairContent)
        // Count only specific skills, so a repair padded with generic terms does not "win".
        const refinedRepair = refineParsedSkills(repaired ?? {})
        const nextCategories = refinedRepair.claimedSkillsByCategory
        const next = flattenClaimedSkills(refinedRepair, sanitizeModelText)
        // Accept only a strictly richer list, so a weak repair never shrinks the skills section.
        if (next.length > unique.length) {
          draftParsed.claimedSkillsByCategory = nextCategories
          draftParsed.claimedSkills = next.slice(0, 50)
        }
        return draftParsed
      }

      const ensureResumeTitles = async (draftParsed: any) => {
        const requestedIds = payload.workHistory.map((w) => w.id)
        const entries = Array.isArray(draftParsed?.workHistory) ? draftParsed.workHistory : []
        const byId = new Map<string, any>()
        for (const entry of entries) {
          if (entry && typeof entry.id === 'string') byId.set(entry.id, entry)
        }
        const missingIds = requestedIds.filter((id) => {
          const rt = byId.get(id)?.resumeTitle
          return typeof rt !== 'string' || !rt.trim()
        })

        if (missingIds.length === 0) return draftParsed

        // Ask the model for only the missing resume titles (no bullets).
        const repairPayload = {
          targetJobTitle: jobTitle,
          targetTitle: draftParsed?.targetTitle ?? '',
          jobDescription: notes,
          workHistory: payload.workHistory.map((w) => ({
            id: w.id,
            originalTitle: w.title,
            company: w.company,
            start: w.start,
            end: w.end,
            location: w.location,
          })),
          missingIds,
        }

        const repairResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            ...temperatureParam(model, 0.2),
            messages: [
              {
                role: 'system',
                content:
                  'Output ONLY valid JSON (no markdown). Return: { workHistory: [{ id, resumeTitle }] } and nothing else.',
              },
              {
                role: 'user',
                content: `Generate role-aligned resumeTitle values for the missing workHistory ids. Titles must be tailored to the target job role, truthful, and not inflated in seniority. Do not invent new companies or change ids. Return one entry per missing id.\n\nPayload:\n${JSON.stringify(
                  repairPayload,
                )}`,
              },
            ],
          }),
        })

        const repairData = await repairResponse.json().catch(() => null)
        if (!repairResponse.ok) {
          return draftParsed
        }

        const repairContent = repairData?.choices?.[0]?.message?.content ?? ''
        const repairParsed = parseModelJson(repairContent)
        const repairs = Array.isArray(repairParsed?.workHistory) ? repairParsed.workHistory : []
        for (const r of repairs) {
          if (!r || typeof r.id !== 'string') continue
          if (!missingIds.includes(r.id)) continue
          const rt = sanitizeModelText(r.resumeTitle)
          if (!rt.trim()) continue
          const existing = byId.get(r.id) ?? { id: r.id }
          byId.set(r.id, { ...existing, resumeTitle: rt })
        }

        // Ensure the array has every id exactly once.
        draftParsed.workHistory = requestedIds.map((id) => byId.get(id) ?? { id, resumeTitle: sanitizeModelText(exactJobTitle) })
        return draftParsed
      }

      const ensureProjectsAndAchievements = async (draftParsed: any) => {
        const existingAchievements = Array.isArray(draftParsed?.keyAchievements)
          ? draftParsed.keyAchievements.map((s: unknown) => sanitizeModelText(s)).filter(Boolean)
          : []
        const existingProjects = Array.isArray(draftParsed?.projects)
          ? draftParsed.projects.map((s: unknown) => stripTrailingEstimateTag(sanitizeModelText(s))).filter(Boolean)
          : []

        // Counted only as context for the model. Do NOT gate the repair call on this: demanding a
        // fixed quota of measurable items when the candidate supplied no numbers is exactly what
        // pushed the model into emitting "X%" placeholders.
        const metricBackedAchievementCount = existingAchievements.filter((a: string) =>
          hasMeasurableImpact(a),
        ).length
        // An excluded section is never topped up: that would spend a whole extra call
        // generating content the export is about to drop.
        const needsAchievements = includeKeyAchievements && existingAchievements.length < 5
        const needsProjects = includeProjects && existingProjects.length === 0
        if (!needsAchievements && !needsProjects) return draftParsed

        const repairPayload = {
          resumeLanguage,
          targetJobTitle: jobTitle,
          targetTitle: draftParsed?.targetTitle ?? '',
          jobDescription: notes,
          summary: draftParsed?.summary ?? payload.summary,
          skills: draftParsed?.claimedSkills ?? payload.skills,
          workHistory: (draftParsed?.workHistory ?? payload.workHistory).map((w: any) => ({
            id: w.id,
            resumeTitle: w.resumeTitle ?? w.title ?? '',
            company: w.company ?? '',
            bullets: w.bullets ?? [],
          })),
          metricBackedAchievementCount,
          // The candidate's own words, so the repair pass can reuse real numbers instead of inventing them.
          candidateRealMetricsSource: {
            existingBullets: payload.workHistory.flatMap((w) => w.existingBullets ?? []),
            existingKeyAchievements: payload.existingKeyAchievements,
            existingProjects: payload.existingProjects,
          },
        }

        const repairResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            ...temperatureParam(model, 0.3),
            messages: [
              {
                role: 'system',
                content:
                  'Output ONLY valid JSON (no markdown). Return: { keyAchievements: string[], projects: string[] } and nothing else.',
              },
              {
                role: 'user',
                content: `Generate Key Achievements and Projects for this resume.\n\nRules:\n- keyAchievements: 5–6 items.\n- Real metrics (strict): payload.candidateRealMetricsSource holds the candidate's own words and is the ONLY source of real numbers. Extract every number in it (%, $, multipliers, ms/p95/p99, counts, volumes, durations) and reuse them VERBATIM across the achievements you write, keeping each number attached to the accomplishment it came from.\n- Prefer measurable impact for every keyAchievements item, but NEVER invent, estimate, or extrapolate a number, and NEVER write a literal placeholder such as "X%", "X percent", "[X%]", or "N%". If no real number is available for an item, make it concrete in non-numeric terms (scope, systems, technologies, before/after behavior) instead.\n- projects: EXACTLY 3 items.\n- Each project must be extremely relevant to the job description.\n- Each project item must be ONE sentence and must include ALL of:\n  a) a real user story (explicitly name the user persona and goal),\n  b) the technologies used (2–5 concrete technologies/tools mentioned in the JD),\n  c) the outcome/impact (include metrics if available; if you must estimate, do NOT add \"(est.)\"; write it naturally).\n- Use measurable outcomes when reasonable; if you must estimate, do NOT add \"(est.)\".\n- Do not invent company names.\n\nPayload:\n${JSON.stringify(
                  repairPayload,
                )}`,
              },
            ],
          }),
        })

        const repairData = await repairResponse.json().catch(() => null)
        if (!repairResponse.ok) return draftParsed

        const repairContent = repairData?.choices?.[0]?.message?.content ?? ''
        const repaired = parseModelJson(repairContent)

        const nextAchievements = Array.isArray(repaired?.keyAchievements)
          ? repaired.keyAchievements.map((s: unknown) => sanitizeModelText(s)).filter(Boolean)
          : []
        const nextProjects = Array.isArray(repaired?.projects)
          ? repaired.projects.map((s: unknown) => stripTrailingEstimateTag(sanitizeModelText(s))).filter(Boolean)
          : []

        if (needsAchievements && nextAchievements.length > 0) draftParsed.keyAchievements = nextAchievements
        if (needsProjects && nextProjects.length > 0) draftParsed.projects = nextProjects
        return draftParsed
      }

      // Final stages: specific bullets, no JD echo, technology timeline, no meta commentary.
      const parsedWithTitles = await polishGeneratedResume({
        draftParsed: await ensureProjectsAndAchievements(await ensureResumeTitles(await ensureSkills(parsed))),
        jobDescription: payload.notes,
        jobTitle: exactJobTitle,
        roles: payload.workHistory,
        evidenceTexts: [
          ...payload.workHistory.flatMap((role) => role.existingBullets ?? []),
          ...payload.existingKeyAchievements,
          ...payload.existingProjects,
          payload.summary ?? '',
        ],
        language: resumeLanguage,
        sanitize: sanitizeModelText,
        apiKey,
        model,
      })

      const nextDraft = applyParsedToDraft(draft, {
        parsed,
        parsedWithTitles,
        inputJobTitle: exactJobTitle,
      })
      setDraft(nextDraft)
      setIsDraftDirty(true)
      setHasGenerated(true)
      setIsGenerating(false)

      const saveResult = await performSave(nextDraft)
      if (!saveResult.ok) return

      const downloadResult = await performDownload({
        draft: nextDraft,
        companyName,
        jobTitle,
        jobUrl,
        notes,
      })
      if (!downloadResult.ok || !downloadResult.folderName || !downloadResult.files) return

      setResultDialog({
        companyName: companyName.trim(),
        jobTitle: exactJobTitle,
        rootFolderName: downloadHandleName,
        folderName: downloadResult.folderName,
        files: downloadResult.files,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate content.'
      setError(message)
      toast.error(message)
      // Fallback content is generated, not candidate-authored, so it bypasses updateDraft.
      setDraft((prev) => buildMockResume(prev, profile, resumeLanguage, exactJobTitle))
      setHasGenerated(true)
      setIsGenerating(false)
    }
  }

  const generateDraftForJobItem = async (base: ResumeDraft, item: JobListItem) => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
    if (!apiKey) {
      throw new Error('Missing OpenAI API key. Please add it to your environment variables.')
    }

    const model = (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? 'gpt-4o-mini'
    const yearsOfExperience = computeExperienceYears(base.workHistory)

    const jobTitleInput = (item.jobTitle ?? '').trim()
    const exactJobTitleInput = normalizeJobTitle(jobTitleInput)
    const notesInput = (item.jobDescription ?? '').trim()

    // Roles come from the batch snapshot; evidence comes from what the candidate wrote, never
    // from a previous generation's output (the snapshot may itself be a generated resume).
    const source = candidateSourceRef.current
    const sourceBulletsFor = (id: string) =>
      collectEvidenceLines(source.workHistory.find((entry) => entry.id === id)?.bullets)
    const payload = {
      candidateName: buildCandidateFullName(profile),
      resumeLanguage,
      // Whole years, gaps excluded and overlaps merged; null when no role has a start date.
      yearsOfExperience,
      summary: source.summary,
      skills: source.skills,
      workHistory: base.workHistory.map((wh) => ({
        id: wh.id,
        company: wh.company,
        title: wh.title,
        start: wh.start,
        end: wh.end,
        location: wh.location,
        // Candidate-authored bullets: the only trustworthy source of real metrics for every job
        // in the batch, and of the candidate's own technology record.
        existingBullets: sourceBulletsFor(wh.id),
      })),
      education: base.education,
      existingKeyAchievements: collectEvidenceLines(source.keyAchievements),
      existingProjects: collectEvidenceLines(source.projects),
      notes: notesInput,
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        ...temperatureParam(model, 0.4),
        messages: [
          {
            role: 'system',
            content:
              RESUME_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: buildResumePrompt({
              jobTitle: exactJobTitleInput,
              jobDescription: notesInput,
              resumeLanguage,
              includeKeyAchievements,
              includeProjects,
              payload,
            }),
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

    const sanitizeModelText = (s: unknown) =>
      (s ?? '')
        .toString()
        .replace(/`+/g, '')
        .replace(/^\s+|\s+$/g, '')
        .replace(/\s+/g, ' ')

    const parseModelJson = (raw: unknown) => {
      const content = (raw ?? '').toString()
      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()
      return JSON.parse(cleaned)
    }

    const ensureSkills = async (draftParsed: any) => {
      // Generic entries ("Databases", "Communication") are removed first so they never count as skills.
      const existing = flattenClaimedSkills(Object.assign(draftParsed, refineParsedSkills(draftParsed)), sanitizeModelText)

      const unique = Array.from(new Set(existing.map((s: string) => s.trim()).filter(Boolean)))
      if (unique.length >= 35) {
        // Keep the flat mirror in sync for the downstream repair passes.
        draftParsed.claimedSkills = unique
        return draftParsed
      }

      const repairPayload = {
        resumeLanguage,
        targetJobTitle: exactJobTitleInput,
        jobDescription: notesInput,
        existingSkills: unique,
        existingCategories: draftParsed?.claimedSkillsByCategory ?? {},
        payloadSkills: payload.skills ?? [],
        workHistory: payload.workHistory ?? [],
          // The bullets just written; every technology they name must also be listed as a skill.
          generatedBullets: Array.isArray(draftParsed?.workHistory)
            ? draftParsed.workHistory.flatMap((w: { bullets?: unknown }) => (Array.isArray(w?.bullets) ? w.bullets : []))
            : [],
      }

      const repairResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          ...temperatureParam(model, 0.2),
          messages: [
            {
              role: 'system',
              content:
                'Output ONLY valid JSON (no markdown). Return: { claimedSkillsByCategory: { [category: string]: string[] } } and nothing else.',
            },
            {
              role: 'user',
              content: `Expand the resume skills to 35–50 items IN TOTAL, grouped into categories, prioritizing job-description relevance. Every item must be a specific, named technology, tool, service, library, protocol or method. Grow the list by getting MORE SPECIFIC (individual cloud services, libraries, testing tools, protocols, observability and day-to-day tools), never by adding generic terms. Every technology named in generatedBullets must be included.

Rules:
- Output claimedSkillsByCategory as an object mapping each category name to an array of skill strings.
- Use 5–8 categories derived from what the job description emphasizes (e.g. Languages, Frameworks & Libraries, Databases & Storage, Cloud & Infrastructure, DevOps & CI/CD, Testing, APIs & Protocols, Methods), using conventional category names rather than headings or phrases copied from the job description.
- Aim for roughly 5–9 skills per category, covering the job description's stack and the candidate's (languages, frameworks, libraries, datastores, individual cloud services, containers and IaC, CI/CD, testing, APIs/protocols/auth, data formats, observability, day-to-day tools).
- Be specific: name the actual thing, not the area. "PostgreSQL" not "Databases"; "AWS Lambda" or "S3" not "Cloud Computing"; "GitHub Actions" not "CI/CD tools"; "Jest" not "Testing"; "React" not "Frontend Development"; "Git" not "Version Control".
- Never include soft skills or umbrella terms: communication, teamwork, leadership, problem solving, software development, web development, programming, databases, cloud computing, debugging, best practices, system design, OOP. Named methods are fine (CI/CD, Microservices, REST, TDD, Agile, Scrum).
- Keep each item to 1–3 words: no "Proficient in", no descriptions, no parentheses.
- Order categories by relevance to the job description (most relevant first), and order skills within each category by importance to the role; never reproduce the order in which the job description lists them. Keep the candidate's own relevant skills from payloadSkills alongside the job's.
- Every skill must appear in exactly ONE category (no duplicates across categories).
- Avoid a generic "Other"/"Miscellaneous" category unless a relevant skill fits nowhere else.
- Include the P1 job-description technologies the candidate can plausibly claim, and P2 ones where supported.
- Do not invent certifications or tools with no plausible evidence; if adding a JD tool not present in payloadSkills, it must be consistent with the work history context.
- Keep items concise (1–3 words each where possible), deduplicate, and avoid near-duplicates.

Payload:
${JSON.stringify(repairPayload)}`,
            },
          ],
        }),
      })

      const repairData = await repairResponse.json().catch(() => null)
      if (!repairResponse.ok) return draftParsed

      const repairContent = repairData?.choices?.[0]?.message?.content ?? ''
      const repaired = parseModelJson(repairContent)
      // Count only specific skills, so a repair padded with generic terms does not "win".
      const refinedRepair = refineParsedSkills(repaired ?? {})
      const nextCategories = refinedRepair.claimedSkillsByCategory
      const next = flattenClaimedSkills(refinedRepair, sanitizeModelText)
      // Accept only a strictly richer list, so a weak repair never shrinks the skills section.
      if (next.length > unique.length) {
        draftParsed.claimedSkillsByCategory = nextCategories
        draftParsed.claimedSkills = next.slice(0, 50)
      }
      return draftParsed
    }

    const ensureResumeTitles = async (draftParsed: any) => {
      const requestedIds = payload.workHistory.map((w) => w.id)
      const entries = Array.isArray(draftParsed?.workHistory) ? draftParsed.workHistory : []
      const byId = new Map<string, any>()
      for (const entry of entries) {
        if (entry && typeof entry.id === 'string') byId.set(entry.id, entry)
      }
      const missingIds = requestedIds.filter((id) => {
        const rt = byId.get(id)?.resumeTitle
        return typeof rt !== 'string' || !rt.trim()
      })

      if (missingIds.length === 0) return draftParsed

      const repairPayload = {
        targetJobTitle: exactJobTitleInput,
        targetTitle: draftParsed?.targetTitle ?? '',
        jobDescription: notesInput,
        workHistory: payload.workHistory.map((w) => ({
          id: w.id,
          originalTitle: w.title,
          company: w.company,
          start: w.start,
          end: w.end,
          location: w.location,
        })),
        missingIds,
      }

      const repairResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          ...temperatureParam(model, 0.2),
          messages: [
            {
              role: 'system',
              content: 'Output ONLY valid JSON (no markdown). Return: { workHistory: [{ id, resumeTitle }] } and nothing else.',
            },
            {
              role: 'user',
              content: `Generate role-aligned resumeTitle values for the missing workHistory ids. Titles must be tailored to the target job role, truthful, and not inflated in seniority. Do not invent new companies or change ids. Return one entry per missing id.\n\nPayload:\n${JSON.stringify(
                repairPayload,
              )}`,
            },
          ],
        }),
      })

      const repairData = await repairResponse.json().catch(() => null)
      if (!repairResponse.ok) {
        return draftParsed
      }

      const repairContent = repairData?.choices?.[0]?.message?.content ?? ''
      const repairParsed = parseModelJson(repairContent)
      const repairs = Array.isArray(repairParsed?.workHistory) ? repairParsed.workHistory : []
      for (const r of repairs) {
        if (!r || typeof r.id !== 'string') continue
        if (!missingIds.includes(r.id)) continue
        const rt = sanitizeModelText(r.resumeTitle)
        if (!rt.trim()) continue
        const existing = byId.get(r.id) ?? { id: r.id }
        byId.set(r.id, { ...existing, resumeTitle: rt })
      }

      draftParsed.workHistory = requestedIds.map((id) => byId.get(id) ?? { id, resumeTitle: sanitizeModelText(exactJobTitleInput) })
      return draftParsed
    }

    const ensureProjectsAndAchievements = async (draftParsed: any) => {
      const existingAchievements = Array.isArray(draftParsed?.keyAchievements)
        ? draftParsed.keyAchievements.map((s: unknown) => sanitizeModelText(s)).filter(Boolean)
        : []
      const existingProjects = Array.isArray(draftParsed?.projects)
        ? draftParsed.projects.map((s: unknown) => stripTrailingEstimateTag(sanitizeModelText(s))).filter(Boolean)
        : []

      // Counted only as context for the model — see the note in the single-generation copy above.
      const metricBackedAchievementCount = existingAchievements.filter((a: string) =>
        hasMeasurableImpact(a),
      ).length
      // An excluded section is never topped up — see the note in the single-generation copy.
      const needsAchievements = includeKeyAchievements && existingAchievements.length < 5
      const needsProjects = includeProjects && existingProjects.length === 0
      if (!needsAchievements && !needsProjects) return draftParsed

      const repairPayload = {
        resumeLanguage,
        targetJobTitle: exactJobTitleInput,
        targetTitle: draftParsed?.targetTitle ?? '',
        jobDescription: notesInput,
        summary: draftParsed?.summary ?? payload.summary,
        skills: draftParsed?.claimedSkills ?? payload.skills,
        workHistory: (draftParsed?.workHistory ?? payload.workHistory).map((w: any) => ({
          id: w.id,
          resumeTitle: w.resumeTitle ?? w.title ?? '',
          company: w.company ?? '',
          bullets: w.bullets ?? [],
        })),
        metricBackedAchievementCount,
        // The candidate's own words, so the repair pass can reuse real numbers instead of inventing them.
        candidateRealMetricsSource: {
          existingBullets: payload.workHistory.flatMap((w) => w.existingBullets ?? []),
          existingKeyAchievements: payload.existingKeyAchievements,
          existingProjects: payload.existingProjects,
        },
      }

      const repairResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          ...temperatureParam(model, 0.3),
          messages: [
            {
              role: 'system',
              content: 'Output ONLY valid JSON (no markdown). Return: { keyAchievements: string[], projects: string[] } and nothing else.',
            },
            {
              role: 'user',
              content: `Generate Key Achievements and Projects for this resume.\n\nRules:\n- keyAchievements: 5–6 items.\n- Real metrics (strict): payload.candidateRealMetricsSource holds the candidate's own words and is the ONLY source of real numbers. Extract every number in it (%, $, multipliers, ms/p95/p99, counts, volumes, durations) and reuse them VERBATIM across the achievements you write, keeping each number attached to the accomplishment it came from.\n- Prefer measurable impact for every keyAchievements item, but NEVER invent, estimate, or extrapolate a number, and NEVER write a literal placeholder such as "X%", "X percent", "[X%]", or "N%". If no real number is available for an item, make it concrete in non-numeric terms (scope, systems, technologies, before/after behavior) instead.\n- projects: EXACTLY 3 items.\n- Each project must be extremely relevant to the job description.\n- Each project item must be ONE sentence and must include ALL of:\n  a) a real user story (explicitly name the user persona and goal),\n  b) the technologies used (2–5 concrete technologies/tools mentioned in the JD),\n  c) the outcome/impact (include metrics if available; if you must estimate, do NOT add \"(est.)\"; write it naturally).\n- Use measurable outcomes when reasonable; if you must estimate, do NOT add \"(est.)\".\n- Do not invent company names.\n\nPayload:\n${JSON.stringify(
                repairPayload,
              )}`,
            },
          ],
        }),
      })

      const repairData = await repairResponse.json().catch(() => null)
      if (!repairResponse.ok) return draftParsed

      const repairContent = repairData?.choices?.[0]?.message?.content ?? ''
      const repaired = parseModelJson(repairContent)

      const nextAchievements = Array.isArray(repaired?.keyAchievements)
        ? repaired.keyAchievements.map((s: unknown) => sanitizeModelText(s)).filter(Boolean)
        : []
      const nextProjects = Array.isArray(repaired?.projects)
        ? repaired.projects.map((s: unknown) => stripTrailingEstimateTag(sanitizeModelText(s))).filter(Boolean)
        : []

      if (needsAchievements && nextAchievements.length > 0) draftParsed.keyAchievements = nextAchievements
      if (needsProjects && nextProjects.length > 0) draftParsed.projects = nextProjects
      return draftParsed
    }

    // Final stages: specific bullets, no JD echo, technology timeline, no meta commentary.
    const parsedWithTitles = await polishGeneratedResume({
      draftParsed: await ensureProjectsAndAchievements(await ensureResumeTitles(await ensureSkills(parsed))),
      jobDescription: payload.notes,
      jobTitle: exactJobTitleInput,
      roles: payload.workHistory,
      evidenceTexts: [
        ...payload.workHistory.flatMap((role) => role.existingBullets ?? []),
        ...payload.existingKeyAchievements,
        ...payload.existingProjects,
        payload.summary ?? '',
      ],
      language: resumeLanguage,
      sanitize: sanitizeModelText,
      apiKey,
      model,
    })
    return applyParsedToDraft(base, { parsed, parsedWithTitles, inputJobTitle: exactJobTitleInput })
  }

  const handleJobListFileSelected = async (file?: File | null) => {
    if (!file) return
    setJobListError(null)
    try {
      const items = await parseJobListFile(file)
      if (!items || items.length === 0) {
        setJobListError(
          'No rows found. Expected columns: Job Title, Company Name, Application Link, Job Description.',
        )
        setJobListItems([])
        setJobListSourceName(file.name ?? null)
        return
      }
      setJobListItems(items)
      setJobListSourceName(file.name ?? null)
      toast.success(`Loaded ${items.length} job(s).`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to read job list file.'
      setJobListError(msg)
      setJobListItems([])
      setJobListSourceName(file.name ?? null)
      toast.error(msg)
    }
  }

  const exportJobListResultsXlsx = () => {
    if (!jobListItems || jobListItems.length === 0) {
      toast.error('No jobs loaded.')
      return
    }

    // Browsers don't expose absolute file system paths.
    // Best-possible "full path" is: <selected download folder name>/<generated subfolder>.
    const downloadFolderLabel = (() => {
      const fromState = (downloadHandleName ?? '').trim()
      if (fromState) return fromState
      const fromHandle = ((downloadHandle as unknown as { name?: string } | null)?.name ?? '').toString().trim()
      if (fromHandle) return fromHandle
      return 'selected-folder'
    })()

    const header = ['company_name', 'job_title', 'job_url', 'job_description', 'saved_folder', 'status', 'message'] as const
    const data = jobListItems.map((it) => [
      it.companyName ?? '',
      it.jobTitle ?? '',
      it.jobUrl ?? '',
      it.jobDescription ?? '',
      it.folderName ? `${downloadFolderLabel}\\${it.folderName}` : '',
      it.status,
      it.message ?? '',
    ])

    const ws = XLSX.utils.aoa_to_sheet([Array.from(header), ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'results')

    const base = (jobListSourceName ?? 'job-list')
      .replace(/\.[^/.]+$/g, '') // strip extension
      .replace(/[\\/:*?"<>|]+/g, '_')
      .trim()
    const outName = `${base || 'job-list'}.results.xlsx`

    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = outName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${outName}`)
  }

  const handleBatchStop = () => {
    abortBatchRef.current = true
    toast('Stopping after current item…')
  }

  const handleBatchGenerateAndDownload = async () => {
    if (isBatchGenerating) return
    if (!downloadHandle) {
      toast.error('Please choose the folder which saves resume and cover letter')
      return
    }
    const hasPermission = await ensureDirectoryReadWritePermission(downloadHandle)
    if (!hasPermission) {
      toast.error('Please allow write access to the selected folder, or choose the folder again.')
      return
    }
    if (!profile) {
      toast.error('Missing profile.')
      return
    }
    if (!jobListItems || jobListItems.length === 0) {
      toast.error('Please upload a job list file first.')
      return
    }

    abortBatchRef.current = false
    setIsBatchGenerating(true)
    setBatchIndex(null)
    setJobListError(null)

    // Preserve the current draft & form state.
    const draftSnapshot = draft
    const prevCompany = companyName
    const prevTitle = jobTitle
    const prevUrl = jobUrl
    const prevNotes = notes

    try {
      for (let i = 0; i < jobListItems.length; i++) {
        if (abortBatchRef.current) break

        const item = jobListItems[i]
        setBatchIndex(i)
        setJobListItems((prev) =>
          prev.map((x) => (x.id === item.id ? { ...x, status: 'running', message: undefined } : x)),
        )

        const company = (item.companyName ?? '').trim()
        const title = (item.jobTitle ?? '').trim()
        const url = (item.jobUrl ?? '').trim()
        const jd = (item.jobDescription ?? '').trim()

        const fail = (message: string) => {
          setJobListItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, status: 'failed', message } : x)))
        }

        if (!company || !title || !url) {
          fail('Missing required fields (Company Name, Job Title, Application Link).')
          continue
        }
        if (jd.length < 100) {
          fail('Job description too short (< 100 chars).')
          continue
        }

        try {
          // Generate using the current draft as base for every job (preserves your existing logic).
          const generatedDraft = await generateDraftForJobItem(draftSnapshot, item)

          // Download/write materials for this job
          const { folderName } = await writeBundleToFolder(downloadHandle, {
            draft: generatedDraft,
            companyName: company,
            jobTitle: title,
            jobUrl: url,
            notes: jd,
          })

          setJobListItems((prev) =>
            prev.map((x) => (x.id === item.id ? { ...x, status: 'done', folderName } : x)),
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Generation failed.'
          fail(message)
        }
      }
    } finally {
      setIsBatchGenerating(false)
      setBatchIndex(null)
      // Restore user state
      setDraft(draftSnapshot)
      setCompanyName(prevCompany)
      setJobTitle(prevTitle)
      setJobUrl(prevUrl)
      setNotes(prevNotes)
    }
  }

  const performSave = async (
    draftToSave: ResumeDraft,
  ): Promise<{ ok: boolean; fileNames?: SavedFiles }> => {
    if (!profile?.id) {
      const msg = 'Unable to save without a profile.'
      setError(msg)
      toast.error(msg)
      return { ok: false }
    }
    if (!companyName.trim()) {
      const msg = 'Please enter a company name before saving.'
      setError(msg)
      toast.error(msg)
      return { ok: false }
    }
    if (!jobTitle.trim()) {
      const msg = 'Please enter a job title before saving.'
      setError(msg)
      toast.error(msg)
      return { ok: false }
    }
    if (!jobUrl.trim()) {
      const msg = 'Please enter a Job URL before saving.'
      setError(msg)
      toast.error(msg)
      return { ok: false }
    }
    if (!notes.trim()) {
      const msg = 'Please add a job description before saving.'
      setError(msg)
      toast.error(msg)
      return { ok: false }
    }

    setIsSaving(true)
    setError(null)
    const resolvedCompanyName = companyName.trim()
    const resolvedJobTitle = normalizeJobTitle(jobTitle)
    const fileNames = buildFileNames(profile, resolvedCompanyName, resolvedJobTitle)
    const { error: insertError } = await supabase.from('applied_jobs').insert({
      profile_id: profile.id,
      company_name: resolvedCompanyName || null,
      job_title: resolvedJobTitle || null,
      job_description: notes.trim(),
      resume_name: fileNames.resume,
      cover_letter_name: fileNames.coverLetter,
      skills: draftToSave.skills,
    })

    if (insertError) {
      setError(insertError.message)
      toast.error(insertError.message)
      setIsSaving(false)
      return { ok: false }
    }

    // filenames persisted to DB via resume_name / cover_letter_name; no local savedFiles state
    setIsSaved(true)
    setIsSaving(false)
    return { ok: true, fileNames }
  }

  const handleSave = async () => {
    if (isSaved || isSaving) return
    if (!hasGenerated) {
      const msg = 'Please generate a resume before saving.'
      setError(msg)
      toast.error(msg)
      return
    }
    await performSave(draft)
  }

  const moveItem = (items: string[], from: number, to: number) => {
    if (to < 0 || to >= items.length) return items
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  }

  const writeBundleToFolder = async (
    baseDir: FileSystemDirectoryHandle,
    job: { draft: ResumeDraft; companyName: string; jobTitle: string; notes: string; jobUrl: string },
  ) => {
    const { draft: rawDraftToSave, companyName: companyNameToSave, jobTitle: jobTitleToSave, notes: notesToSave, jobUrl: jobUrlToSave } = job
    // Excluded sections are dropped here so DOCX and both PDF renderers stay in sync.
    const draftToSave = applySectionToggles(rawDraftToSave)

    const fullName = buildCandidateFullName(profile)
    const titleLine = (jobTitleToSave || draftToSave.targetTitle || '').trim()
    const locationLine = profile?.location ?? ''
    const contactLine = [profile?.phone_number, getResumeContactEmail(profile), profile?.linkedin_url, profile?.github_url]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(' | ')
    const preset = getResumeStylePreset(resumeStyle)
    const experienceRightIndent = 360
    const docxMarginTwipsX = preset.docxMarginTwipsX ?? preset.docxMarginTwips ?? 1080
    const pageWidthTwips = preset.docxPageSizeTwips?.width ?? 12240 // default: US Letter (8.5in)
    const contentWidthTwips = pageWidthTwips - docxMarginTwipsX * 2
    const rightTabStop = contentWidthTwips - experienceRightIndent
    const fontFamily = preset.fontFamily
    const headingText = (value: string) => formatSectionHeading(value, preset)
    const headerAlignment = preset.headerAlign === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT
    // Driven by the preset (not a style-name list) so the DOCX and the PDF agree.
    const headerNameColor = preset.headerNameUsesAccent ? preset.accentHex : '111111'
    const headerTitleColor = preset.headerTitleUsesAccent ? preset.accentHex : '333333'
    // Body text is never keyword-bolded. Bold is reserved for structural elements
    // (candidate name, section headings, role titles), which set it explicitly.
    const buildHighlightedRuns = (text: string, size = 21) => [
      new TextRun({ text, size, color: '111111', font: fontFamily }),
    ]
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
    const sectionHeading = (text: string) => {
      const label = headingText(text)
      const baseSpacing = { before: 200, after: 80 }

      if (preset.headingStyle === 'shaded') {
        return new Paragraph({
          children: [
            new TextRun({
              text: label,
              bold: true,
              color: '111111',
              size: 21,
              font: fontFamily,
            }),
          ],
          spacing: baseSpacing,
          shading: { type: ShadingType.CLEAR, fill: 'EEEEEE', color: 'auto' },
        })
      }

      if (preset.headingStyle === 'boxed') {
        return new Paragraph({
          children: [
            new TextRun({
              text: label,
              bold: true,
              color: 'FFFFFF',
              size: 21,
              font: fontFamily,
            }),
          ],
          spacing: baseSpacing,
          shading: { type: ShadingType.CLEAR, fill: preset.accentHex.toUpperCase(), color: 'auto' },
          border: {
            top: { color: preset.accentHex, space: 1, value: BorderStyle.SINGLE, size: 10 },
            bottom: { color: preset.accentHex, space: 1, value: BorderStyle.SINGLE, size: 10 },
            left: { color: preset.accentHex, space: 1, value: BorderStyle.SINGLE, size: 10 },
            right: { color: preset.accentHex, space: 1, value: BorderStyle.SINGLE, size: 10 },
          },
        })
      }

      if (preset.headingStyle === 'bar') {
        return new Paragraph({
          children: [
            new TextRun({
              text: label,
              bold: true,
              color: '111111',
              size: 21,
              font: fontFamily,
            }),
          ],
          spacing: baseSpacing,
          border: {
            left: { color: preset.accentHex, space: 1, value: BorderStyle.SINGLE, size: 18 },
          },
          indent: { left: 180 },
        })
      }

      if (preset.headingStyle === 'none') {
        return new Paragraph({
          children: [
            new TextRun({
              text: label,
              bold: true,
              color: '555555',
              size: 19,
              font: fontFamily,
            }),
          ],
          spacing: { before: 160, after: 60 },
        })
      }

      // underline (default)
      return new Paragraph({
        children: [
          new TextRun({
            text: label,
            bold: true,
            color: '111111',
            size: 21,
            font: fontFamily,
          }),
        ],
        spacing: baseSpacing,
        border: {
          bottom: {
            color: preset.accentHex.toUpperCase(),
            space: 1,
            value: BorderStyle.SINGLE,
            size: 12,
          },
        },
      })
    }
    const educationMeta = (text: string) =>
      new Paragraph({
        children: [new TextRun({ text, size: 19, color: '555555', font: fontFamily })],
        spacing: { after: 60 },
      })

    const docxSectionLabels: Record<
      ResumeLanguage,
      { summary: string; skills: string; experience: string; education: string; achievements: string; projects: string }
    > = {
      English: {
        summary: 'SUMMARY',
        skills: 'SKILLS',
        experience: 'EXPERIENCE',
        education: 'EDUCATION',
        achievements: 'KEY ACHIEVEMENTS',
        projects: 'PROJECTS',
      },
      Japanese: {
        summary: '概要',
        skills: '技術スキル',
        experience: '職務経歴',
        education: '学歴',
        achievements: '主な実績',
        projects: 'プロジェクト',
      },
      Chinese: {
        summary: '概要',
        skills: '技术技能',
        experience: '工作经历',
        education: '教育背景',
        achievements: '关键成果',
        projects: '项目',
      },
      Spanish: {
        summary: 'PERFIL PROFESIONAL',
        skills: 'HABILIDADES',
        experience: 'EXPERIENCIA',
        education: 'EDUCACIÓN',
        achievements: 'LOGROS CLAVE',
        projects: 'PROYECTOS',
      },
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
              ...(preset.docxPageSizeTwips
                ? {
                    size: {
                      width: preset.docxPageSizeTwips.width,
                      height: preset.docxPageSizeTwips.height,
                    },
                  }
                : {}),
              margin: {
                top: preset.docxMarginTwipsY ?? preset.docxMarginTwips ?? 1080,
                bottom: preset.docxMarginTwipsY ?? preset.docxMarginTwips ?? 1080,
                left: preset.docxMarginTwipsX ?? preset.docxMarginTwips ?? 1080,
                right: preset.docxMarginTwipsX ?? preset.docxMarginTwips ?? 1080,
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
                  color: headerNameColor,
                  font: fontFamily,
                }),
              ],
              alignment: headerAlignment,
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
                        color: headerTitleColor,
                        font: fontFamily,
                      }),
                    ],
                    alignment: headerAlignment,
                    spacing: { after: locationLine ? 20 : 40 },
                  }),
                ]
              : []),
            ...(locationLine
              ? [
                  new Paragraph({
                    children: [new TextRun({ text: locationLine, size: 20, color: '555555', font: fontFamily })],
                    alignment: headerAlignment,
                    spacing: { after: contactLine ? 10 : 50 },
                  }),
                ]
              : []),
            ...(contactLine
              ? [
                  new Paragraph({
                    children: [new TextRun({ text: contactLine, size: 20, color: '555555', font: fontFamily })],
                    alignment: headerAlignment,
                    spacing: { after: 60 },
                  }),
                ]
              : []),
            ...(preset.dividerStyle === 'none'
              ? []
              : [
                  new Paragraph({
                    // Word may skip rendering borders on an empty paragraph.
                    // Keep a single whitespace run so the separator line always appears.
                    children: [new TextRun({ text: ' ', font: fontFamily, size: 2, color: 'FFFFFF' })],
                    border: {
                      bottom: {
                        color: preset.accentHex.toUpperCase(),
                        space: 1,
                        value: BorderStyle.SINGLE,
                        size: preset.dividerStyle === 'thick' ? 18 : 10,
                      },
                    },
                    spacing: { after: 60 },
                  }),
                ]),
            sectionHeading(docxSectionLabels[resumeLanguage].summary),
            new Paragraph({
              children: buildHighlightedRuns(draftToSave.summary, 21),
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 140 },
            }),
            // Add one blank line before the Skills section.
            new Paragraph({ text: '' }),
            sectionHeading(docxSectionLabels[resumeLanguage].skills),
            // One paragraph per skill category: the category label is bold, the skills themselves
            // stay plain (no keyword bolding).
            ...buildSkillLines(draftToSave).map(
              (line, index, lines) =>
                new Paragraph({
                  children: [
                    ...(line.label
                      ? [
                          new TextRun({
                            text: `${line.label}: `,
                            bold: true,
                            size: 20,
                            color: '111111',
                            font: fontFamily,
                          }),
                        ]
                      : []),
                    new TextRun({ text: line.skills, size: 20, color: '111111', font: fontFamily }),
                  ],
                  alignment: AlignmentType.LEFT,
                  spacing: { after: index === lines.length - 1 ? 140 : 40 },
                }),
            ),
            new Paragraph({ text: '', spacing: { after: 80 } }),
            sectionHeading(docxSectionLabels[resumeLanguage].experience),
            ...draftToSave.workHistory.flatMap((item) => [
              experienceLine(
                item.resume_title || 'Role',
                `${monthToLabel(item.start, resumeLanguage)} - ${item.end === 'Present' ? presentLabel(resumeLanguage) : monthToLabel(item.end, resumeLanguage)}`,
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
            sectionHeading(docxSectionLabels[resumeLanguage].education),
            ...draftToSave.education.flatMap((edu) => {
              const degreeLine = `${edu.degree} ${edu.field ? `in ${edu.field}` : ''}`.trim()
              const metaLine = [
                [edu.school, edu.location].filter(Boolean).join(' | '),
                `${monthToLabel(edu.start, resumeLanguage)} - ${edu.end === 'Present' ? presentLabel(resumeLanguage) : monthToLabel(edu.end, resumeLanguage)}`,
              ]
                .filter(Boolean)
                .join(' | ')

              return [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: degreeLine,
                      bold: true,
                      size: 21,
                      color: '111111',
                      font: fontFamily,
                    }),
                  ],
                  spacing: { after: 40 },
                }),
                educationMeta(metaLine),
              ]
            }),
            ...(draftToSave.keyAchievements ?? []).map((value) => value.trim()).filter(Boolean).length > 0
              ? [
                  new Paragraph({ text: '', spacing: { after: 80 } }),
                  sectionHeading(docxSectionLabels[resumeLanguage].achievements),
                  ...(draftToSave.keyAchievements ?? [])
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .map((bullet) =>
                      new Paragraph({
                        children: buildHighlightedRuns(bullet, 20),
                        bullet: { level: 0 },
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 30 },
                      }),
                    ),
                ]
              : [],
            ...(draftToSave.projects ?? []).map((value) => value.trim()).filter(Boolean).length > 0
              ? [
                  new Paragraph({ text: '', spacing: { after: 80 } }),
                  sectionHeading(docxSectionLabels[resumeLanguage].projects),
                  ...(draftToSave.projects ?? [])
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .map((bullet) =>
                      new Paragraph({
                        children: buildHighlightedRuns(bullet, 20),
                        bullet: { level: 0 },
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 30 },
                      }),
                    ),
                ]
              : [],
          ],
        },
      ],
    })

    const blob = await Packer.toBlob(doc)
    const resumePdfBlob = buildResumePdfBlobDocxStyle({
      profile,
      draft: draftToSave,
      companyName: companyNameToSave || '',
      jobTitle: (jobTitleToSave || draftToSave.targetTitle || '').trim(),
      language: resumeLanguage,
      style: resumeStyle,
    })
    const fullNameSlug = sanitizeFilePart(buildCandidateFullName(profile), 'candidate')
    const roleSlug = sanitizeFilePart((jobTitleToSave || draftToSave.targetTitle || '').trim(), 'role')
    const companySlug = sanitizeFilePart(companyNameToSave || '', 'company')
    const folderName = `${fullNameSlug}_${roleSlug}_${companySlug}`
    const coverText = draftToSave.coverLetter || ''
    const coverPdfBlob = buildCoverLetterPdfBlob({ profile, draft: draftToSave, language: resumeLanguage })

    const resumeBaseName = sanitizeFileName(
      `${buildCandidateFullName(profile) || 'Candidate'} - ${(jobTitleToSave || draftToSave.targetTitle || 'Role').trim()}`,
      'Resume',
    )
    const resumeDocxName = `${resumeBaseName}.docx`
    const resumePdfName = `${resumeBaseName}.pdf`

    const jobDescriptionText = (notesToSave ?? '').trim()
    const jobUrlText = (jobUrlToSave ?? '').trim()
    const jobDescriptionFileName = sanitizeFileName(
      `${(companyNameToSave || 'Company').trim()} - ${(jobTitleToSave || draftToSave.targetTitle || 'Role').trim()}`,
      'Job Description',
    )
    const jobDescriptionTxtName = `${jobDescriptionFileName}.txt`
    const jobDescriptionTxtContent = jobUrlText ? `${jobUrlText}\n\n${jobDescriptionText}` : jobDescriptionText

    const folderHandle = await baseDir.getDirectoryHandle(folderName, { create: true })
    const folderHasPermission = await ensureDirectoryReadWritePermission(folderHandle)
    if (!folderHasPermission) {
      throw new Error('Permission denied')
    }

    const resumeHandle = await folderHandle.getFileHandle(resumeDocxName, { create: true })
    const resumeWritable = await resumeHandle.createWritable()
    await resumeWritable.write(blob)
    await resumeWritable.close()

    const resumePdfHandle = await folderHandle.getFileHandle(resumePdfName, { create: true })
    const resumePdfWritable = await resumePdfHandle.createWritable()
    await resumePdfWritable.write(resumePdfBlob)
    await resumePdfWritable.close()

    const coverHandle = await folderHandle.getFileHandle('coverletter.txt', { create: true })
    const coverWritable = await coverHandle.createWritable()
    await coverWritable.write(new Blob([coverText], { type: 'text/plain;charset=utf-8' }))
    await coverWritable.close()

    const coverPdfHandle = await folderHandle.getFileHandle('coverletter.pdf', { create: true })
    const coverPdfWritable = await coverPdfHandle.createWritable()
    await coverPdfWritable.write(coverPdfBlob)
    await coverPdfWritable.close()

    // Job description TXT (company - job title)
    const jdHandle = await folderHandle.getFileHandle(jobDescriptionTxtName, { create: true })
    const jdWritable = await jdHandle.createWritable()
    await jdWritable.write(new Blob([jobDescriptionTxtContent], { type: 'text/plain;charset=utf-8' }))
    await jdWritable.close()

    return {
      folderName,
      resumeDocxName,
      resumePdfName,
      coverLetterTxtName: 'coverletter.txt',
      coverLetterPdfName: 'coverletter.pdf',
      jobDescriptionTxtName,
    }
  }

  const performDownload = async (job: {
    draft: ResumeDraft
    companyName: string
    jobTitle: string
    jobUrl: string
    notes: string
  }): Promise<{ ok: boolean; folderName?: string; files?: string[] }> => {
    // Require user to choose a download folder explicitly
    if (!downloadHandle) {
      toast.error('Please choose the folder which saves resume and cover letter')
      return { ok: false }
    }

    const hasPermission = await ensureDirectoryReadWritePermission(downloadHandle)
    if (!hasPermission) {
      toast.error('Please allow write access to the selected folder, or choose the folder again.')
      return { ok: false }
    }

    setIsDownloading(true)
    try {
      // No success toast: completion is reported by the result dialog instead.
      const result = await writeBundleToFolder(downloadHandle, job)
      return {
        ok: true,
        folderName: result.folderName,
        files: [
          result.resumeDocxName,
          result.resumePdfName,
          result.coverLetterTxtName,
          result.coverLetterPdfName,
          result.jobDescriptionTxtName,
        ],
      }
    } catch (err) {
      console.error(err)
      const e = err as { name?: string; message?: string }
      const details = [e?.name, e?.message].filter(Boolean).join(': ')
      toast.error(
        details
          ? `Unable to write to the selected folder (${details}). Please choose the folder again.`
          : 'Unable to write to the selected folder. Please choose the folder again.',
      )

      // Immediately prompt to re-pick a folder and retry.
      try {
        const win = window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
        if (!win || typeof win.showDirectoryPicker !== 'function') return { ok: false }

        const dir = await win.showDirectoryPicker()
        const hasRetryPermission = await ensureDirectoryReadWritePermission(dir)
        if (!hasRetryPermission) {
          toast.error('Folder permission denied. Please choose a folder again.')
          return { ok: false }
        }

        await saveHandleToIDB(dir)
        setDownloadHandle(dir)
        const name = (dir as unknown as { name?: string }).name ?? null
        setDownloadHandleName(name)

        const retryResult = await writeBundleToFolder(dir, job)
        return {
          ok: true,
          folderName: retryResult.folderName,
          files: [
            retryResult.resumeDocxName,
            retryResult.resumePdfName,
            retryResult.coverLetterTxtName,
            retryResult.coverLetterPdfName,
            retryResult.jobDescriptionTxtName,
          ],
        }
      } catch (retryErr) {
        console.error(retryErr)
        toast.error('Unable to write to the selected folder. Please choose the folder again.')
        return { ok: false }
      }
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDownloadResume = async () => {
    const result = await performDownload({ draft, companyName, jobTitle, jobUrl, notes })
    if (!result.ok || !result.folderName || !result.files) return

    // Manual downloads report completion through the same dialog, not a toast.
    setResultDialog({
      companyName: companyName.trim(),
      jobTitle: normalizeJobTitle(jobTitle),
      rootFolderName: downloadHandleName,
      folderName: result.folderName,
      files: result.files,
    })
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
          Generate a resume DOCX and a cover letter TXT using your saved profile. Clicking Generate will also save
          the application and download the files to your chosen folder.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">Generation notes</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-200">
                <span className="text-slate-300">Language</span>
                <select
                  value={resumeLanguage}
                  onChange={(event) => {
                    const next = event.target.value as ResumeLanguage
                    setResumeLanguage(next)
                    markUnsaved()
                    setHasGenerated(false)
                  }}
                  className="rounded-full border border-white/10 bg-slate-950/70 px-2 py-1 text-xs text-slate-100 focus:border-indigo-400 focus:outline-none"
                >
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="Japanese">Japanese</option>
                  <option value="Chinese">Chinese</option>
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-200">
                <span className="text-slate-300">Style</span>
                <select
                  value={resumeStyle}
                  onChange={(event) => {
                    const next = event.target.value as ResumeStyle
                    setResumeStyle(next)
                    markUnsaved()
                    setHasGenerated(false)
                  }}
                  className="rounded-full border border-white/10 bg-slate-950/70 px-2 py-1 text-xs text-slate-100 focus:border-indigo-400 focus:outline-none"
                >
                  {(
                    ['Classic', 'Modern', 'Minimal', 'Executive', 'Creative', 'TrueCircle', 'Wide'] as ResumeStyle[]
                  ).map((style) => (
                    <option key={style} value={style}>
                      {getResumeStylePreset(style).label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || isSaving || isDownloading}
                className="inline-flex items-center gap-2 rounded-full bg-indigo-500/80 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? (
                  <>
                    <LoadingSpinner label="Generating" />
                    Generating...
                  </>
                ) : isSaving ? (
                  <>
                    <LoadingSpinner label="Saving" />
                    Saving...
                  </>
                ) : isDownloading ? (
                  <>
                    <LoadingSpinner label="Downloading" />
                    Downloading...
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
                disabled={isSaving || isGenerating || isDownloading}
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
          <label className="mt-3 block text-xs font-medium text-slate-300">
            Job URL <span className="text-red-400">*</span>
            <input
              value={jobUrl}
              onChange={(event) => {
                setJobUrl(event.target.value)
                markUnsaved()
              }}
              placeholder="https://..."
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-[13px] text-slate-100 focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-300">
            Job description <span className="text-red-400">*</span>
            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value)
                markUnsaved()
              }}
              rows={6}
              placeholder="Paste the full job description here (minimum 100 characters)..."
              className="mt-2 w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none hide-scrollbar"
            />
          </label>
          {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">Job application questions</p>
                  <p className="mt-0.5 text-xs text-slate-400">Paste the questions you see on the application form.</p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAnswers}
                  disabled={isGeneratingAnswers}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500/80 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGeneratingAnswers ? (
                    <>
                      <LoadingSpinner label="Generating answers" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FiZap /> Generate answers
                    </>
                  )}
                </button>
              </div>
              <textarea
                value={jobQuestions}
                onChange={(event) => {
                  setJobQuestions(event.target.value)
                  setQaError(null)
                }}
                rows={10}
                placeholder={'Examples:\n- Why do you want this role?\n- Describe your experience with [X].\n- What is your notice period?'}
                className="mt-3 w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none hide-scrollbar"
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <div>
                <p className="text-sm font-semibold text-white">AI answers</p>
                <p className="mt-0.5 text-xs text-slate-400">Generated using your job description and current resume draft.</p>
              </div>
              <textarea
                value={jobAnswers}
                readOnly
                rows={10}
                placeholder="Click “Generate answers” to fill this box."
                className="mt-3 w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none hide-scrollbar"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!jobAnswers.trim()) return
                    try {
                      await navigator.clipboard.writeText(jobAnswers)
                      toast.success('Answers copied.')
                    } catch {
                      toast.error('Copy failed.')
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:border-indigo-400 hover:text-white"
                >
                  <FiFileText /> Copy answers
                </button>
                <button
                  type="button"
                  onClick={() => setJobAnswers('')}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200"
                >
                  <FiRefreshCw /> Clear
                </button>
              </div>
            </div>
          </div>

          {qaError && <p className="mt-3 text-xs text-rose-400">{qaError}</p>}

          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Batch generate (Excel/CSV)</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Upload a <span className="text-slate-200">.xlsx</span> or <span className="text-slate-200">.csv</span> with
                  columns: <span className="text-slate-200">Job Title</span>, <span className="text-slate-200">Company Name</span>,{' '}
                  <span className="text-slate-200">Application Link</span>, <span className="text-slate-200">Job Description</span>.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null
                      void handleJobListFileSelected(file)
                      // allow selecting same file again
                      e.currentTarget.value = ''
                    }}
                  />
                  <FiFileText /> Upload job list
                </label>
                <button
                  type="button"
                  onClick={handleBatchGenerateAndDownload}
                  disabled={isBatchGenerating || jobListItems.length === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-indigo-500/80 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBatchGenerating ? (
                    <>
                      <LoadingSpinner label="Batch generating" />
                      Running…
                    </>
                  ) : (
                    <>
                      <FiZap /> Generate all & download
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleBatchStop}
                  disabled={!isBatchGenerating}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-rose-400 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiRefreshCw /> Stop
                </button>
                <button
                  type="button"
                  onClick={exportJobListResultsXlsx}
                  disabled={jobListItems.length === 0}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-indigo-200 transition hover:border-indigo-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiDownload /> Export results (.xlsx)
                </button>
              </div>
            </div>

            {jobListError && <p className="mt-3 text-xs text-rose-400">{jobListError}</p>}

            {(jobListItems.length > 0 || isBatchGenerating) && (
              <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-200">
                    Jobs loaded: <span className="text-white">{jobListItems.length}</span>
                  </p>
                  {isBatchGenerating && batchIndex !== null && (
                    <p className="text-xs text-slate-300">
                      Processing <span className="text-white">{batchIndex + 1}</span> / {jobListItems.length}
                    </p>
                  )}
                </div>
                <div className="mt-2 max-h-48 overflow-auto pr-1 text-xs hide-scrollbar">
                  <div className="space-y-1">
                    {jobListItems.map((it, idx) => (
                      <div
                        key={it.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-slate-950/30 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-slate-100">
                            <span className="text-slate-400">{idx + 1}.</span> {it.jobTitle || 'Role'}
                            {it.companyName ? <span className="text-slate-400"> · {it.companyName}</span> : null}
                          </p>
                          {it.message && <p className="mt-0.5 truncate text-rose-300">{it.message}</p>}
                          {it.folderName && <p className="mt-0.5 truncate text-emerald-300">Saved: {it.folderName}</p>}
                        </div>
                        <span
                          className={[
                            'rounded-full border px-2 py-1 text-[11px] font-semibold',
                            it.status === 'done'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                              : it.status === 'failed'
                                ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                : it.status === 'running'
                                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
                                  : 'border-white/10 bg-white/5 text-slate-200',
                          ].join(' ')}
                        >
                          {it.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

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
          <p className="mt-1 text-xs text-slate-400">
            Add skills and remove them anytime. Generated skills are grouped into categories, and the resume renders
            one line per category.
          </p>
          {draft.skillCategories && draft.skillCategories.length > 0 ? (
            <div className="mt-3 space-y-3">
              {draft.skillCategories.map((entry) => (
                <div key={entry.category}>
                  <p className="text-xs font-semibold text-indigo-200">{entry.category}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {entry.skills.map((skill) => (
                      <div
                        key={`${entry.category}-${skill}`}
                        className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-100"
                      >
                        <span className="font-semibold">{skill}</span>
                        <button
                          type="button"
                          onClick={() => updateDraft((prev) => removeSkillFromDraft(prev, skill))}
                          className="text-slate-400 transition hover:text-rose-300"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
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
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={skillInput}
              onChange={(event) => setSkillInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAddSkill()
                }
              }}
              placeholder="Add a skill"
              className="min-w-[200px] flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none"
            />
            {draft.skillCategories && draft.skillCategories.length > 0 && (
              <select
                value={resolvedSkillCategory}
                onChange={(event) => setSkillCategoryInput(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-100 focus:border-indigo-400 focus:outline-none"
              >
                {draft.skillCategories.map((entry) => (
                  <option key={entry.category} value={entry.category}>
                    {entry.category}
                  </option>
                ))}
                {!draft.skillCategories.some((entry) => entry.category === OTHER_SKILL_CATEGORY) && (
                  <option value={OTHER_SKILL_CATEGORY}>{OTHER_SKILL_CATEGORY}</option>
                )}
              </select>
            )}
            <button
              type="button"
              onClick={handleAddSkill}
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
                      {item.resume_title || 'Role'} · {item.company || 'Company'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {monthToLabel(item.start, resumeLanguage)} - {item.end === 'Present' ? presentLabel(resumeLanguage) : monthToLabel(item.end, resumeLanguage)}
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
                        placeholder="Add a real accomplishment, with numbers where you have them."
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
                  {[item.school, item.location].filter(Boolean).join(' · ')} · {monthToLabel(item.start, resumeLanguage)} - {item.end === 'Present' ? presentLabel(resumeLanguage) : monthToLabel(item.end, resumeLanguage)}
                </p>
              </div>
            ))}
            {draft.education.length === 0 && (
              <p className="text-xs text-slate-400">No education entries yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">Key Achievements</h2>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={includeKeyAchievements}
                onChange={(event) => setIncludeKeyAchievements(event.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-white/20 bg-slate-900/60 accent-indigo-500"
              />
              Include in resume
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            One achievement per line. These lines, your work-history bullets, and Projects are the only source of real
            numbers the generator can use.
          </p>
          {!includeKeyAchievements && (
            <p className="mt-2 text-xs text-amber-300/90">
              Excluded from the generated resume. Your lines are kept here and still feed real metrics into the work
              history bullets.
            </p>
          )}
          <textarea
            value={(draft.keyAchievements ?? []).join('\n')}
            onChange={(event) =>
              updateDraft((prev) => ({
                ...prev,
                keyAchievements: event.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            }
            rows={5}
            placeholder={"Examples:\n- Reduced p95 latency by 35% by optimizing caching and queries\n- Cut cloud spend by $8k/month via right-sizing and scheduling\n- Improved data quality with automated checks and alerts"}
            className="mt-3 w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none hide-scrollbar"
          />
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-soft backdrop-blur lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">Projects</h2>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={includeProjects}
                onChange={(event) => setIncludeProjects(event.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-white/20 bg-slate-900/60 accent-indigo-500"
              />
              Include in resume
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-400">One project bullet per line.</p>
          {!includeProjects && (
            <p className="mt-2 text-xs text-amber-300/90">
              Excluded from the generated resume. Your lines are kept here and still feed real metrics into the work
              history bullets.
            </p>
          )}
          <textarea
            value={(draft.projects ?? []).join('\n')}
            onChange={(event) =>
              updateDraft((prev) => ({
                ...prev,
                projects: event.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            }
            rows={5}
            placeholder={"Examples:\n- Built an end-to-end migration plan and executed a phased rollout with zero downtime\n- Implemented an internal tooling dashboard to reduce manual ops work\n- Created a reusable library to standardize validation and error handling"}
            className="mt-3 w-full resize-none overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none hide-scrollbar"
          />
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
          <p className="w-full text-xs text-slate-400">
            Generate already saves and downloads automatically. Use these only to retry a step manually.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isSaved || !hasGenerated || isGenerating || isDownloading}
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
            disabled={!isSaved || isSaving || isDownloading || isGenerating}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDownloading ? (
              <>
                <LoadingSpinner label="Downloading" />
                Downloading...
              </>
            ) : (
              <>
                <FiDownload /> Download
              </>
            )}
          </button>
          {/* cover letter download removed - unified into single Download button */}
        </section>
      </div>

      {resultDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/95 p-6 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40">
                  <FiCheckCircle className="text-lg" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Resume generated, saved & downloaded</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {resultDialog.jobTitle}
                    {resultDialog.companyName ? ` · ${resultDialog.companyName}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResultDialog(null)}
                className="text-slate-400 transition hover:text-white"
                aria-label="Close"
              >
                <FiX />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <FiFolder /> Saved to
              </p>
              <p className="mt-1 break-all text-sm text-slate-100">
                {resultDialog.rootFolderName
                  ? `${resultDialog.rootFolderName}/${resultDialog.folderName}`
                  : resultDialog.folderName}
              </p>
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-300">Files</p>
              <ul className="mt-2 space-y-1">
                {resultDialog.files.map((file) => (
                  <li
                    key={file}
                    className="flex items-center gap-2 rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2 text-xs text-slate-200"
                  >
                    <FiFileText className="text-slate-400" />
                    <span className="truncate">{file}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setResultDialog(null)}
                className="inline-flex items-center gap-2 rounded-full bg-indigo-500/80 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-indigo-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
