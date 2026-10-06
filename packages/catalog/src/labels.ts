import { isCategory, priorityRank, type Category } from "./taxonomy.ts"

export type LabelDef = { id: string; category: Category | "cross"; terms: string[] }

/**
 * The capability label rulebook. Labels are an authority-backed controlled vocabulary:
 * 24 categories (navigation + coverage) and this fine-grained label layer (search + niche coverage).
 * Terms are matched case-insensitively on word boundaries; scoring: name x3, tags x2, description x2, body x1.
 */
export const LABEL_DEFS: LabelDef[] = [
  // engineering
  { id: "web-frontend", category: "engineering", terms: ["react", "vue", "svelte", "css", "tailwind", "component", "dom", "frontend"] },
  { id: "web-backend", category: "engineering", terms: ["fastapi", "express", "django", "endpoint", "server", "backend"] },
  { id: "fullstack", category: "engineering", terms: ["fullstack", "full-stack", "mvp", "scaffold", "boilerplate", "saas app"] },
  { id: "api-design", category: "engineering", terms: ["rest", "graphql", "openapi", "trpc", "grpc", "endpoint design"] },
  { id: "cli", category: "engineering", terms: ["cli", "terminal", "argv", "shell tool", "commander", "cobra"] },
  { id: "sdk-library", category: "engineering", terms: ["sdk", "library", "package", "npm", "pip"] },
  { id: "desktop-app", category: "engineering", terms: ["electron", "tauri", "macos app", "windows app", "qt"] },
  { id: "browser-extension", category: "engineering", terms: ["chrome extension", "manifest v3", "userscript", "browser extension"] },
  { id: "architecture", category: "engineering", terms: ["architecture", "design pattern", "ddd", "monorepo", "modular"] },
  { id: "refactoring", category: "engineering", terms: ["refactor", "simplify", "cleanup", "modernization", "migration code"] },
  { id: "code-review", category: "engineering", terms: ["code review", "pull request", "diff", "reviewer", "quality gate"] },
  { id: "debugging", category: "engineering", terms: ["debug", "stack trace", "diagnose", "bug", "root cause"] },
  { id: "performance", category: "engineering", terms: ["performance", "optimize", "core web vitals", "profiling", "latency"] },
  { id: "lang-typescript", category: "engineering", terms: ["typescript", "javascript", "node", "deno", "bun"] },
  { id: "lang-python", category: "engineering", terms: ["python", "pip", "poetry", "asyncio", "pydantic"] },
  { id: "lang-rust-go", category: "engineering", terms: ["rust", "cargo", "golang", "go module", "goroutine"] },
  { id: "lang-jvm-dotnet", category: "engineering", terms: ["java", "kotlin", "spring", "csharp", "dotnet"] },
  // testing
  { id: "unit-testing", category: "testing", terms: ["unit test", "assert", "mock", "stub", "pytest"] },
  { id: "integration-testing", category: "testing", terms: ["integration test", "contract test", "api test"] },
  { id: "e2e-testing", category: "testing", terms: ["e2e", "end-to-end", "playwright", "cypress", "selenium"] },
  { id: "tdd", category: "testing", terms: ["tdd", "red green", "test first", "failing test"] },
  { id: "visual-testing", category: "testing", terms: ["visual regression", "screenshot diff", "snapshot"] },
  { id: "load-testing", category: "testing", terms: ["load test", "stress test", "benchmark", "k6", "locust"] },
  { id: "a11y-testing", category: "testing", terms: ["wcag test", "axe", "screen reader", "a11y audit"] },
  { id: "fixtures", category: "testing", terms: ["fixture", "factory", "seed data", "test data"] },
  { id: "test-review", category: "testing", terms: ["test review", "flaky", "coverage", "testing strategy"] },
  // infrastructure-devops
  { id: "cloud-platforms", category: "infrastructure-devops", terms: ["aws", "azure", "gcp", "s3", "lambda", "cloud run"] },
  { id: "containers", category: "infrastructure-devops", terms: ["docker", "dockerfile", "compose", "container", "oci"] },
  { id: "kubernetes", category: "infrastructure-devops", terms: ["kubernetes", "k8s", "helm", "pod", "cluster"] },
  { id: "iac", category: "infrastructure-devops", terms: ["terraform", "pulumi", "cloudformation", "iac"] },
  { id: "ci-cd", category: "infrastructure-devops", terms: ["ci/cd", "github actions", "continuous integration", "continuous deployment"] },
  { id: "observability", category: "infrastructure-devops", terms: ["observability", "logging", "metrics", "traces", "grafana", "prometheus"] },
  { id: "sre-incident", category: "infrastructure-devops", terms: ["sre", "incident", "on-call", "postmortem", "runbook"] },
  { id: "serverless-edge", category: "infrastructure-devops", terms: ["serverless", "workers", "edge functions", "faas"] },
  { id: "linux-ops", category: "infrastructure-devops", terms: ["linux", "systemd", "ssh", "nginx", "bash"] },
  // security
  { id: "appsec", category: "security", terms: ["appsec", "owasp", "injection", "secure code", "xss"] },
  { id: "offensive-security", category: "security", terms: ["pentest", "offensive", "exploit", "red team", "burp"] },
  { id: "threat-intel", category: "security", terms: ["threat intel", "mitre", "att&ck", "ioc", "adversary"] },
  { id: "vuln-audit", category: "security", terms: ["vulnerability", "cve", "dependency audit", "sbom"] },
  { id: "forensics", category: "security", terms: ["forensics", "memory dump", "malware analysis", "disk image"] },
  { id: "compliance", category: "security", terms: ["soc2", "iso 27001", "hipaa", "pci", "compliance audit"] },
  { id: "privacy", category: "security", terms: ["privacy", "gdpr", "pii", "consent", "data protection"] },
  { id: "secrets-keys", category: "security", terms: ["secret", "kms", "vault", "encryption", "key rotation"] },
  { id: "reverse-engineering", category: "security", terms: ["reverse engineering", "decompile", "jadx", "ghidra", "disassembly"] },
  // data
  { id: "data-engineering", category: "data", terms: ["etl", "data pipeline", "ingestion", "dbt", "airflow"] },
  { id: "sql", category: "data", terms: ["sql", "query", "join", "postgres", "mysql"] },
  { id: "databases", category: "data", terms: ["database", "schema", "migration", "nosql"] },
  { id: "analytics", category: "data", terms: ["analytics", "cohort", "funnel", "kpi", "metrics"] },
  { id: "bi-dashboards", category: "data", terms: ["dashboard", "business intelligence", "metabase", "looker", "tableau"] },
  { id: "visualization", category: "data", terms: ["visualization", "chart", "plot", "matplotlib", "d3"] },
  { id: "statistics", category: "data", terms: ["statistics", "regression", "significance", "bayesian"] },
  { id: "spreadsheets", category: "data", terms: ["spreadsheet", "xlsx", "csv", "excel", "formula"] },
  { id: "data-quality", category: "data", terms: ["data quality", "dedupe", "data cleaning"] },
  // ai
  { id: "llm-api", category: "ai", terms: ["openai", "anthropic", "chat completion", "llm api", "claude api"] },
  { id: "prompt-engineering", category: "ai", terms: ["prompt", "system prompt", "few-shot", "chain of thought"] },
  { id: "agents", category: "ai", terms: ["agent", "agentic", "autonomous loop", "tool use"] },
  { id: "multi-agent", category: "ai", terms: ["multi-agent", "swarm", "orchestrator", "subagent", "agent team"] },
  { id: "mcp", category: "ai", terms: ["mcp", "model context protocol", "mcp server"] },
  { id: "rag", category: "ai", terms: ["rag", "retrieval", "chunking", "grounding"] },
  { id: "embeddings", category: "ai", terms: ["embedding", "vector", "similarity", "vector db"] },
  { id: "evals", category: "ai", terms: ["eval", "benchmark", "rubric", "judge"] },
  { id: "training", category: "ai", terms: ["training", "pretraining", "gpu", "distributed training"] },
  { id: "fine-tuning", category: "ai", terms: ["fine-tune", "finetune", "lora", "qlora", "peft"] },
  { id: "inference", category: "ai", terms: ["inference", "serving", "quantization", "llama.cpp", "vllm"] },
  { id: "mlops", category: "ai", terms: ["mlops", "experiment tracking", "model registry", "model deployment"] },
  { id: "context-engineering", category: "ai", terms: ["context window", "context engineering", "compaction", "memory management"] },
  // design-ui
  { id: "ux", category: "design-ui", terms: ["ux", "user flow", "journey map", "usability"] },
  { id: "ui", category: "design-ui", terms: ["ui", "layout", "user interface", "screen design"] },
  { id: "design-system", category: "design-ui", terms: ["design system", "design token", "component library", "style guide"] },
  { id: "brand", category: "design-ui", terms: ["branding", "logo", "brand identity", "brand voice"] },
  { id: "typography", category: "design-ui", terms: ["typography", "font", "type scale", "typeface"] },
  { id: "color", category: "design-ui", terms: ["color", "palette", "contrast ratio", "hsl"] },
  { id: "icons", category: "design-ui", terms: ["icon", "icon set", "svg icons"] },
  { id: "figma", category: "design-ui", terms: ["figma", "auto layout", "figma plugin"] },
  { id: "prototyping", category: "design-ui", terms: ["prototype", "wireframe", "mockup", "sketch"] },
  { id: "design-to-code", category: "design-ui", terms: ["design to code", "screenshot to code", "figma to code", "pixel perfect"] },
  // art-creative
  { id: "generative-art", category: "art-creative", terms: ["generative art", "p5.js", "processing", "flow field", "particle"] },
  { id: "illustration", category: "art-creative", terms: ["illustration", "drawing", "vector art", "procreate"] },
  { id: "pixel-art", category: "art-creative", terms: ["pixel art", "sprite", "aseprite", "8-bit"] },
  { id: "3d-modeling", category: "art-creative", terms: ["3d model", "blender", "sculpt", "openscad"] },
  { id: "animation-motion", category: "art-creative", terms: ["animation", "motion graphics", "easing", "motion canvas"] },
  { id: "poster-print", category: "art-creative", terms: ["poster", "flyer", "print design", "cmyk", "print layout"] },
  { id: "photography", category: "art-creative", terms: ["photography", "photo editing", "camera", "lighting setup"] },
  { id: "comics", category: "art-creative", terms: ["comic", "manga", "storyboard", "panels"] },
  // media
  { id: "image-generation", category: "media", terms: ["image generation", "diffusion", "midjourney", "stable diffusion", "generate image"] },
  { id: "image-editing", category: "media", terms: ["image editing", "retouch", "upscale", "inpaint", "background removal"] },
  { id: "video-generation", category: "media", terms: ["video generation", "veo", "sora", "runway", "kling"] },
  { id: "video-editing", category: "media", terms: ["video editing", "recut", "timeline", "captions", "ffmpeg"] },
  { id: "audio-music", category: "media", terms: ["audio", "music", "jingle", "mixing", "sound design"] },
  { id: "tts-speech", category: "media", terms: ["tts", "text to speech", "voice synthesis", "speech synthesis"] },
  { id: "subtitles-captions", category: "media", terms: ["subtitle", "caption", "transcript", "srt", "vtt"] },
  { id: "media-pipelines", category: "media", terms: ["ffmpeg", "encode", "transcode", "codec"] },
  { id: "podcast-streaming", category: "media", terms: ["podcast", "youtube", "livestream"] },
  // writing
  { id: "copywriting", category: "writing", terms: ["ad copy", "landing page copy", "sales copy", "copywriting"] },
  { id: "blogging", category: "writing", terms: ["blog", "article", "editorial"] },
  { id: "storytelling", category: "writing", terms: ["story", "narrative", "fiction", "novel"] },
  { id: "screenwriting", category: "writing", terms: ["screenplay", "screenwriting", "dialogue", "scenes"] },
  { id: "editing", category: "writing", terms: ["edit", "proofread", "copyedit", "line edit"] },
  { id: "humanizing", category: "writing", terms: ["humanize", "de-slop", "natural tone", "avoid ai writing"] },
  { id: "seo-writing", category: "writing", terms: ["seo content", "search intent", "serp", "keyword placement"] },
  { id: "translation", category: "writing", terms: ["translate", "translation", "bilingual", "localization"] },
  { id: "resumes", category: "writing", terms: ["resume", "cover letter", "job application", "curriculum vitae"] },
  // docs-productivity
  { id: "documentation", category: "docs-productivity", terms: ["docs", "documentation", "technical guide", "tutorial"] },
  { id: "api-docs", category: "docs-productivity", terms: ["api docs", "api reference", "openapi docs"] },
  { id: "readme", category: "docs-productivity", terms: ["readme", "contributing", "changelog"] },
  { id: "knowledge-base", category: "docs-productivity", terms: ["knowledge base", "wiki", "faq", "handbook"] },
  { id: "note-taking", category: "docs-productivity", terms: ["note-taking", "obsidian", "pkm", "zettelkasten"] },
  { id: "office-docs", category: "docs-productivity", terms: ["docx", "xlsx", "excel", "pptx", "powerpoint", "office document"] },
  { id: "pdf", category: "docs-productivity", terms: ["pdf", "form filling", "ocr", "pdf extraction"] },
  { id: "meeting-notes", category: "docs-productivity", terms: ["meeting", "meeting notes", "agenda", "action items"] },
  { id: "adr", category: "docs-productivity", terms: ["adr", "decision record", "rfc"] },
  // marketing-growth
  { id: "seo", category: "marketing-growth", terms: ["seo", "serp", "backlink", "on-page"] },
  { id: "geo-aeo", category: "marketing-growth", terms: ["generative engine optimization", "answer engine optimization", "ai overviews", "llm visibility", "ai search"] },
  { id: "keyword-research", category: "marketing-growth", terms: ["keyword research", "search volume", "long-tail keywords", "keyword difficulty"] },
  { id: "content-strategy", category: "marketing-growth", terms: ["content strategy", "editorial calendar", "topic cluster"] },
  { id: "social-media", category: "marketing-growth", terms: ["social media", "twitter", "linkedin", "instagram", "tiktok"] },
  { id: "paid-ads", category: "marketing-growth", terms: ["google ads", "meta ads", "ppc", "ad campaign", "facebook ads"] },
  { id: "email-marketing", category: "marketing-growth", terms: ["email marketing", "newsletter", "drip", "deliverability"] },
  { id: "cro", category: "marketing-growth", terms: ["conversion rate", "cro", "funnel optimization", "landing page optimization"] },
  { id: "marketing-analytics", category: "marketing-growth", terms: ["ga4", "attribution", "utm", "marketing analytics"] },
  { id: "ab-testing", category: "marketing-growth", terms: ["a/b test", "ab test", "experiment variant", "statistical significance"] },
  // business-ops
  { id: "strategy", category: "business-ops", terms: ["strategy", "swot", "positioning", "business model"] },
  { id: "finance", category: "business-ops", terms: ["finance", "valuation", "dcf", "p&l", "cashflow", "financial model"] },
  { id: "accounting", category: "business-ops", terms: ["accounting", "bookkeeping", "invoice", "tax", "vat"] },
  { id: "legal", category: "business-ops", terms: ["legal", "contract", "nda", "terms of service", "lawyer"] },
  { id: "hr-recruiting", category: "business-ops", terms: ["recruiting", "hiring", "interview process", "onboarding", "human resources"] },
  { id: "sales-crm", category: "business-ops", terms: ["sales", "crm", "sales pipeline", "deal", "prospecting"] },
  { id: "customer-support", category: "business-ops", terms: ["customer support", "helpdesk", "customer service", "support ticket"] },
  { id: "ecommerce", category: "business-ops", terms: ["ecommerce", "shopify", "amazon seller", "product listing"] },
  { id: "pricing", category: "business-ops", terms: ["pricing", "monetization", "packaging", "price plan"] },
  { id: "fundraising", category: "business-ops", terms: ["fundraising", "pitch deck", "investor", "cap table"] },
  { id: "feedback-reviews", category: "business-ops", terms: ["360 feedback", "performance review", "employee feedback"] },
  // product
  { id: "prd-specs", category: "product", terms: ["prd", "product requirements", "spec", "user story"] },
  { id: "roadmaps", category: "product", terms: ["roadmap", "milestone", "now next later", "product plan"] },
  { id: "tickets-backlog", category: "product", terms: ["ticket", "backlog", "issue tracker", "jira", "kanban"] },
  { id: "user-research", category: "product", terms: ["user interview", "usability test", "persona", "jobs to be done"] },
  { id: "prioritization", category: "product", terms: ["prioritize", "rice score", "moscow", "tradeoff"] },
  { id: "project-management", category: "product", terms: ["project plan", "gantt", "status report", "stakeholder", "project risk"] },
  { id: "brainstorming", category: "product", terms: ["brainstorm", "ideate", "divergent", "concept generation"] },
  { id: "okrs", category: "product", terms: ["okr", "objectives", "key results", "goal setting"] },
  // communication
  { id: "email-comms", category: "communication", terms: ["email", "reply", "inbox", "follow-up"] },
  { id: "internal-comms", category: "communication", terms: ["status update", "leadership update", "3p update", "internal newsletter"] },
  { id: "outreach", category: "communication", terms: ["outreach", "cold email", "cold dm", "prospecting message"] },
  { id: "presentations", category: "communication", terms: ["presentation", "deck", "slides", "pitch deck", "keynote"] },
  { id: "community", category: "communication", terms: ["community", "moderation", "discord", "forum"] },
  { id: "meetings", category: "communication", terms: ["meeting facilitation", "agenda", "workshop"] },
  // research
  { id: "web-research", category: "research", terms: ["web search", "research sources", "browsing", "online research"] },
  { id: "academic", category: "research", terms: ["paper", "arxiv", "academic", "peer review"] },
  { id: "literature-review", category: "research", terms: ["literature review", "systematic review", "survey paper"] },
  { id: "citations", category: "research", terms: ["citation", "bibtex", "bibliography"] },
  { id: "fact-checking", category: "research", terms: ["fact check", "verify claim", "debunk", "source check"] },
  { id: "competitive-analysis", category: "research", terms: ["competitor", "competitive teardown", "landscape analysis", "benchmarking"] },
  { id: "market-research", category: "research", terms: ["market research", "market sizing", "tam", "industry trends"] },
  { id: "scientific-computing", category: "research", terms: ["astropy", "bioinformatics", "genomics", "simulation", "numpy"] },
  // education
  { id: "tutoring", category: "education", terms: ["tutor", "teach", "student", "explain"] },
  { id: "curriculum", category: "education", terms: ["curriculum", "syllabus", "lesson plan", "course"] },
  { id: "learning-paths", category: "education", terms: ["learning path", "study plan", "learning roadmap"] },
  { id: "quizzes-assessment", category: "education", terms: ["quiz", "assessment", "exam", "flashcard"] },
  { id: "educational-content", category: "education", terms: ["educational", "eli5", "analogy", "examples for learning"] },
  // integrations
  { id: "saas-connector", category: "integrations", terms: ["notion api", "slack", "linear app", "connector"] },
  { id: "api-integration", category: "integrations", terms: ["api integration", "rest client", "sdk integration", "api client"] },
  { id: "auth-oauth", category: "integrations", terms: ["oauth", "oidc", "jwt", "sso", "login flow"] },
  { id: "payments", category: "integrations", terms: ["stripe", "payment", "billing", "checkout", "subscription"] },
  { id: "google-workspace", category: "integrations", terms: ["gmail", "google drive", "google calendar", "google sheets", "google workspace"] },
  { id: "microsoft-365", category: "integrations", terms: ["outlook", "microsoft teams", "sharepoint", "microsoft graph"] },
  { id: "github-integrations", category: "integrations", terms: ["github", "gh cli", "github api", "pull request bot"] },
  { id: "notifications", category: "integrations", terms: ["notification", "webhook", "push notification", "telegram"] },
  // automation
  { id: "workflow-automation", category: "automation", terms: ["workflow", "automation", "zapier", "make.com", "n8n"] },
  { id: "rpa", category: "automation", terms: ["rpa", "desktop automation", "ui automation", "robotic process"] },
  { id: "browser-automation", category: "automation", terms: ["browser automation", "playwright", "puppeteer", "cdp"] },
  { id: "scraping", category: "automation", terms: ["scrape", "crawler", "crawl", "firecrawl", "spider"] },
  { id: "cron-jobs", category: "automation", terms: ["cron", "scheduled job", "trigger schedule", "timer job"] },
  { id: "file-automation", category: "automation", terms: ["file organizer", "rename files", "batch files", "file watcher"] },
  // mobile
  { id: "ios", category: "mobile", terms: ["ios", "swift", "swiftui", "xcode"] },
  { id: "android", category: "mobile", terms: ["android", "kotlin", "jetpack", "gradle"] },
  { id: "react-native", category: "mobile", terms: ["react native", "expo", "metro bundler"] },
  { id: "flutter", category: "mobile", terms: ["flutter", "dart"] },
  { id: "app-store", category: "mobile", terms: ["app store", "play store", "app submission", "aso"] },
  { id: "mobile-ui", category: "mobile", terms: ["mobile design", "touch interface", "ios design", "android design"] },
  // games
  { id: "game-design", category: "games", terms: ["game design", "mechanics", "balance", "game loop"] },
  { id: "unity", category: "games", terms: ["unity", "prefab", "csharp unity"] },
  { id: "godot", category: "games", terms: ["godot", "gdscript"] },
  { id: "unreal", category: "games", terms: ["unreal", "blueprint", "ue5"] },
  { id: "2d-games", category: "games", terms: ["2d game", "sprite game", "platformer"] },
  { id: "3d-game-assets", category: "games", terms: ["3d asset", "level art", "rigging", "texture game"] },
  { id: "npc-writing", category: "games", terms: ["npc", "dialogue tree", "quest design", "game lore"] },
  // web3
  { id: "blockchain", category: "web3", terms: ["blockchain", "ledger", "consensus mechanism", "validator"] },
  { id: "smart-contracts", category: "web3", terms: ["smart contract", "solidity", "anchor framework", "evm"] },
  { id: "defi", category: "web3", terms: ["defi", "liquidity pool", "yield farming", "token swap", "automated market maker"] },
  { id: "nft", category: "web3", terms: ["nft", "mint", "token metadata"] },
  { id: "wallets", category: "web3", terms: ["wallet", "seed phrase", "private key", "custody"] },
  { id: "tokenomics", category: "web3", terms: ["tokenomics", "token design", "dao governance", "governance token"] },
  // iot-hardware
  { id: "embedded", category: "iot-hardware", terms: ["arduino", "esp32", "firmware", "microcontroller", "rtos"] },
  { id: "robotics", category: "iot-hardware", terms: ["robot", "ros", "drone", "servo", "actuator"] },
  { id: "cad-printing", category: "iot-hardware", terms: ["cad", "fusion 360", "3d printing", "gcode", "pcb"] },
  { id: "smart-home", category: "iot-hardware", terms: ["home assistant", "zigbee", "mqtt", "smart home"] },
  { id: "sensors", category: "iot-hardware", terms: ["sensor", "i2c", "spi", "gpio", "telemetry"] },
  { id: "electronics-tooling", category: "iot-hardware", terms: ["oscilloscope", "soldering", "circuit", "schematic"] },
  // lifestyle
  { id: "travel", category: "lifestyle", terms: ["travel", "itinerary", "flight", "hotel"] },
  { id: "food-cooking", category: "lifestyle", terms: ["recipe", "cooking", "meal plan", "nutrition"] },
  { id: "health-fitness", category: "lifestyle", terms: ["workout", "fitness", "healthcare", "sleep tracking", "medical"] },
  { id: "personal-finance", category: "lifestyle", terms: ["budget", "savings", "personal finance", "pension"] },
  { id: "home-life", category: "lifestyle", terms: ["furniture", "home", "dating", "errands", "shopping"] },
  // cross-cutting
  { id: "accessibility", category: "cross", terms: ["accessibility", "wcag", "screen reader", "contrast"] },
  { id: "internationalization", category: "cross", terms: ["i18n", "l10n", "locale", "rtl"] },
  { id: "templates", category: "cross", terms: ["template", "boilerplate", "starter", "scaffold"] },
  { id: "plugins", category: "cross", terms: ["plugin", "addon", "extension architecture"] },
  { id: "multimodal", category: "cross", terms: ["multimodal", "vision model", "audio image"] },
  { id: "dataset", category: "cross", terms: ["dataset", "corpus", "training data"] },
  { id: "self-hosted", category: "cross", terms: ["self-hosted", "homelab", "docker compose deploy"] },
]

