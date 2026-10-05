import { normalizeText } from "./parse.ts"
import type { Risk, RiskFinding } from "./types.ts"

export type ScanRule = {
  rule: string
  category: RiskFinding["category"]
  severity: RiskFinding["severity"]
  re: RegExp
}

export const SCAN_RULES: ScanRule[] = [
  { rule: "injection.ignore-previous", category: "injection", severity: "critical", re: /ignore (all )?(previous|prior|above) instructions/i },
  { rule: "injection.hide-from-user", category: "injection", severity: "high", re: /do not (tell|inform|mention( to)?) the user/i },
  { rule: "injection.silently", category: "injection", severity: "medium", re: /\b(secretly|silently|without (asking|telling|informing))\b/i },
  { rule: "exfil.credential-paths", category: "exfiltration", severity: "critical", re: /(\.ssh\/id_[a-z]+|\.aws\/credentials|\.config\/gcloud|\.netrc)/i },
  { rule: "exfil.credential-post", category: "exfiltration", severity: "critical", re: /(curl|fetch|requests?\.post|axios)[^\n]{0,120}(api[_-]?key|token|secret|credential)/i },
  { rule: "shell.pipe-to-shell", category: "shell", severity: "high", re: /(curl|wget)[^\n|]*\|[^\n]*(sh|bash|powershell|iex)\b/i },
  { rule: "shell.rm-rf-root", category: "shell", severity: "critical", re: /\brm\s+-rf\s+\/(?!tmp\b)/i },
  { rule: "shell.powershell-encoded", category: "shell", severity: "high", re: /powershell(\.exe)?[^\n]*-e(nc|ncodedcommand)/i },
  { rule: "obfuscation.base64-decode", category: "obfuscation", severity: "medium", re: /(base64\s+(-d|--decode)|atob\s*\()/i },
  { rule: "fs.write-outside-skill", category: "filesystem", severity: "medium", re: /(>>?|writeFile(Sync)?\s*\()[^\n]{0,40}(~\/|\/etc\/|C:\\\\Windows)/i },
]

export function scanSkill(body: string, opts: { extraRules?: ScanRule[] } = {}): Risk {
  const text = normalizeText(body)
  const lines = text.split("\n")
  const rules = [...SCAN_RULES, ...(opts.extraRules ?? [])]
  const findings: RiskFinding[] = []

  for (const rule of rules) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ""
      const match = line.match(rule.re)
      if (match) {
        findings.push({ rule: rule.rule, category: rule.category, severity: rule.severity, match: match[0], line: i + 1 })
        break
      }
    }
  }

  const level: Risk["level"] = findings.some((f) => f.severity === "critical")
    ? "critical"
    : findings.some((f) => f.severity === "high")
      ? "high"
      : findings.some((f) => f.severity === "medium")
        ? "medium"
        : "low"

  return { level, findings }
}
