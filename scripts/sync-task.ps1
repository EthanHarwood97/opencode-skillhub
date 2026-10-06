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

& node (Join-Path $RepoRoot "packages\catalog\src\sync-bin.ts") `
  --topics "claude-skills,agent-skills,opencode-skills,claude-code-skills,ai-agent-skills" `
  --max-repos 30 --max-skills 15 --pages 2 `
  --seeds (Join-Path $RepoRoot "seed-repos.json") `
  --agentskills "https://agentskills.codes" --agentskills-limit 50 `
  --out (Join-Path $skillhome "catalog") --state (Join-Path $skillhome "catalog\state") *>> $log
$code = $LASTEXITCODE
"[{0}] sync exit {1}" -f (Get-Date -Format o), $code | Add-Content $log

Get-ChildItem $logdir -Filter "sync-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue
exit $code
