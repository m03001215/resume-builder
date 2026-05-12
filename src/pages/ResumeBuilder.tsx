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
  ShadingType,
  TabStopType,
  TextRun,
} from 'docx'
import jsPDF from 'jspdf'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabaseClient'

type ResumeLanguage = 'English' | 'Japanese' | 'Chinese'

type ResumeStyle = 'Classic' | 'Modern' | 'Minimal' | 'Executive' | 'Creative' | 'TrueCircle'

type ResumeStylePreset = {
  label: string
  description: string
  headerAlign: 'center' | 'left'
  fontFamily: string
  pdfFontFamily: 'times' | 'helvetica' | 'courier'
  accentHex: string // 6-char hex without '#'
  headingStyle: 'underline' | 'bar' | 'shaded' | 'boxed' | 'none'
  headingUppercase: boolean
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

const RESUME_STYLE_PRESETS: Record<ResumeStyle, ResumeStylePreset> = {
  Classic: {
    label: 'Classic',
    description: 'Centered header + clean underlined sections.',
    headerAlign: 'center',
    fontFamily: 'Times New Roman',
    pdfFontFamily: 'times',
    accentHex: '1f4e79',
    headingStyle: 'underline',
    headingUppercase: true,
    dividerStyle: 'thick',
    bulletChar: '•',
    pdf: { nameSize: 19, titleSize: 11.5, contactSize: 10, headingSize: 10.5, bodySize: 10.5 },
  },
  Modern: {
    label: 'Modern',
    description: 'Left-aligned header + clean underlined section lines.',
    headerAlign: 'left',
    fontFamily: 'Calibri',
    pdfFontFamily: 'helvetica',
    accentHex: '0f766e',
    headingStyle: 'underline',
    headingUppercase: true,
    dividerStyle: 'thin',
    bulletChar: '–',
    pdf: { nameSize: 20, titleSize: 11, contactSize: 9.5, headingSize: 10.5, bodySize: 10.5 },
  },
  Minimal: {
    label: 'Minimal',
    description: 'Whitespace-first + subtle underlined section lines.',
    headerAlign: 'left',
    fontFamily: 'Segoe UI',
    pdfFontFamily: 'courier',
    accentHex: '111111',
    headingStyle: 'underline',
    headingUppercase: true,
    dividerStyle: 'none',
    bulletChar: '•',
    pdf: { nameSize: 18, titleSize: 10.5, contactSize: 9.5, headingSize: 10, bodySize: 10.5 },
  },
  Executive: {
    label: 'Executive',
    description: 'ATS-friendly: left header + clean underlined headings.',
    headerAlign: 'left',
    fontFamily: 'Georgia',
    pdfFontFamily: 'times',
    accentHex: '7c3aed',
    headingStyle: 'underline',
    headingUppercase: true,
    dividerStyle: 'thin',
    bulletChar: '•',
    pdf: { nameSize: 21, titleSize: 11.5, contactSize: 9.5, headingSize: 10.5, bodySize: 10.5 },
  },
  Creative: {
    label: 'Creative',
    description: 'High-contrast accent + underlined section lines.',
    headerAlign: 'center',
    fontFamily: 'Trebuchet MS',
    pdfFontFamily: 'helvetica',
    accentHex: 'f97316',
    headingStyle: 'underline',
    headingUppercase: true,
    dividerStyle: 'thin',
    // jsPDF built-in fonts may not support glyphs like ◆; use a safe bullet.
    bulletChar: '•',
    pdf: { nameSize: 20, titleSize: 11.5, contactSize: 10, headingSize: 10.5, bodySize: 10.5 },
  },
  TrueCircle: {
    label: 'TrueCircle',
    description: 'ATS-friendly: crisp underlines + calm accent.',
    headerAlign: 'left',
    fontFamily: 'Cambria',
    pdfFontFamily: 'times',
    accentHex: '2563eb',
    headingStyle: 'underline',
    headingUppercase: true,
    dividerStyle: 'thin',
    bulletChar: '•',
    pdf: { nameSize: 20, titleSize: 11.5, contactSize: 9.5, headingSize: 10.5, bodySize: 10.5 },
  },
}

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

type ResumeDraft = {
  // Generated title aligned to target job role (from model output).
  targetTitle?: string
  summary: string
  skills: string[]
  // Optional display lines for grouped skills like "Frontend: React, Vue"
  skillDisplayLines?: string[]
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

const monthToLabel = (value?: string) => {
  if (!value) return ''
  const [year, month] = value.split('-')
  if (!year || !month) return value
  const date = new Date(Number(year), Number(month) - 1)
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

const workModeLabel = (value?: WorkHistoryItem['workMode'], language: ResumeLanguage = 'English') => {
  if (!value) return ''
  const translations: Record<ResumeLanguage, Record<NonNullable<WorkHistoryItem['workMode']>, string>> = {
    English: { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite' },
    Japanese: { remote: 'リモート', hybrid: 'ハイブリッド', onsite: 'オンサイト' },
    Chinese: { remote: '远程', hybrid: '混合', onsite: '现场' },
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
    skills: 'TECHNICAL SKILLS',
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
}) => {
  const { text, measure, maxWidth, language } = args
  const trimmed = text ?? ''
  if (!trimmed) return ['']

  // For CJK, wrap by character; for English, wrap by words/spaces.
  const parts =
    language === 'English'
      ? trimmed.split(/(\s+)/).filter((p) => p.length > 0)
      : Array.from(trimmed)

  const lines: string[] = []
  let current = ''
  for (const part of parts) {
    const next = current ? current + part : part
    if (measure(next) <= maxWidth || !current) {
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
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidthPt = pdf.internal.pageSize.getWidth()
  const pageHeightPt = pdf.internal.pageSize.getHeight()
  const marginPt = 54

  const scale = 2
  const pageWidthPx = Math.round(pageWidthPt * scale)
  const pageHeightPx = Math.round(pageHeightPt * scale)
  const marginPx = Math.round(marginPt * scale)

  const fontFamily = getCanvasFontStack(language, preset.fontFamily)

  const fullName = buildCandidateFullName(profile) || 'Candidate'
  const titleLine = jobTitle.trim()
  const locationLine = profile?.location?.trim() || ''
  const contactLine = [profile?.phone_number, profile?.email, profile?.linkedin_url, profile?.github_url]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' | ')

  const displaySkills = normalizeSkillsForDisplay(draft.skills)

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
  let y = marginPx

  const maxWidthPx = pageWidthPx - marginPx * 2

  const setFont = (sizePt: number, bold = false) => {
    const sizePx = Math.round(sizePt * scale)
    ctx.font = `${bold ? '700' : '400'} ${sizePx}px ${fontFamily}`
  }

  const ensureSpace = (neededPx: number) => {
    if (y + neededPx <= pageHeightPx - marginPx) return
    embedCanvasPage(canvas, isFirstPage)
    isFirstPage = false
    ;({ canvas, ctx } = newPageCanvas())
    y = marginPx
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
          : marginPx
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
    ctx.moveTo(marginPx, y)
    ctx.lineTo(pageWidthPx - marginPx, y)
    ctx.stroke()
    y += Math.round(18 * scale)
  }

  const drawSectionHeading = (label: string) => {
    const text = preset.headingUppercase ? label.toUpperCase() : label
    y += Math.round(10 * scale)
    ensureSpace(Math.round(18 * scale))
    setFont(preset.pdf.headingSize, true)

    if (preset.headingStyle === 'shaded') {
      const h = Math.round(18 * scale)
      ensureSpace(h)
      ctx.fillStyle = 'rgb(238,238,238)'
      ctx.fillRect(marginPx, y - Math.round(13 * scale), pageWidthPx - marginPx * 2, h)
      ctx.fillStyle = rgbStr('111111')
      ctx.fillText(text, marginPx + Math.round(8 * scale), y)
      y += Math.round(16 * scale)
      return
    }

    if (preset.headingStyle === 'boxed') {
      const paddingX = Math.round(8 * scale)
      const paddingY = Math.round(5 * scale)
      const w = ctx.measureText(text).width
      const boxW = Math.min(pageWidthPx - marginPx * 2, w + paddingX * 2)
      const boxH = Math.round(18 * scale)
      ensureSpace(boxH)
      ctx.fillStyle = rgbStr(preset.accentHex)
      ctx.fillRect(marginPx, y - Math.round(13 * scale) - paddingY, boxW, boxH + paddingY)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(text, marginPx + paddingX, y)
      y += Math.round(18 * scale)
      return
    }

    if (preset.headingStyle === 'bar') {
      const barW = Math.round(4 * scale)
      const barH = Math.round(16 * scale)
      ctx.fillStyle = rgbStr(preset.accentHex)
      ctx.fillRect(marginPx, y - Math.round(12 * scale), barW, barH)
      ctx.fillStyle = rgbStr('111111')
      ctx.fillText(text, marginPx + Math.round(10 * scale), y)
      y += Math.round(18 * scale)
      return
    }

    // underline / none
    ctx.fillStyle = rgbStr('111111')
    ctx.fillText(text, marginPx, y)
    if (preset.headingStyle === 'underline') {
      y += Math.round(6 * scale)
      ctx.strokeStyle = rgbStr(preset.accentHex)
      ctx.lineWidth = Math.round(1.5 * scale)
      ctx.beginPath()
      ctx.moveTo(marginPx, y)
      ctx.lineTo(pageWidthPx - marginPx, y)
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
      ctx.fillText(line, marginPx, y)
      y += lineHeightPx
    }
    y += Math.round(afterPt * scale)
  }

  const drawBullet = (text: string) => {
    const lineHeightPx = Math.round(16 * scale)
    setFont(10, false)
    ctx.fillStyle = '#111111'
    ensureSpace(lineHeightPx)
    ctx.fillText(preset.bulletChar, marginPx, y)
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
      ctx.fillText(line, marginPx + indentPx, y)
      y += lineHeightPx
      first = false
    }
    y += Math.round(20 * scale)
  }

  const drawRightAligned = (text: string, sizePt: number, colorHex: string) => {
    setFont(sizePt, false)
    ctx.fillStyle = rgbStr(colorHex)
    const w = ctx.measureText(text).width
    const x = pageWidthPx - marginPx - w
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
  const skillsText = displaySkills.map((s) => s.trim()).filter(Boolean).join(' • ')
  if (skillsText) drawParagraph(skillsText, 10.5, '111111', 16, 20)

  drawSectionHeading(SECTION_LABELS[language].experience)
  for (const item of draft.workHistory) {
    const dates = `${monthToLabel(item.start)} - ${item.end === 'Present' ? 'Present' : monthToLabel(item.end)}`
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
    ctx.fillText(leftLines[0] ?? '', marginPx, y)
    drawRightAligned(dates, 9.5, '555555')
    y += Math.round(16 * scale)
    for (const extra of leftLines.slice(1)) {
      ensureSpace(Math.round(16 * scale))
      ctx.fillText(extra, marginPx, y)
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
    ctx.fillText(companyLines[0] ?? '', marginPx, y)
    drawRightAligned(locMode, 9.5, '555555')
    y += Math.round(16 * scale)
    for (const extra of companyLines.slice(1)) {
      ensureSpace(Math.round(16 * scale))
      ctx.fillText(extra, marginPx, y)
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
      `${monthToLabel(edu.start)} - ${edu.end === 'Present' ? 'Present' : monthToLabel(edu.end)}`,
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
  if (language !== 'English') {
    return buildResumePdfBlobRasterized({ profile, draft, jobTitle, language, style })
  }

  const fullName = buildCandidateFullName(profile) || 'Candidate'
  const titleLine = jobTitle.trim()
  const locationLine = profile?.location?.trim() || ''
  const contactLine = [profile?.phone_number, profile?.email, profile?.linkedin_url, profile?.github_url]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' | ')

  // Uses jsPDF built-in PDF fonts. We pick font per resume style.
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 54 // 1080 twips = 0.75in
  const maxWidth = pageWidth - margin * 2

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
    if (y + needed <= pageHeight - margin) return y
    pdf.addPage()
    return margin
  }

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Keyword highlighting logic matches DOCX generator.
  // Skills are a flat list (no categories).
  const displaySkills = normalizeSkillsForDisplay(draft.skills)
  const flatKeywords = Array.from(new Set(displaySkills))

  const extraTokens = flatKeywords
    .map((k) => k.split(/[\s,/\-()]+/).map((t) => t.trim()).filter(Boolean))
    .flat()
  const keywordSet = new Set<string>([
    ...flatKeywords.map((k) => k.trim()).filter(Boolean),
    ...extraTokens.map((k) => k.trim()).filter(Boolean),
  ])
  const keywordList = Array.from(keywordSet).filter(Boolean).sort((a, b) => b.length - a.length)
  const keywordLower = new Set(keywordList.map((k) => k.toLowerCase()))

  type Token = { text: string; bold: boolean }

  const pdfFontFamily = preset.pdfFontFamily

  const buildHighlightedTokens = (text: string): Token[] => {
    if (!text) return [{ text, bold: false }]
    if (keywordList.length === 0) return [{ text, bold: false }]
    const pattern = new RegExp(`\\b(${keywordList.map(escapeRegExp).join('|')})\\b`, 'gi')
    return text
      .split(pattern)
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => ({ text: chunk, bold: keywordLower.has(chunk.toLowerCase()) }))
  }

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
        pdf.text(line, margin, y)
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
    pdf.line(margin, y, pageWidth - margin, y)
    pdf.setLineWidth(1)
    return y + 18
  }

  const drawSectionHeading = (label: string, y: number) => {
    y = ensureSpace(y + 10, 18) // before: 10pt
    pdf.setFont(pdfFontFamily, 'bold')
    pdf.setFontSize(preset.pdf.headingSize)
    const text = preset.headingUppercase ? label.toUpperCase() : label

    if (preset.headingStyle === 'shaded') {
      const fill = { r: 238, g: 238, b: 238 }
      pdf.setFillColor(fill.r, fill.g, fill.b)
      pdf.rect(margin, y - 12, maxWidth, 18, 'F')
      setTextColorHex('111111')
      pdf.text(text, margin + 8, y)
      return y + 22
    }

    if (preset.headingStyle === 'boxed') {
      const { r, g, b } = hexToRgb(preset.accentHex)
      pdf.setFillColor(r, g, b)
      // keep it as a compact box starting at margin
      const w = Math.min(maxWidth, pdf.getTextWidth(text) + 16)
      pdf.rect(margin, y - 12, w, 18, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.text(text, margin + 8, y)
      setTextColorHex('111111')
      return y + 22
    }

    if (preset.headingStyle === 'bar') {
      const { r, g, b } = hexToRgb(preset.accentHex)
      pdf.setFillColor(r, g, b)
      pdf.rect(margin, y - 12, 4, 16, 'F')
      setTextColorHex('111111')
      pdf.text(text, margin + 10, y)
      return y + 22
    }

    // underline / none
    setTextColorHex('111111')
    pdf.text(text, margin, y)
    if (preset.headingStyle === 'underline') {
      y += 6
      const { r, g, b } = hexToRgb(preset.accentHex)
      pdf.setDrawColor(r, g, b)
      pdf.setLineWidth(1.5)
      pdf.line(margin, y, pageWidth - margin, y)
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
    pdf.text(leftLines[0] || '', margin, y)

    if (opts.right) {
      pdf.setFont(pdfFontFamily, 'normal')
      pdf.setFontSize(opts.rightSize)
      setTextColorHex('555555')
      pdf.text(opts.right, pageWidth - margin, y, { align: 'right' })
    }

    for (const line of leftLines.slice(1)) {
      y = ensureSpace(y + 14, 14)
      pdf.setFont(pdfFontFamily, opts.boldLeft ? 'bold' : 'normal')
      pdf.setFontSize(opts.leftSize)
      setTextColorHex(opts.leftColorHex)
      pdf.text(line, margin, y)
    }

    return y + 8
  }

  const drawBullet = (text: string, y: number) => {
    const lineHeight = PDF_SPACING.bulletLineHeight
    y = ensureSpace(y, lineHeight)
    pdf.setFont(pdfFontFamily, 'normal')
    pdf.setFontSize(10) // 20 half-points
    setTextColorHex('111111')
    pdf.text(preset.bulletChar, margin, y)
    y = drawWrappedTokens({
      tokens: buildHighlightedTokens(text),
      x: margin + 12,
      y,
      maxWidth: maxWidth - 12,
      fontSize: 10,
      lineHeight,
      colorHex: '111111',
    })
    return y + PDF_SPACING.bulletAfter
  }

  // --- Render (mirrors DOCX order/labels) ---
  let y = margin
  y = drawHeaderWrapped(fullName, y, preset.pdf.nameSize, true, '111111')
  y += 2
  if (titleLine) y = drawHeaderWrapped(titleLine, y, preset.pdf.titleSize, true, '333333')
  if (locationLine) y = drawHeaderWrapped(locationLine, y, preset.pdf.contactSize, false, '555555')
  if (contactLine) y = drawHeaderWrapped(contactLine, y, preset.pdf.contactSize, false, '555555')
  y = drawDivider(y)

  y = drawSectionHeading(SECTION_LABELS[language].summary, y)
  const summary = (draft.summary || '').trim()
  if (summary) {
    y = drawWrappedTokens({
      tokens: buildHighlightedTokens(summary),
      x: margin,
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
  const skillsText = displaySkills.map((s) => s.trim()).filter(Boolean).join(' • ')
  if (skillsText) {
    y = drawWrappedTokens({
      // Skills should be plain (no keyword bolding).
      tokens: [{ text: skillsText, bold: false }],
      x: margin,
      y,
      maxWidth,
      fontSize: 10,
      lineHeight: 14,
      colorHex: '111111',
    })
    y += 16
  } else {
    y += 10
  }

  y = drawSectionHeading(SECTION_LABELS[language].experience, y)
  for (const item of draft.workHistory) {
    const titleForResume = item.resume_title
    const dates = `${monthToLabel(item.start)} - ${item.end === 'Present' ? 'Present' : monthToLabel(item.end)}`
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
      `${monthToLabel(edu.start)} - ${edu.end === 'Present' ? 'Present' : monthToLabel(edu.end)}`,
    ]
      .filter(Boolean)
      .join(' | ')

    y = ensureSpace(y, 16)
    pdf.setFont(pdfFontFamily, 'bold')
    pdf.setFontSize(10.5)
    setTextColorHex('111111')
    for (const line of (pdf.splitTextToSize(degree || ' ', maxWidth) as string[])) {
      y = ensureSpace(y, PDF_SPACING.educationLineHeight)
      pdf.text(line, margin, y)
      y += PDF_SPACING.educationLineHeight
    }

    pdf.setFont(pdfFontFamily, 'normal')
    pdf.setFontSize(9.5)
    setTextColorHex('555555')
    for (const line of (pdf.splitTextToSize(meta || ' ', maxWidth) as string[])) {
      y = ensureSpace(y, PDF_SPACING.educationMetaLineHeight)
      pdf.text(line, margin, y)
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

  if (language !== 'English') {
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

  let y = margin
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text(`${fullName} — Cover Letter`, margin, y)
  y += 22

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)

  const body = (draft.coverLetter || '').trim()
  const paragraphs = body.length > 0 ? body.split(/\n{2,}/g) : []
  if (paragraphs.length === 0) {
    const wrapped = pdf.splitTextToSize('No cover letter text was generated.', maxWidth) as string[]
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
  const [companyName, setCompanyName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [resumeLanguage, setResumeLanguage] = useState<ResumeLanguage>(() => {
    try {
      const saved = localStorage.getItem('resume_generator_language')
      if (saved === 'English' || saved === 'Japanese' || saved === 'Chinese') return saved
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
        saved === 'TrueCircle'
      ) {
        return saved
      }
    } catch {
      // ignore
    }
    return 'Classic'
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skillInput, setSkillInput] = useState('')
  const [downloadHandle, setDownloadHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [downloadHandleName, setDownloadHandleName] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem('resume_generator_language', resumeLanguage)
    } catch {
      // ignore
    }
  }, [resumeLanguage])

  useEffect(() => {
    try {
      localStorage.setItem('resume_generator_style', resumeStyle)
    } catch {
      // ignore
    }
  }, [resumeStyle])

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
      resumeLanguage,
      careerStartYear,
      careerEndYear,
      summary: draft.summary,
      skills: draft.skills,
      workHistory: draft.workHistory.map((item) => ({
        id: item.id,
        company: item.company,
        // Keep the original stored title for reference only; resume output titles come from resumeTitle.
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
                'You are an expert resume writer. Output ONLY valid JSON (no markdown or code fences). Required top-level keys: summary, targetTitle, keyAchievements, projects, claimedSkills, workHistory (array of { id, bullets, resumeTitle }), education (array of { id }), coverLetter, notes. All bullets MUST be authored by you (the model). Do not add extra fields.',
            },
            {
              role: 'user',
              content: `Using the following candidate payload and job description, generate a human-written, technically credible JSON resume. Keep workHistory IDs intact: ${JSON.stringify(
                payload,
              )}

INSTRUCTIONS:
0. Output language: ${resumeLanguage}. Write ALL natural-language values (summary, targetTitle, category names, bullets, coverLetter, notes) in ${resumeLanguage}. Do not translate JSON keys.
   - Keep technology/product names (e.g., React, TypeScript, Kubernetes, REST, AWS) in their commonly-used forms; do not force-translate them.
0.1 Target role focus (role-agnostic): The resume must read like a "${jobTitle}" resume first.
   - Infer the role archetype from BOTH the job title and job description (e.g., data, ML, backend, frontend, mobile, DevOps/SRE, security, QA/SDET, product/PM).
   - Create a short internal "role focus plan" and apply it: what to emphasize, what to de-emphasize, and which skills/categories to foreground for THIS role.
   - Prioritize responsibilities, technologies, and achievements that are typical for "${jobTitle}" and are supported by the payload + job description.
   - Avoid cross-discipline filler: do NOT emphasize unrelated areas (e.g., React/UI for a backend role, or infrastructure deep-dives for a frontend role) unless the job description explicitly requires them.
   - Skills pruning is allowed: if the payload includes claimed skills that are not relevant to the target role/JD, omit them rather than diluting the resume focus.
0.2 Experience titles (required):
   - For EVERY workHistory entry, generate a "resumeTitle" that is tailored to the target job role/JD.
   - Do NOT reuse the original stored company-history title verbatim unless it already matches the target role; prefer role-aligned mapping (e.g., "Software Engineer" -> "Backend Engineer" for a backend JD).
   - Keep resumeTitle truthful (do not inflate seniority); but word it to align with the target role.
0.3 Completeness (required):
   - Your returned workHistory array MUST include an entry for EVERY id in payload.workHistory exactly once.
   - Every returned workHistory entry MUST include a non-empty resumeTitle string.
0.4 Key Achievements + Projects (required):
   - keyAchievements MUST be a non-empty array with 4–6 items.
   - projects MUST be an array with EXACTLY 3 items.
   - Each project must be extremely relevant to the job description.
   - Each project item must be ONE sentence and must include ALL of:
     a) a real user story (explicitly name the user persona and goal),
     b) the technologies used (2–5 concrete technologies/tools mentioned in the JD),
     c) the outcome/impact (include metrics if available; otherwise use "(est.)" for estimates).
   - Each item must be action/outcome oriented and aligned to the target role/JD.
   - Do NOT invent company names. If you reference systems, keep them generic (e.g., "data platform", "internal tooling", "customer-facing API").
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
22. Each role must contain 5-7 bullets and should include at least 2 real metrics results.
23. Each bullet must be one sentence only. No paragraphs.
24. Every experience bullet must follow this structure: Action Verb -> What was done -> Technologies used -> Outcome or impact.
25. The bullets should be outcome-driven and should include real metrics results as much as possible.
27. Skills must be a simple flat list (NOT categorized). Output claimedSkills as a plain array of strings.
28. Include 12–20 skills that are most relevant to the job description; omit irrelevant skills rather than diluting focus.
29. All job-description technologies must appear in both Skills and Experience sections.
30. Dates for experience and education must be formatted as: MMM YYYY - MMM YYYY.
31. Before final output, validate that all P1 and P2 keywords are included and used in logical contexts.
32. Provide a job match score between 95 and 99 based on how well the tailored resume aligns with the job requirements.

Additional rules (apply exactly):

- Return exactly one JSON object and nothing else. No markdown, no commentary, no code fences.

- Required top-level keys: summary (string), targetTitle (string), keyAchievements (string[]), projects (string[]), claimedSkills (string[]), workHistory (array of { id, bullets: string[], resumeTitle: string }), education (array of { id }), coverLetter (string), notes (string), jobMatchScore (number).

- Cover letter requirements: The 'coverLetter' field must begin with a brief greeting (e.g., "Hello Hiring Team," or "Dear Hiring Manager,") and end with a signature line that uses the candidate's name in the form "Kind regards, [Candidate Name]" or "Sincerely, [Candidate Name]" (use payload.candidateName for the name). Do not include company names in the greeting.

- Bullets (strict):
  - Every bullet must be generated by you, be a single sentence, and be at least 25 words long.
  - Each role must contain 5-7 bullets.
  - Bullets must be action-oriented, concrete, mention technologies when relevant, and align with the provided job description (payload.notes).
  - Follow the structure: Action Verb -> What was done -> Technologies used -> Outcome or impact.
  - Do NOT include company names or date ranges inside bullets.
  - Prefer measurable outcomes in MOST bullets, but never fabricate numbers; use placeholders when necessary and record them in 'notes'.
  - Bullets must be unique across the entire resume (no duplicates or near-duplicates).

- Skills:
  - Output claimedSkills as a flat array of strings (no categories).
  - Only include claimed skills supported by evidence in the payload (payload.skills, work history, education). Do NOT invent claimed skills.
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
            temperature: 0.2,
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
        draftParsed.workHistory = requestedIds.map((id) => byId.get(id) ?? { id, resumeTitle: sanitizeModelText(draftParsed?.targetTitle ?? jobTitle) })
        return draftParsed
      }

      const ensureProjectsAndAchievements = async (draftParsed: any) => {
        const existingAchievements = Array.isArray(draftParsed?.keyAchievements)
          ? draftParsed.keyAchievements.map((s: unknown) => sanitizeModelText(s)).filter(Boolean)
          : []
        const existingProjects = Array.isArray(draftParsed?.projects)
          ? draftParsed.projects.map((s: unknown) => sanitizeModelText(s)).filter(Boolean)
          : []

        const needsAchievements = existingAchievements.length === 0
        const needsProjects = existingProjects.length === 0
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
        }

        const repairResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            messages: [
              {
                role: 'system',
                content:
                  'Output ONLY valid JSON (no markdown). Return: { keyAchievements: string[], projects: string[] } and nothing else.',
              },
              {
                role: 'user',
                content: `Generate Key Achievements and Projects for this resume.\n\nRules:\n- keyAchievements: 4–6 items.\n- projects: EXACTLY 3 items.\n- Each project must be extremely relevant to the job description.\n- Each project item must be ONE sentence and must include ALL of:\n  a) a real user story (explicitly name the user persona and goal),\n  b) the technologies used (2–5 concrete technologies/tools mentioned in the JD),\n  c) the outcome/impact (include metrics if available; otherwise use \"(est.)\" for estimates).\n- Use measurable outcomes when reasonable; if you must estimate, mark as \"(est.)\".\n- Do not invent company names.\n\nPayload:\n${JSON.stringify(
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
          ? repaired.projects.map((s: unknown) => sanitizeModelText(s)).filter(Boolean)
          : []

        if (needsAchievements && nextAchievements.length > 0) draftParsed.keyAchievements = nextAchievements
        if (needsProjects && nextProjects.length > 0) draftParsed.projects = nextProjects
        return draftParsed
      }

      const parsedWithTitles = await ensureProjectsAndAchievements(await ensureResumeTitles(parsed))

      updateDraft((prev) => {
        // determine flattened claimed skills and optional display lines
        let flatSkills: string[] | undefined = undefined
        const skillDisplayLines: string[] | undefined = undefined

        if (parsedWithTitles.claimedSkillsByCategory && typeof parsedWithTitles.claimedSkillsByCategory === 'object') {
          // prefer categorized response
          const cat = parsedWithTitles.claimedSkillsByCategory as Record<string, string[]>
          flatSkills = Array.from(new Set((Object.values(cat) ?? []).flat().map((s) => (s ?? '').trim()).filter(Boolean)))
        } else if (Array.isArray(parsedWithTitles.claimedSkills)) {
          // fallback: model returned flat claimedSkills
          flatSkills = parsedWithTitles.claimedSkills.map((s: string) => (s ?? '').trim()).filter(Boolean)
        } else if (Array.isArray(parsedWithTitles.skills)) {
          // legacy fallback
          flatSkills = parsedWithTitles.skills.map((s: string) => (s ?? '').trim()).filter(Boolean)
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
          const next = parsedWithTitles.workHistory?.find((entry: { id: string }) => entry.id === item.id)
          const incoming = Array.isArray(next?.bullets) && next.bullets.length > 0 ? next.bullets : item.bullets
          const nextResumeTitle =
            typeof next?.resumeTitle === 'string' && next.resumeTitle.trim()
              ? sanitizeText(next.resumeTitle)
              : undefined
          const localSeen = new Set<string>()
          const deduped: string[] = []

          for (const raw of incoming.map((b: string) => (b ?? '').trim()).filter(Boolean)) {
            const b = sanitizeText(raw)
            const key = normalize(b)

            if (localSeen.has(key) || globalSeen.has(key)) {
              // attempt a light role-based variation if possible (do not invent companies)
              const roleForPrefix = item.resume_title
              if (roleForPrefix) {
                // only add role prefix if the bullet doesn't already appear role-prefixed
                if (!/^as a\s+/i.test(b)) {
                  const rolePrefix = `As a ${roleForPrefix}, `
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

          const finalBullets = normalizeCount(deduped.length > 0 ? deduped : item.bullets, item.resume_title)
          return {
            ...item,
            // Never fall back to saved company-history titles in the generated resume output.
            // If the model didn't provide a resumeTitle for this entry, use the generated targetTitle/jobTitle.
            resume_title:
              nextResumeTitle ??
              item.resume_title ??
              sanitizeText(parsed.targetTitle || '') ??
              '',
            bullets: finalBullets,
          }
        })

        return {
          ...prev,
          targetTitle: parsedWithTitles.targetTitle ? sanitizeText(parsedWithTitles.targetTitle) : prev.targetTitle,
          summary: parsedWithTitles.summary ? sanitizeText(parsedWithTitles.summary) : prev.summary,
            skills: Array.isArray(flatSkills) && flatSkills.length > 0 ? flatSkills : prev.skills,
            skillDisplayLines,
            coverLetter: parsedWithTitles.coverLetter ? sanitizeText(parsedWithTitles.coverLetter) : prev.coverLetter,
          keyAchievements: Array.isArray(parsedWithTitles.keyAchievements)
            ? parsedWithTitles.keyAchievements.map((s: string) => sanitizeText(s)).filter(Boolean)
            : prev.keyAchievements,
          projects: Array.isArray(parsedWithTitles.projects)
            ? parsedWithTitles.projects.map((s: string) => sanitizeText(s)).filter(Boolean)
            : prev.projects,
          workHistory,
        }
      })
      setHasGenerated(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate content.'
      setError(message)
      toast.error(message)
      updateDraft((prev) => buildMockResume(prev, profile, resumeLanguage, jobTitle))
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

    const hasPermission = await ensureDirectoryReadWritePermission(downloadHandle)
    if (!hasPermission) {
      toast.error('Please allow write access to the selected folder, or choose the folder again.')
      return
    }

    const fullName = buildCandidateFullName(profile)
    const titleLine = (draft.targetTitle || jobTitle || '').trim()
    const locationLine = profile?.location ?? ''
    const contactLine = [profile?.phone_number, profile?.email, profile?.linkedin_url, profile?.github_url]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(' | ')
    // Skills are a flat list (no categories).
    const displaySkills = normalizeSkillsForDisplay(draft.skills)
    const flatKeywords = Array.from(new Set(displaySkills))

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
    const preset = getResumeStylePreset(resumeStyle)
    const fontFamily = preset.fontFamily
    const headingText = (value: string) => (preset.headingUppercase ? value.toUpperCase() : value)
    const headerAlignment = preset.headerAlign === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT
    const headerNameColor = resumeStyle === 'Modern' || resumeStyle === 'Creative' || resumeStyle === 'TrueCircle' ? preset.accentHex : '111111'
    const headerTitleColor = resumeStyle === 'Modern' || resumeStyle === 'TrueCircle' ? preset.accentHex : '333333'
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
    > =
      {
        English: {
          summary: 'SUMMARY',
          skills: 'TECHNICAL SKILLS',
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
            new Paragraph({ text: '', spacing: { before: 16, after: 40 } }),
            sectionHeading(docxSectionLabels[resumeLanguage].summary),
            new Paragraph({
              children: buildHighlightedRuns(draft.summary, 21),
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 140 },
            }),
            sectionHeading(docxSectionLabels[resumeLanguage].skills),
            new Paragraph({
              // Skills should be plain (no keyword bolding).
              children: [new TextRun({ text: displaySkills.join(' • '), size: 20, color: '111111', font: fontFamily })],
              alignment: AlignmentType.LEFT,
              spacing: { after: 140 },
            }),
            new Paragraph({ text: '', spacing: { after: 80 } }),
            sectionHeading(docxSectionLabels[resumeLanguage].experience),
            ...draft.workHistory.flatMap((item) => [
              experienceLine(
                item.resume_title || 'Role',
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
            sectionHeading(docxSectionLabels[resumeLanguage].education),
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
            ...(draft.keyAchievements ?? []).map((value) => value.trim()).filter(Boolean).length > 0
              ? [
                  new Paragraph({ text: '', spacing: { after: 80 } }),
                  sectionHeading(docxSectionLabels[resumeLanguage].achievements),
                  ...(draft.keyAchievements ?? [])
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
            ...(draft.projects ?? []).map((value) => value.trim()).filter(Boolean).length > 0
              ? [
                  new Paragraph({ text: '', spacing: { after: 80 } }),
                  sectionHeading(docxSectionLabels[resumeLanguage].projects),
                  ...(draft.projects ?? [])
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
      draft,
      companyName: companyName || '',
      jobTitle: (draft.targetTitle || jobTitle || '').trim(),
      language: resumeLanguage,
      style: resumeStyle,
    })
    const fullNameSlug = sanitizeFilePart(buildCandidateFullName(profile), 'candidate')
    const roleSlug = sanitizeFilePart((draft.targetTitle || jobTitle || '').trim(), 'role')
    const companySlug = sanitizeFilePart(companyName || '', 'company')
    const folderName = `${fullNameSlug}_${roleSlug}_${companySlug}`
    const coverText = draft.coverLetter || ''
    const coverPdfBlob = buildCoverLetterPdfBlob({ profile, draft, language: resumeLanguage })

    const resumeBaseName = sanitizeFileName(
      `${buildCandidateFullName(profile) || 'Candidate'} - ${(draft.targetTitle || jobTitle || 'Role').trim()}`,
      'Resume',
    )
    const resumeDocxName = `${resumeBaseName}.docx`
    const resumePdfName = `${resumeBaseName}.pdf`

    const writeAllFilesToFolder = async (baseDir: FileSystemDirectoryHandle) => {
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
    }

    try {
      await writeAllFilesToFolder(downloadHandle)
      toast.success(`Saved resume (DOCX/PDF) and cover letter (TXT/PDF) to ${folderName}`)
      return
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
        if (!win || typeof win.showDirectoryPicker !== 'function') return

        const dir = await win.showDirectoryPicker()
        const hasPermission = await ensureDirectoryReadWritePermission(dir)
        if (!hasPermission) {
          toast.error('Folder permission denied. Please choose a folder again.')
          return
        }

        await saveHandleToIDB(dir)
        setDownloadHandle(dir)
        const name = (dir as unknown as { name?: string }).name ?? null
        setDownloadHandleName(name)

        await writeAllFilesToFolder(dir)
        toast.success(`Saved resume (DOCX/PDF) and cover letter (TXT/PDF) to ${folderName}`)
      } catch (retryErr) {
        console.error(retryErr)
        toast.error('Unable to write to the selected folder. Please choose the folder again.')
      }
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
                    ['Classic', 'Modern', 'Minimal', 'Executive', 'Creative', 'TrueCircle'] as ResumeStyle[]
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
                      {item.resume_title || 'Role'} · {item.company || 'Company'}
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
          <h2 className="text-base font-semibold text-white">Key Achievements</h2>
          <p className="mt-1 text-xs text-slate-400">One achievement per line.</p>
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
          <h2 className="text-base font-semibold text-white">Projects</h2>
          <p className="mt-1 text-xs text-slate-400">One project bullet per line.</p>
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
