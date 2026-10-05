export const CATEGORIES = [
  "engineering",
  "testing",
  "design-ui",
  "writing",
  "data",
  "research",
  "marketing-growth",
  "business-finance",
  "docs-productivity",
  "security",
  "media-creative",
  "infrastructure-devops",
] as const

export type Category = (typeof CATEGORIES)[number]

const RAW_MAP: Record<string, Category> = {
  "developer tools": "engineering",
  developer: "engineering",
  engineering: "engineering",
  testing: "testing",
  qa: "testing",
  design: "design-ui",
  ui: "design-ui",
  "design & ui": "design-ui",
  writing: "writing",
  content: "writing",
  copywriting: "writing",
  data: "data",
  "data science": "data",
  research: "research",
  science: "research",
  marketing: "marketing-growth",
  growth: "marketing-growth",
  seo: "marketing-growth",
  business: "business-finance",
  finance: "business-finance",
  legal: "business-finance",
  productivity: "docs-productivity",
  documentation: "docs-productivity",
  docs: "docs-productivity",
  security: "security",
  media: "media-creative",
  creative: "media-creative",
  video: "media-creative",
  devops: "infrastructure-devops",
  infrastructure: "infrastructure-devops",
  cloud: "infrastructure-devops",
}

export function mapCategory(raw: string | undefined, fallback: Category = "engineering"): Category {
  if (!raw) return fallback
  const key = raw.trim().toLowerCase()
  if ((CATEGORIES as readonly string[]).includes(key)) return key as Category
  return RAW_MAP[key] ?? fallback
}
