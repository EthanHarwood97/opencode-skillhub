import { describe, expect, it } from "vitest"
import { classifySkill, LABEL_DEFS, LABEL_IDS } from "../src/labels.ts"
import { CATEGORIES } from "../src/taxonomy.ts"

describe("label rulebook", () => {
  it("has unique ids, valid categories, and lowercase non-empty terms", () => {
    const ids = LABEL_DEFS.map((label) => label.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const label of LABEL_DEFS) {
      expect(LABEL_IDS.has(label.id)).toBe(true)
      if (label.category !== "cross") expect(CATEGORIES).toContain(label.category)
      expect(label.terms.length).toBeGreaterThan(0)
      for (const term of label.terms) {
        expect(term).toBe(term.toLowerCase())
        expect(term.trim().length).toBeGreaterThan(1)
      }
    }
  })
})

describe("classifySkill basics", () => {
  it("falls back to engineering with no labels for signal-free gibberish", () => {
    const result = classifySkill({ name: "zzz", description: "" })
    expect(result.category).toBe("engineering")
    expect(result.labels).toEqual([])
  })

  it("honours an explicit category hint over text scoring", () => {
    const result = classifySkill({
      name: "code-review-and-quality",
      description: "Code review of pull requests",
      categoryHint: "writing",
    })
    expect(result.category).toBe("writing")
  })

  it("applies seed label hints", () => {
    const result = classifySkill({ name: "mystery", description: "", labelHints: ["mcp", "agents"] })
    expect(result.labels).toContain("mcp")
    expect(result.labels).toContain("agents")
  })

  it("attaches cross-cutting labels without changing the category", () => {
    const result = classifySkill({
      name: "web-design-guidelines",
      description: "Review UI for accessibility, WCAG and contrast",
    })
    expect(result.labels).toContain("accessibility")
    expect(result.category).toBe("design-ui")
  })

  it("matches terms on word boundaries (no substring noise)", () => {
    const result = classifySkill({ name: "email-templates", description: "Email templates for outreach" })
    expect(result.labels).not.toContain("ai")
    expect(result.labels).toContain("email-comms")
  })

  it("decides the category from declared evidence, not body-text drift", () => {
    const result = classifySkill({
      name: "gh-create-issue",
      description: "Use when the user wants to create a GitHub issue for the current repository.",
      body: "This skill uses tool use and the agent loop so agents can drive tool use across agents. ".repeat(6),
    })
    expect(result.category).toBe("integrations")
    expect(result.labels).toContain("github-integrations")
  })

  it("does not vote web3 for a body-only liquidity mention", () => {
    const result = classifySkill({
      name: "cold-start-problem",
      description: "Start and scale networked products using the Cold Start Problem framework.",
      body: "Liquidity, yield, swap and liquidity effects appear in this market discussion. ".repeat(4),
    })
    expect(result.category).not.toBe("web3")
  })
})

type GoldenCase = { name: string; description: string; expected: string }

