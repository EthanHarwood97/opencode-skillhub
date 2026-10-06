# SkillHub catalog sync. Run by the "SkillHub Catalog Sync" scheduled task (daily 03:00 local).
param([string]$RepoRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"

$skillhome = if ($env:SKILLHUB_HOME) { $env:SKILLHUB_HOME } else { Join-Path $HOME ".config\opencode\.skillhub" }
$logdir = Join-Path $skillhome "logs"
New-Item -ItemType Directory -Force $logdir | Out-Null
$log = Join-Path $logdir ("sync-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

"[{0}] sync start (repo: {1})" -f (Get-Date -Format o), $RepoRoot | Add-Content $log

$token = $null
try { $token = (& gh auth token 2>$null) } catch {}
if (-not $token) { $token = $env:GITHUB_PERSONAL_ACCESS_TOKEN }
if ($token) { $env:GITHUB_TOKEN = $token }
"[{0}] github token: {1}" -f (Get-Date -Format o), $(if ($token) { "yes" } else { "no (unauthenticated)" }) | Add-Content $log

$curateArgs = @()
$llmKey = $env:SKILLHUB_LLM_API_KEY
if (-not $llmKey -and $env:GEMINI_API_KEY) {
  $env:SKILLHUB_LLM_API_KEY = $env:GEMINI_API_KEY
  $env:SKILLHUB_LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
  $env:SKILLHUB_LLM_MODEL = "gemini-2.5-flash"
  $llmKey = $env:GEMINI_API_KEY
} elseif (-not $llmKey -and $env:DEEPSEEK_API_KEY) {
  $env:SKILLHUB_LLM_API_KEY = $env:DEEPSEEK_API_KEY
  $llmKey = $env:DEEPSEEK_API_KEY
}
if ($llmKey) {
  $curateArgs = @("--curate", "--curate-max-items", "60", "--curate-max-usd", "0.25", "--curate-cost-per-item", "0.002")
  "[{0}] nightly curator enabled (cap `$0.25, 60 items, model {1})" -f (Get-Date -Format o), $env:SKILLHUB_LLM_MODEL | Add-Content $log
} else {
  "[{0}] nightly curator skipped (no SKILLHUB_LLM_API_KEY/GEMINI_API_KEY/DEEPSEEK_API_KEY)" -f (Get-Date -Format o) | Add-Content $log
}

& node (Join-Path $RepoRoot "packages\catalog\src\sync-bin.ts") `
  --topics "claude-skills,agent-skills,opencode-skills,claude-code-skills,ai-agent-skills" `
  --max-repos 30 --max-skills 15 --pages 2 `
  --seeds (Join-Path $RepoRoot "seed-repos.json") `
  --agentskills "https://agentskills.codes" --agentskills-limit 50 `
  @curateArgs `
  --out (Join-Path $skillhome "catalog") --state (Join-Path $skillhome "catalog\state") *>> $log
$code = $LASTEXITCODE
"[{0}] sync exit {1}" -f (Get-Date -Format o), $code | Add-Content $log

# Keep exactly the best skill per category installed and active (files fetched from source; no LLM spend).
& node (Join-Path $RepoRoot "packages\cli\src\bin.ts") autopilot --per-category 1 --margin 3 *>> $log
"[{0}] autopilot exit {1}" -f (Get-Date -Format o), $LASTEXITCODE | Add-Content $log

Get-ChildItem $logdir -Filter "sync-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue
exit $code
