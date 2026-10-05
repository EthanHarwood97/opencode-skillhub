import type { Requires } from "./types.ts"

const RUNTIME_PATTERNS: [string, RegExp][] = [
  ["node", /\b(npx|npm|pnpm|yarn|node)\s+[A-Za-z0-9@./_-]/],
  ["bun", /\bbun\s+(run|x|install|add)\b/],
  ["deno", /\bdeno\s+(run|task|eval)\b/],
  ["python", /\b(python3?|pip3?|uv)\s+[A-Za-z0-9./_-]/],
  ["powershell", /\b(pwsh|powershell)\b/i],
]

const SCRIPT_EXTENSIONS = new Set([
  ".sh", ".bash", ".ps1", ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".bat", ".cmd", ".rb", ".go", ".rs", ".pl",
])

const SCRIPT_REF_RE = /[`"'\s]([\w./-]+\.(?:sh|bash|ps1|py|js|mjs|cjs|ts|tsx|bat|cmd|rb|go|rs|pl))\b/g
const ENV_RE = /\b([A-Z][A-Z0-9_]*_(?:KEY|TOKEN|SECRET|URL|ID|PATH|ENDPOINT))\b/g
const MCP_RE = /mcp__([a-z0-9_-]+)|\bMCP server[s]?\s+["'`]?([a-z0-9_-]+)/gi

export const KNOWN_SERVICES = [
  "github", "gitlab", "figma", "notion", "slack", "discord", "stripe", "supabase", "cloudflare",
  "vercel", "netlify", "aws", "azure", "gcp", "openai", "anthropic", "deepseek", "google",
  "linear", "jira", "airtable", "hubspot", "shopify", "youtube", "spotify", "twitter",
]

/** Extract what a skill needs: runtimes invoked, scripts referenced, MCP servers, env vars, services. */
export function extractRequires(input: { body: string; files: string[] }): Requires {
  const runtime = new Set<string>()
  for (const [name, re] of RUNTIME_PATTERNS) if (re.test(input.body)) runtime.add(name)

  const scripts = new Set<string>()
  for (const path of input.files) {
    if (path.endsWith("SKILL.md")) continue
    const dot = path.lastIndexOf(".")
    if (dot !== -1 && SCRIPT_EXTENSIONS.has(path.slice(dot).toLowerCase())) scripts.add(path)
  }
  for (const match of input.body.matchAll(SCRIPT_REF_RE)) {
    const ref = match[1]?.replace(/^\.[\\/]/, "")
    if (ref) scripts.add(ref)
  }

  const env = new Set<string>()
  for (const match of input.body.matchAll(ENV_RE)) if (match[1]) env.add(match[1])

  const mcp = new Set<string>()
  for (const match of input.body.matchAll(MCP_RE)) {
    const name = match[1] ?? match[2]
    if (name) mcp.add(name.toLowerCase())
  }

  const services = new Set<string>()
  const lower = input.body.toLowerCase()
  for (const service of KNOWN_SERVICES) if (new RegExp(`\\b${service}\\b`).test(lower)) services.add(service)

  const sorted = (set: Set<string>) => [...set].sort()
  return { runtime: sorted(runtime), scripts: sorted(scripts), mcp: sorted(mcp), env: sorted(env), services: sorted(services) }
}
