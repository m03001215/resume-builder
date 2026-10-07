// Technology timeline guard.
//
// The resume generator is told to inject job-description technologies into existing roles, and
// on its own it ignores dates: a 2011 role ends up "migrating services to Kubernetes". The prompt
// forbids that, and this module backs the prompt up with a deterministic check.
//
// `year` is the first public release (not mainstream adoption), so a flag means the claim is
// impossible, not merely early. Patterns that collide with ordinary English words ("react to",
// "at the helm", "swift delivery") are case-sensitive or anchored to a product prefix.

export type TechGroup = 'frontend' | 'tooling' | 'testing' | 'backend' | 'infra' | 'cloud' | 'data' | 'ai'

export type TechEra = { group: TechGroup; name: string; year: number; pattern: RegExp }

export const TECH_ERAS: TechEra[] = [
  // Frontend
  { group: 'frontend', name: 'React', year: 2013, pattern: /\bReact(?:\.js|JS)?\b(?!\s+Native)/ },
  { group: 'frontend', name: 'React Native', year: 2015, pattern: /\bReact Native\b/i },
  { group: 'frontend', name: 'Vue', year: 2014, pattern: /\bVue(?:\.js|JS)?\b/ },
  { group: 'frontend', name: 'Angular', year: 2016, pattern: /\bAngular\b(?!\s*JS|\.js)/ },
  { group: 'frontend', name: 'AngularJS', year: 2010, pattern: /\bAngular(?:JS|\.js)\b/i },
  { group: 'frontend', name: 'Svelte', year: 2016, pattern: /\bSvelte(?:Kit)?\b/i },
  { group: 'frontend', name: 'SolidJS', year: 2018, pattern: /\bSolid(?:JS|\.js)\b/i },
  { group: 'frontend', name: 'Next.js', year: 2016, pattern: /\bNext\.?js\b/i },
  { group: 'frontend', name: 'Nuxt', year: 2016, pattern: /\bNuxt(?:\.js)?\b/i },
  { group: 'frontend', name: 'Gatsby', year: 2015, pattern: /\bGatsby(?:\.js|JS)?\b/ },
  { group: 'frontend', name: 'Remix', year: 2021, pattern: /\bRemix\b/ },
  { group: 'frontend', name: 'Astro', year: 2021, pattern: /\bAstro\b/ },
  { group: 'frontend', name: 'Redux', year: 2015, pattern: /\bRedux\b/i },
  { group: 'frontend', name: 'Zustand', year: 2019, pattern: /\bZustand\b/i },
  { group: 'frontend', name: 'Recoil', year: 2020, pattern: /\bRecoil\b/ },
  { group: 'frontend', name: 'React Query', year: 2019, pattern: /\bReact Query\b/i },
  { group: 'frontend', name: 'TanStack', year: 2022, pattern: /\bTanStack\b/i },
  { group: 'frontend', name: 'Tailwind CSS', year: 2017, pattern: /\bTailwind\b/i },
  { group: 'frontend', name: 'Bootstrap', year: 2011, pattern: /\bBootstrap\b/ },
  { group: 'frontend', name: 'Storybook', year: 2016, pattern: /\bStorybook\b/i },
  { group: 'frontend', name: 'TypeScript', year: 2012, pattern: /\bTypeScript\b/i },
  { group: 'frontend', name: 'WebAssembly', year: 2017, pattern: /\b(?:WebAssembly|Wasm)\b/i },
  // Build and tooling
  { group: 'tooling', name: 'Webpack', year: 2012, pattern: /\bWebpack\b/i },
  { group: 'tooling', name: 'Vite', year: 2020, pattern: /\bVite\b/i },
  { group: 'tooling', name: 'Babel', year: 2014, pattern: /\bBabel\b/ },
  { group: 'tooling', name: 'ESLint', year: 2013, pattern: /\bESLint\b/i },
  { group: 'tooling', name: 'Prettier', year: 2017, pattern: /\bPrettier\b/ },
  { group: 'tooling', name: 'Yarn', year: 2016, pattern: /\bYarn\b/ },
  { group: 'tooling', name: 'pnpm', year: 2017, pattern: /\bpnpm\b/i },
  { group: 'tooling', name: 'Turborepo', year: 2021, pattern: /\bTurborepo\b/i },
  // Testing
  { group: 'testing', name: 'Jest', year: 2014, pattern: /\bJest\b/ },
  { group: 'testing', name: 'Cypress', year: 2015, pattern: /\bCypress\b/ },
  { group: 'testing', name: 'Playwright', year: 2020, pattern: /\bPlaywright\b/i },
  { group: 'testing', name: 'Vitest', year: 2021, pattern: /\bVitest\b/i },
  // Backend, languages, runtimes
  { group: 'backend', name: 'Node.js', year: 2009, pattern: /\bNode\.?js\b/i },
  { group: 'backend', name: 'Deno', year: 2018, pattern: /\bDeno\b/i },
  { group: 'backend', name: 'Bun', year: 2022, pattern: /\bBun\b/ },
  { group: 'backend', name: 'Golang', year: 2009, pattern: /\bGolang\b/i },
  { group: 'backend', name: 'Rust', year: 2015, pattern: /\bRust\b/ },
  { group: 'backend', name: 'Kotlin', year: 2016, pattern: /\bKotlin\b/i },
  { group: 'backend', name: 'Swift', year: 2014, pattern: /\bSwift\b(?!UI)/ },
  { group: 'backend', name: 'SwiftUI', year: 2019, pattern: /\bSwiftUI\b/i },
  { group: 'backend', name: 'Jetpack Compose', year: 2021, pattern: /\bJetpack Compose\b/i },
  { group: 'backend', name: 'Flutter', year: 2017, pattern: /\bFlutter\b/i },
  { group: 'backend', name: 'Dart', year: 2011, pattern: /\bDart\b/ },
  { group: 'backend', name: 'Electron', year: 2013, pattern: /\bElectron\b/ },
  { group: 'backend', name: 'Spring Boot', year: 2014, pattern: /\bSpring Boot\b/i },
  { group: 'backend', name: '.NET Core', year: 2016, pattern: /\.NET Core\b/i },
  { group: 'backend', name: 'Blazor', year: 2018, pattern: /\bBlazor\b/i },
  { group: 'backend', name: 'FastAPI', year: 2018, pattern: /\bFastAPI\b/i },
  { group: 'backend', name: 'GraphQL', year: 2015, pattern: /\bGraphQL\b/i },
  { group: 'backend', name: 'Apollo GraphQL', year: 2016, pattern: /\bApollo (?:GraphQL|Client|Server|Federation)\b/i },
  { group: 'backend', name: 'gRPC', year: 2015, pattern: /\bgRPC\b/i },
  { group: 'backend', name: 'tRPC', year: 2020, pattern: /\btRPC\b/i },
  { group: 'backend', name: 'Prisma', year: 2018, pattern: /\bPrisma\b/i },
  { group: 'backend', name: 'OpenAPI', year: 2016, pattern: /\bOpenAPI\b/i },
  { group: 'backend', name: 'HTTP/2', year: 2015, pattern: /\bHTTP\/2\b/i },
  { group: 'backend', name: 'OAuth 2.0', year: 2012, pattern: /\bOAuth\s*2(?:\.0)?\b/i },
  { group: 'backend', name: 'JWT', year: 2012, pattern: /\bJWTs?\b/ },
  // Containers, infrastructure, CI/CD, observability
  { group: 'infra', name: 'Docker', year: 2013, pattern: /\bDocker\b/i },
  { group: 'infra', name: 'Kubernetes', year: 2014, pattern: /\b(?:Kubernetes|K8s)\b/i },
  { group: 'infra', name: 'Helm', year: 2016, pattern: /\bHelm\b/ },
  { group: 'infra', name: 'Istio', year: 2017, pattern: /\bIstio\b/i },
  { group: 'infra', name: 'Envoy', year: 2016, pattern: /\bEnvoy\b/ },
  { group: 'infra', name: 'Terraform', year: 2014, pattern: /\bTerraform\b/i },
  { group: 'infra', name: 'Pulumi', year: 2018, pattern: /\bPulumi\b/i },
  { group: 'infra', name: 'Ansible', year: 2012, pattern: /\bAnsible\b/i },
  { group: 'infra', name: 'Argo CD', year: 2018, pattern: /\bArgo\s?CD\b/i },
  { group: 'infra', name: 'Jenkins', year: 2011, pattern: /\bJenkins\b/ },
  { group: 'infra', name: 'CircleCI', year: 2011, pattern: /\bCircleCI\b/i },
  { group: 'infra', name: 'Travis CI', year: 2011, pattern: /\bTravis(?:\s?CI)?\b/ },
  { group: 'infra', name: 'GitLab', year: 2011, pattern: /\bGitLab\b/i },
  { group: 'infra', name: 'GitHub Actions', year: 2019, pattern: /\bGitHub Actions\b/i },
  { group: 'infra', name: 'Prometheus', year: 2012, pattern: /\bPrometheus\b/ },
  { group: 'infra', name: 'Grafana', year: 2014, pattern: /\bGrafana\b/i },
  { group: 'infra', name: 'Datadog', year: 2010, pattern: /\bDatadog\b/i },
  { group: 'infra', name: 'OpenTelemetry', year: 2019, pattern: /\bOpenTelemetry\b/i },
  { group: 'infra', name: 'Slack', year: 2013, pattern: /\bSlack\b/ },
  // Cloud services
  { group: 'cloud', name: 'AWS Lambda', year: 2014, pattern: /\b(?:AWS|Amazon) Lambda\b/i },
  { group: 'cloud', name: 'Amazon ECS', year: 2014, pattern: /\bECS\b/ },
  { group: 'cloud', name: 'Amazon EKS', year: 2018, pattern: /\bEKS\b/ },
  { group: 'cloud', name: 'AWS Fargate', year: 2017, pattern: /\bFargate\b/i },
  { group: 'cloud', name: 'AWS CDK', year: 2019, pattern: /\b(?:AWS )?CDK\b/ },
  { group: 'cloud', name: 'AWS Step Functions', year: 2016, pattern: /\bStep Functions\b/i },
  { group: 'cloud', name: 'AWS AppSync', year: 2017, pattern: /\bAppSync\b/i },
  { group: 'cloud', name: 'AWS Amplify', year: 2017, pattern: /\bAmplify\b/ },
  { group: 'cloud', name: 'Amazon Kinesis', year: 2013, pattern: /\bKinesis\b/i },
  { group: 'cloud', name: 'DynamoDB', year: 2012, pattern: /\bDynamoDB\b/i },
  { group: 'cloud', name: 'Amazon SageMaker', year: 2017, pattern: /\bSageMaker\b/i },
  { group: 'cloud', name: 'Amazon Bedrock', year: 2023, pattern: /\b(?:Amazon|AWS) Bedrock\b/i },
  { group: 'cloud', name: 'Google Cloud Run', year: 2019, pattern: /\bCloud Run\b/i },
  { group: 'cloud', name: 'Vertex AI', year: 2021, pattern: /\bVertex AI\b/i },
  { group: 'cloud', name: 'Azure Functions', year: 2016, pattern: /\bAzure Functions\b/i },
  { group: 'cloud', name: 'Cloudflare Workers', year: 2017, pattern: /\bCloudflare Workers\b/i },
  { group: 'cloud', name: 'Firestore', year: 2017, pattern: /\bFirestore\b/i },
  { group: 'cloud', name: 'Supabase', year: 2020, pattern: /\bSupabase\b/i },
  { group: 'cloud', name: 'Vercel', year: 2020, pattern: /\bVercel\b/i },
  { group: 'cloud', name: 'Netlify', year: 2014, pattern: /\bNetlify\b/i },
  // Data
  { group: 'data', name: 'Apache Spark', year: 2010, pattern: /\b(?:PySpark|Spark)\b/ },
  { group: 'data', name: 'Apache Flink', year: 2014, pattern: /\bFlink\b/i },
  { group: 'data', name: 'Apache Airflow', year: 2015, pattern: /\bAirflow\b/ },
  { group: 'data', name: 'dbt', year: 2016, pattern: /\bdbt\b/i },
  { group: 'data', name: 'Snowflake', year: 2014, pattern: /\bSnowflake\b(?!\s+schema)/i },
  { group: 'data', name: 'Databricks', year: 2013, pattern: /\bDatabricks\b/i },
  { group: 'data', name: 'BigQuery', year: 2011, pattern: /\bBigQuery\b/i },
  { group: 'data', name: 'Amazon Redshift', year: 2013, pattern: /\bRedshift\b/i },
  { group: 'data', name: 'Delta Lake', year: 2019, pattern: /\bDelta Lake\b/i },
  { group: 'data', name: 'Apache Iceberg', year: 2017, pattern: /\bApache Iceberg\b/i },
  { group: 'data', name: 'Trino', year: 2020, pattern: /\bTrino\b/i },
  { group: 'data', name: 'Presto', year: 2013, pattern: /\bPresto(?:DB)?\b/ },
  { group: 'data', name: 'ClickHouse', year: 2016, pattern: /\bClickHouse\b/i },
  { group: 'data', name: 'Apache Pulsar', year: 2016, pattern: /\bPulsar\b/ },
  { group: 'data', name: 'Apache Kafka', year: 2011, pattern: /\bKafka\b/i },
  // Machine learning and AI
  { group: 'ai', name: 'TensorFlow', year: 2015, pattern: /\bTensorFlow\b/i },
  { group: 'ai', name: 'PyTorch', year: 2016, pattern: /\bPyTorch\b/i },
  { group: 'ai', name: 'Keras', year: 2015, pattern: /\bKeras\b/i },
  { group: 'ai', name: 'JAX', year: 2018, pattern: /\bJAX\b/ },
  { group: 'ai', name: 'MLflow', year: 2018, pattern: /\bMLflow\b/i },
  { group: 'ai', name: 'Kubeflow', year: 2018, pattern: /\bKubeflow\b/i },
  { group: 'ai', name: 'Hugging Face', year: 2018, pattern: /\bHugging\s?Face\b/i },
  { group: 'ai', name: 'LLMs', year: 2020, pattern: /\b(?:LLMs?|large language models?)\b/i },
  { group: 'ai', name: 'OpenAI API', year: 2020, pattern: /\bOpenAI\b/i },
  { group: 'ai', name: 'GPT-3', year: 2020, pattern: /\bGPT-?3(?:\.5)?\b/i },
  { group: 'ai', name: 'GPT-4', year: 2023, pattern: /\bGPT-?4o?\b/i },
  { group: 'ai', name: 'ChatGPT', year: 2022, pattern: /\bChatGPT\b/i },
  { group: 'ai', name: 'GitHub Copilot', year: 2021, pattern: /\bCopilot\b/ },
  { group: 'ai', name: 'Generative AI', year: 2020, pattern: /\b(?:generative AI|GenAI)\b/i },
  { group: 'ai', name: 'Prompt engineering', year: 2020, pattern: /\bprompt engineering\b/i },
  { group: 'ai', name: 'RAG', year: 2020, pattern: /\bRAG\b|\bretrieval[- ]augmented generation\b/i },
  { group: 'ai', name: 'LangChain', year: 2022, pattern: /\bLangChain\b/i },
  { group: 'ai', name: 'LlamaIndex', year: 2022, pattern: /\bLlamaIndex\b/i },
  { group: 'ai', name: 'Pinecone', year: 2019, pattern: /\bPinecone\b/ },
  { group: 'ai', name: 'pgvector', year: 2021, pattern: /\bpgvector\b/i },
  { group: 'ai', name: 'Weaviate', year: 2019, pattern: /\bWeaviate\b/i },
  { group: 'ai', name: 'Stable Diffusion', year: 2022, pattern: /\bStable Diffusion\b/i },
]