const GOLDEN: GoldenCase[] = [
  // games
  { name: "godot-gdscript-patterns", description: "Godot 4 GDScript patterns for game development", expected: "games" },
  { name: "unity-developer", description: "Unity C# development for 2D and 3D games", expected: "games" },
  { name: "game-development", description: "Game design workflows, mechanics balancing and playtesting", expected: "games" },
  { name: "2d-games", description: "Build 2D sprite games and platformers", expected: "games" },
  // art-creative
  { name: "blender-toolkit", description: "Blender 3D model sculpting and rendering toolkit", expected: "art-creative" },
  { name: "motion-canvas", description: "Create animation and motion graphics with Motion Canvas", expected: "art-creative" },
  { name: "pixel-art-forge", description: "Generate pixel art sprites with Aseprite workflows", expected: "art-creative" },
  { name: "poster-designer", description: "Design posters and flyers for print with CMYK output", expected: "art-creative" },
  // media
  { name: "video-edit", description: "ffmpeg video editing, recut and captions", expected: "media" },
  { name: "ai-music", description: "Generate music and audio with AI sound design", expected: "media" },
  { name: "youtube-transcript", description: "Download YouTube transcripts and captions", expected: "media" },
  // writing
  { name: "blog-post", description: "Write blog articles and editorial content", expected: "writing" },
  { name: "humanizer", description: "Humanize AI writing, natural tone, de-slop", expected: "writing" },
  { name: "resume-builder", description: "Build a resume and cover letter for job applications", expected: "writing" },
  { name: "career-ops", description: "Job application pipeline with a resume tailored per posting", expected: "writing" },
  // marketing-growth
  { name: "google-official-seo-guide", description: "SEO guide covering SERP, backlinks and on-page", expected: "marketing-growth" },
  { name: "claude-ads", description: "Paid ads audit across Google Ads and Meta ads", expected: "marketing-growth" },
  { name: "geo-seo", description: "Generative engine optimization for AI Overviews and LLM visibility", expected: "marketing-growth" },
  // data
  { name: "sql-queries", description: "SQL query optimization for Postgres joins", expected: "data" },
  { name: "cohort-analysis", description: "Cohort analysis and funnel analytics dashboards", expected: "data" },
  { name: "xlsx", description: "Create xlsx spreadsheets with Excel formulas", expected: "data" },
  // ai
  { name: "mcp-builder", description: "Build MCP servers with the Model Context Protocol", expected: "ai" },
  { name: "agent-evaluation", description: "Evals, benchmarks and rubric judging for LLM agents", expected: "ai" },
  { name: "llama-factory", description: "Fine-tune LLMs with LoRA and QLoRA training", expected: "ai" },
  { name: "rag-pipeline", description: "RAG retrieval, chunking and embeddings with a vector db", expected: "ai" },
  // security
  { name: "offensive-api-security", description: "Pentest API security, exploit testing and red team", expected: "security" },
  { name: "reverse-engineering-tools", description: "Reverse engineering and decompile Android APKs with jadx", expected: "security" },
  { name: "screen-reader-testing", description: "Accessibility testing with screen readers and WCAG", expected: "testing" },
  // engineering
  { name: "fastapi-templates", description: "FastAPI backend API templates with Python", expected: "engineering" },
  { name: "nextjs-developer", description: "React Next.js frontend web app components", expected: "engineering" },
  { name: "code-review-and-quality", description: "Code review of pull requests and diffs", expected: "engineering" },
  { name: "ci-cd-and-automation", description: "Set up CI/CD pipelines with GitHub Actions and releases", expected: "infrastructure-devops" },
  { name: "debugging-and-error-recovery", description: "Debug stack traces and diagnose errors", expected: "engineering" },
  // business-ops
  { name: "dcf-valuation", description: "DCF valuation and financial model for finance teams", expected: "business-ops" },
  { name: "accounting", description: "Accounting, bookkeeping, invoices and VAT", expected: "business-ops" },
  // product
  { name: "create-prd", description: "Write a PRD with product requirements and user stories", expected: "product" },
  { name: "brainstorm-okrs", description: "Brainstorm OKRs, objectives and key results", expected: "product" },
  // design-ui
  { name: "ui-ux-pro-max", description: "UI UX design system, wireframes and design tokens", expected: "design-ui" },
  { name: "screenshot-to-code", description: "Convert screenshots to code, pixel perfect design to code", expected: "design-ui" },
  // research
  { name: "literature-review", description: "Literature review and systematic review of academic papers", expected: "research" },
  { name: "market-sizing-analysis", description: "Market sizing, TAM and industry trends research", expected: "research" },
  // mobile
  { name: "flutter-development", description: "Flutter and Dart mobile app development", expected: "mobile" },
  { name: "mobile-ios-design", description: "iOS Swift UI design for mobile apps", expected: "mobile" },
  // integrations
  { name: "oauth-2-0-setup", description: "Set up OAuth 2.0 and SSO login flows", expected: "integrations" },
  { name: "telegram-bot-builder", description: "Build Telegram bots with webhooks and notifications", expected: "integrations" },
  // automation
  { name: "browser-automation", description: "Browser automation with Playwright and CDP", expected: "automation" },
  { name: "google-maps-scraper", description: "Scrape Google Maps listings with a crawler", expected: "automation" },
  // web3
  { name: "solana-dev", description: "Solana smart contract development with Anchor", expected: "web3" },
  { name: "defi-yield-tracker", description: "Track DeFi yield farming and liquidity positions", expected: "web3" },
  // iot-hardware
  { name: "esp32-firmware", description: "Arduino and ESP32 firmware for microcontrollers", expected: "iot-hardware" },
  { name: "home-assistant-config", description: "Home Assistant smart home with Zigbee and MQTT", expected: "iot-hardware" },
  // lifestyle
  { name: "travel-planner", description: "Plan travel itineraries, flights and hotels", expected: "lifestyle" },
  { name: "meal-planner", description: "Weekly meal plan and recipes with nutrition", expected: "lifestyle" },
  // education
  { name: "guided-learning", description: "Tutor students and explain concepts step by step", expected: "education" },
  { name: "curriculum-builder", description: "Build a curriculum, syllabus and lesson plans", expected: "education" },
  // communication
  { name: "cold-outreach", description: "Cold email outreach and prospecting messages", expected: "communication" },
  { name: "internal-comms", description: "Write a leadership update and 3p status update", expected: "communication" },
  // docs-productivity
  { name: "meeting-minutes", description: "Meeting notes, agenda and action items", expected: "docs-productivity" },
  { name: "pptx", description: "Create pptx powerpoint decks from an outline", expected: "docs-productivity" },
  // testing
  { name: "vitest", description: "Unit testing with Vitest, mocks and assertions", expected: "testing" },
]

describe("golden set", () => {
  it("classifies at least 90% of 60 real-world skills into the expected category", () => {
    const misses = GOLDEN.flatMap((testCase) => {
      const result = classifySkill({ name: testCase.name, description: testCase.description })
      return result.category === testCase.expected ? [] : [{ ...testCase, got: result.category, labels: result.labels }]
    })
    const accuracy = (GOLDEN.length - misses.length) / GOLDEN.length
    if (process.env.GOLDEN_REPORT) console.log(`golden accuracy ${(accuracy * 100).toFixed(1)}% (${GOLDEN.length - misses.length}/${GOLDEN.length})`, misses)
    expect(accuracy, `misses: ${JSON.stringify(misses, null, 2)}`).toBeGreaterThanOrEqual(0.9)
  })

  it("labels every correctly classified golden case with at least one label", () => {
    const unlabelled = GOLDEN.flatMap((testCase) => {
      const result = classifySkill({ name: testCase.name, description: testCase.description })
      return result.category === testCase.expected && result.labels.length === 0 ? [testCase.name] : []
    })
    expect(unlabelled, `unlabelled: ${unlabelled.join(", ")}`).toEqual([])
  })
})
