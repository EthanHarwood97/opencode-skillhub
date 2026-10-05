# SkillHub one-command installer. Safe to re-run.
param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$NoTask
)
$ErrorActionPreference = "Stop"

"SkillHub installer — repo: $RepoRoot"

$nodeVersion = node --version 2>$null
if (-not $nodeVersion) { throw "Node.js 22.23+ is required (node not found on PATH)" }
"node $nodeVersion"

Push-Location $RepoRoot
try {
  "installing dependencies…"
  npm install --silent 2>&1 | Out-Null
  "building the dashboard…"
  npm run ui:build --silent 2>&1 | Out-Null
} finally {
  Pop-Location
}

$config = Join-Path $HOME ".config\opencode\opencode.json"
$pluginPath = (Join-Path $RepoRoot "packages\plugin\src\plugin.ts").Replace("\", "/")
if (Test-Path $config) {
  $json = Get-Content $config -Raw | ConvertFrom-Json
  if (@($json.plugin) -contains $pluginPath) {
    "opencode config already registers the plugin"
  } else {
    $backup = "$config.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Copy-Item $config $backup
    $json.plugin = @($json.plugin) + $pluginPath
    $json | ConvertTo-Json -Depth 20 | Set-Content $config
    "registered the plugin in opencode.json (backup: $backup)"
  }
} else {
  "opencode config not found at $config — add `"plugin`": [`"$pluginPath`"] manually"
}

if (-not $NoTask) {
  "registering the daily 03:00 catalog sync…"
  pwsh -NoProfile -File (Join-Path $PSScriptRoot "register-sync-task.ps1") -RepoRoot $RepoRoot
} else {
  "skipping the scheduled task (-NoTask)"
}

""
"Done. Restart opencode, then:"
"  /skills    status, updates, upgrade suggestions"
"  /skillhub  open the dashboard"
"Or from a terminal: npm run skillhub -- coverage"