const yearIn = (value?: string | null) => {
  const match = (value ?? '').match(/\b(?:19|20)\d{2}\b/)
  return match ? Number(match[0]) : undefined
}

// Last calendar year a role covers; a current role covers this year. Undefined skips the check
// rather than guessing, so a role with unreadable dates is never wrongly flagged.
export const roleEndYear = (end?: string | null) => {
  const value = (end ?? '').trim()
  if (!value) return undefined
  if (/^present$/i.test(value)) return new Date().getFullYear()
  return yearIn(value)
}

const techNamesIn = (lines: string[]) =>
  new Set(TECH_ERAS.filter((tech) => lines.some((line) => tech.pattern.test(line))).map((tech) => tech.name))

// Technologies a bullet names that were not yet released when the role ended. Anything the
// candidate wrote into that role themselves is exempt: their own record outranks this table.
export const findAnachronisms = (bullet: string, endYear: number, exempt: Set<string> = new Set()) =>
  TECH_ERAS.filter((tech) => tech.year > endYear && !exempt.has(tech.name) && tech.pattern.test(bullet))

export type TimelineRole = { id: string; start?: string; end?: string; existingBullets?: string[] }

type TimelineFix = { id: string; index: number; bullet: string }

// Finds bullets naming a technology that postdates their role, asks the model to rewrite just
// those bullets with period-appropriate tooling, re-checks the rewrites, and drops any bullet
// that is still impossible. A role left empty falls back to the candidate's own bullets when
// the draft is applied, so this can remove claims but never blank a role.
//
// `requestFixes` performs the model call and returns the parsed { fixes } list (or null on any
// failure); keeping the transport outside lets both generation paths share this logic.
export const enforceTechTimeline = async <T extends { workHistory?: unknown }>(args: {
  draftParsed: T
  roles: TimelineRole[]
  language: string
  sanitize: (value: unknown) => string
  requestFixes: (system: string, user: string) => Promise<TimelineFix[] | null>
}): Promise<T> => {
  const { draftParsed, roles, language, sanitize, requestFixes } = args
  const entries: Array<{ id?: unknown; bullets?: unknown }> = Array.isArray(draftParsed?.workHistory)
    ? (draftParsed.workHistory as Array<{ id?: unknown; bullets?: unknown }>)
    : []

  type Problem = { index: number; bullet: string; technologies: string[] }
  type RoleCheck = { role: TimelineRole; endYear: number; exempt: Set<string>; problems: Problem[] }
  const checks = new Map<string, RoleCheck>()

  for (const role of roles) {
    const endYear = roleEndYear(role.end)
    if (endYear === undefined) continue
    const entry = entries.find((e) => e?.id === role.id)
    const bullets = Array.isArray(entry?.bullets) ? (entry.bullets as unknown[]).map(sanitize) : []
    const exempt = techNamesIn(role.existingBullets ?? [])
    const problems: Problem[] = []
    bullets.forEach((bullet, index) => {
      const found = findAnachronisms(bullet, endYear, exempt)
      if (found.length > 0) {
        problems.push({ index, bullet, technologies: found.map((t) => `${t.name} (first released ${t.year})`) })
      }
    })
    if (problems.length > 0) checks.set(role.id, { role, endYear, exempt, problems })
  }

  if (checks.size === 0) return draftParsed

  const problemsPayload = Array.from(checks.values()).map(({ role, problems }) => ({
    id: role.id,
    start: role.start ?? '',
    end: role.end ?? '',
    problems,
  }))

  const system =
    'Output ONLY valid JSON (no markdown). Return: { fixes: [{ id, index, bullet }] } and nothing else.'
  const user = `Each problem bullet below names a technology that had not been released yet during that role's dates (start to end). Rewrite each problem bullet so every technology it names was publicly available during the role.

Rules:
- Replace the impossible technology with what a team would realistically have used in that period (for example: VMs, Chef, Puppet or Capistrano instead of Kubernetes; jQuery or Backbone instead of React; Jenkins instead of GitHub Actions; classic ML or NLP pipelines instead of LLMs), or drop the technology if no honest equivalent exists.
- Keep the accomplishment and keep every number exactly as written.
- One sentence, same tone and tense, written in ${language}.
- Return exactly one fix per problem, using the given id and index.

Problems:
${JSON.stringify(problemsPayload)}`

  const fixes = new Map<string, string>()
  try {
    const list = (await requestFixes(system, user)) ?? []
    for (const fix of list) {
      if (typeof fix?.id !== 'string' || typeof fix?.index !== 'number') continue
      const text = sanitize(fix.bullet)
      if (text) fixes.set(`${fix.id}:${fix.index}`, text)
    }
  } catch {
    // Best-effort: unfixed problem bullets are dropped below.
  }

  const nextWorkHistory = entries.map((entry) => {
    const check = typeof entry?.id === 'string' ? checks.get(entry.id) : undefined
    if (!check || !Array.isArray(entry.bullets)) return entry
    const bad = new Set(check.problems.map((p) => p.index))
    const bullets = (entry.bullets as unknown[])
      .map(sanitize)
      .map((bullet, index) => {
        if (!bad.has(index)) return bullet
        const rewrite = fixes.get(`${check.role.id}:${index}`)
        // Trust a rewrite only if it is itself free of anachronisms.
        return rewrite && findAnachronisms(rewrite, check.endYear, check.exempt).length === 0 ? rewrite : ''
      })
      .filter(Boolean)
    return { ...entry, bullets }
  })

  return { ...draftParsed, workHistory: nextWorkHistory }
}
