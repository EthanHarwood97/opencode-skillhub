# Registers (or removes) the daily SkillHub catalog sync task. Safe to re-run.
param(
  [switch]$Remove,
  [switch]$DryRun,
  [string]$Time = "03:00",
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = "Stop"
$taskName = "SkillHub Catalog Sync"

if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  "removed task '$taskName'"
  exit 0
}

$skillhome = if ($env:SKILLHUB_HOME) { $env:SKILLHUB_HOME } else { Join-Path $HOME ".config\opencode\.skillhub" }
New-Item -ItemType Directory -Force $skillhome | Out-Null
$hostedScript = Join-Path $skillhome "sync-task.ps1"
Copy-Item -Force (Join-Path $PSScriptRoot "sync-task.ps1") $hostedScript

$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = (Get-Command powershell).Source }

if ($DryRun) {
  "would register '$taskName' daily at $Time"
  "  program: $pwsh"
  "  args:    -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$hostedScript`" -RepoRoot `"$RepoRoot`""
  exit 0
}

$action = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$hostedScript`" -RepoRoot `"$RepoRoot`""
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "SkillHub catalog sync (daily $Time local)" -Force | Out-Null
Get-ScheduledTaskInfo -TaskName $taskName | Select-Object TaskName, NextRunTime, LastTaskResult