export const LABEL_IDS: ReadonlySet<string> = new Set(LABEL_DEFS.map((label) => label.id))

export type ClassifyInput = {
  name: string
  description?: string
  tags?: string[]
  body?: string
  categoryHint?: string
  labelHints?: string[]
}

export type ClassifyResult = {
  category: Category
  labels: string[]
  confidence: number
  reasons: string[]
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const normalizeText = (value: string): string => value.toLowerCase().replace(/[-_/]+/g, " ")

const patternCache = new Map<string, RegExp>()
const patternFor = (term: string): RegExp => {
  let pattern = patternCache.get(term)
  if (!pattern) {
    const normalized = escapeRegExp(normalizeText(term)).replace(/\\ /g, " ")
    pattern = new RegExp(`(?<![a-z0-9])${normalized}(?:s)?(?![a-z0-9])`, "i")
    patternCache.set(term, pattern)
  }
  return pattern
}

const SCORE_THRESHOLD = 3
const META_THRESHOLD = 2
const MAX_LABELS = 8

type Haystack = { name: string; tags: string; description: string; body: string }

const scoreLabel = (label: LabelDef, hay: Haystack): { score: number; meta: number } => {
  let score = 0
  let meta = 0
  for (const term of label.terms) {
    const pattern = patternFor(term)
    if (pattern.test(hay.name)) {
      score += 3
      meta += 3
    }
    if (pattern.test(hay.tags)) {
      score += 2
      meta += 2
    }
    if (pattern.test(hay.description)) {
      score += 2
      meta += 2
    }
    if (pattern.test(hay.body)) score += 1
  }
  return { score, meta }
}

export function classifySkill(input: ClassifyInput): ClassifyResult {
  const tags = (input.tags ?? []).filter(
    (tag) => !tag.startsWith(".") && tag.length <= 24 && !tag.toLowerCase().includes("awesome"),
  )
  const hay: Haystack = {
    name: normalizeText(input.name ?? ""),
    tags: normalizeText(tags.join(" ")),
    description: normalizeText(input.description ?? ""),
    body: normalizeText((input.body ?? "").slice(0, 24_000)),
  }

  const scored: { label: LabelDef; score: number; meta: number }[] = []
  const categoryScores = new Map<Category, number>()
  for (const label of LABEL_DEFS) {
    const { score, meta } = scoreLabel(label, hay)
    if (score < SCORE_THRESHOLD && meta < META_THRESHOLD) continue
    scored.push({ label, score: score + (score < SCORE_THRESHOLD ? META_THRESHOLD : 0), meta })
  }
  // The category is decided by declared evidence (name/tags/description); body-text alone never votes.
  for (const entry of scored) {
    if (entry.meta < META_THRESHOLD || entry.label.category === "cross") continue
    const current = categoryScores.get(entry.label.category) ?? 0
    if (entry.score > current) categoryScores.set(entry.label.category, entry.score)
  }
  scored.sort((a, b) => b.score - a.score || a.label.id.localeCompare(b.label.id))

  const labels = scored.slice(0, MAX_LABELS).map((entry) => entry.label.id)
  for (const hint of input.labelHints ?? []) {
    if (LABEL_IDS.has(hint) && !labels.includes(hint)) labels.unshift(hint)
  }

  const hinted = input.categoryHint && isCategory(input.categoryHint) ? input.categoryHint : undefined
  let category: Category
  if (hinted) {
    category = hinted
  } else if (categoryScores.size > 0) {
    const ranked = [...categoryScores.entries()].sort((a, b) => {
      if (b[1] !== a[1] && Math.abs(b[1] - a[1]) > 1) return b[1] - a[1]
      const priority = priorityRank(a[0]) - priorityRank(b[0])
      return priority !== 0 ? priority : b[1] - a[1]
    })
    category = ranked[0]![0]
  } else {
    category = "engineering"
  }

  const topLabelScore = scored[0]?.score ?? 0
  const topCategoryScore = categoryScores.get(category) ?? 0
  const confidence = hinted
    ? Math.min(0.95, Math.max(0.5, topLabelScore / 8))
    : Math.min(1, topCategoryScore / 8)

  const reasons = scored.slice(0, 3).map((entry) => `${entry.label.id}:${entry.score}`)
  return { category, labels: [...new Set(labels)].slice(0, MAX_LABELS + (input.labelHints?.length ?? 0)), confidence, reasons }
}
