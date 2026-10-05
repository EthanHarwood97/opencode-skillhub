# SkillHub Steroids v1 — Slice 1: Dashboard Button + Lazy Server + 03:00 Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/skillhub` in opencode ensures the dashboard server is running (lazy) and opens it in the browser; a Windows Scheduled Task syncs the catalog daily at 03:00 local (UK) into the real store, unattended and logged.

**Architecture:** Three small seams, each with injected dependencies so behaviour is unit-testable under Node (no real servers, no real browser, no real scheduler in tests):
- `packages/cli/src/ui/open.ts` — platform browser opener extracted from `bin.ts` (one implementation, two callers).
- `packages/plugin/src/dashboard-core.ts` — `ensureDashboard()` (probe `/api/status` → reuse; else start) and `makeDashboardCommand()` (command handler). The plugin supplies real `startUiServer`/`openBrowser`/`resolveUiDist`.
- `scripts/sync-task.ps1` + `scripts/register-sync-task.ps1` — the daily sync wrapper and its Windows Task Scheduler registration; the wrapper is copied into the SkillHub home so the task survives repo moves and worktree removal.

**Tech Stack:** Node ≥ 22.23 (strip-only TS), opencode plugin runtime (Bun), existing `startUiServer` (`packages/cli/src/ui/server.ts`), Windows Task Scheduler via PowerShell 7. No new dependencies.

**Spec/roadmap:** `docs/superpowers/plans/2026-10-05-skillhub-steroids-v1-roadmap.md` (Slice 1).

## Global Constraints

- Node strip-only for `.ts` under `packages/cli`, `packages/catalog`, `packages/plugin`: no enums, no parameter properties; relative imports end in `.ts`.
- Zero new dependencies. Plugin imports of cli sources must stay runtime-safe under Bun (node:http/fs fine; no DOM).
- The dashboard binds 127.0.0.1 only; the command never opens a non-loopback URL.
- User-visible strings are pinned in this plan (copy rules: plain, says what happened and what to do next).
- Conventional commits; work happens in `.worktrees/steroids-v1`.
- Tests run with `npx vitest run <file>`; typecheck with `npm run typecheck`.

---

### Task 1: Extract `openBrowser` into a shared CLI helper

**Files:**
- Create: `packages/cli/src/ui/open.ts`
- Modify: `packages/cli/src/bin.ts` (remove the local helper and the now-unused `spawn` import)
- Test: `packages/cli/test/ui-open.test.ts`

**Interfaces:**
- Produces: `browserCommand(url, platform?): { command, args }`; `openBrowser(url, deps?: { platform?; spawnImpl? }): void`.

- [ ] **Step 1: Write the failing test**

`packages/cli/test/ui-open.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { browserCommand, openBrowser } from "../src/ui/open.ts"

describe("browserCommand", () => {
  it("selects the platform opener", () => {
    expect(browserCommand("http://x/", "win32")).toEqual({ command: "cmd", args: ["/c", "start", "", "http://x/"] })
    expect(browserCommand("http://x/", "darwin")).toEqual({ command: "open", args: ["http://x/"] })
    expect(browserCommand("http://x/", "linux")).toEqual({ command: "xdg-open", args: ["http://x/"] })
  })
})

describe("openBrowser", () => {
  it("spawns detached and unrefs", () => {
    const records: { command: string; args: string[]; options: unknown; unref: boolean }[] = []
    openBrowser("http://x/", {
      platform: "win32",
      spawnImpl: (command, args, options) => {
        const record = { command, args, options, unref: false }
        records.push(record)
        return { unref: () => { record.unref = true } }
      },
    })
    expect(records).toHaveLength(1)
    expect(records[0]!.command).toBe("cmd")
    expect(records[0]!.options).toEqual({ detached: true, stdio: "ignore" })
    expect(records[0]!.unref).toBe(true)
  })
})
```

- [ ] **Step 2: Run it, confirm it fails** (cannot resolve `../src/ui/open.ts`).

- [ ] **Step 3: Implement open.ts**

```ts
import { spawn } from "node:child_process"

export type SpawnLike = (command: string, args: string[], options: { detached: boolean; stdio: "ignore" }) => { unref: () => void }

export function browserCommand(url: string, platform: NodeJS.Platform = process.platform): { command: string; args: string[] } {
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] }
  if (platform === "darwin") return { command: "open", args: [url] }
  return { command: "xdg-open", args: [url] }
}

export function openBrowser(url: string, deps: { platform?: NodeJS.Platform; spawnImpl?: SpawnLike } = {}): void {
  const { command, args } = browserCommand(url, deps.platform ?? process.platform)
  const spawnImpl = deps.spawnImpl ?? (spawn as unknown as SpawnLike)
  spawnImpl(command, args, { detached: true, stdio: "ignore" }).unref()
}
```

- [ ] **Step 4: Point bin.ts at the helper**

In `packages/cli/src/bin.ts`: delete the local `const openBrowser = (url: string): void => { ... }` block and remove `import { spawn } from "node:child_process"` (no other use remains). Add `import { openBrowser } from "./ui/open.ts"`. Verify `ui`, `install`, and other commands still compile.

- [ ] **Step 5: Run the test + typecheck, commit**

Run: `npx vitest run packages/cli/test/ui-open.test.ts && npm run typecheck`
Commit: `refactor(cli): extract platform browser opener into shared helper`

---

### Task 2: Plugin dashboard core — ensure + open (testable seams)

**Files:**
- Create: `packages/plugin/src/dashboard-core.ts`
- Test: `packages/plugin/test/dashboard-core.test.ts`

**Interfaces:**
- `type EnsureDashboardResult = { url: string; started: boolean } | { error: string }`
- `ensureDashboard(opts: { root; uiDist: string | undefined; port; start: (opts) => Promise<{ url }>; fetchImpl?; timeoutMs? }): Promise<EnsureDashboardResult>`
- `makeDashboardCommand(opts: { ensure: () => Promise<EnsureDashboardResult>; open: (url: string) => void }): (output: { parts: unknown[] }) => Promise<void>`

- [ ] **Step 1: Write the failing tests**

`packages/plugin/test/dashboard-core.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ensureDashboard, makeDashboardCommand } from "../src/dashboard-core.ts"

const healthy = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
const refused = (async () => {
  throw new Error("ECONNREFUSED")
}) as unknown as typeof fetch

describe("ensureDashboard", () => {
  it("reuses a healthy server without starting one", async () => {
    let started = 0
    const result = await ensureDashboard({
      root: "C:/root",
      uiDist: "C:/dist",
      port: 4517,
      fetchImpl: healthy,
      start: async () => {
        started++
        return { url: "http://x/" }
      },
    })
    expect(result).toEqual({ url: "http://127.0.0.1:4517/", started: false })
    expect(started).toBe(0)
  })

  it("starts the server when the probe fails and returns its url", async () => {
    const calls: { root: string; uiDist: string; port: number }[] = []
    const result = await ensureDashboard({
      root: "C:/root",
      uiDist: "C:/dist",
      port: 4517,
      fetchImpl: refused,
      start: async (opts) => {
        calls.push(opts)
        return { url: "http://127.0.0.1:4517/" }
      },
    })
    expect(result).toEqual({ url: "http://127.0.0.1:4517/", started: true })
    expect(calls).toEqual([{ root: "C:/root", uiDist: "C:/dist", port: 4517 }])
  })

  it("explains a missing build instead of starting", async () => {
    const result = await ensureDashboard({ root: "C:/root", uiDist: undefined, port: 4517, fetchImpl: refused, start: async () => ({ url: "http://x/" }) })
    expect(result).toEqual({ error: 'UI is not built — run "npm run ui:build" first' })
  })

  it("surfaces a start failure", async () => {
    const result = await ensureDashboard({
      root: "C:/root",
      uiDist: "C:/dist",
      port: 4517,
      fetchImpl: refused,
      start: async () => {
        throw new Error("port 4517 busy")
      },
    })
    expect(result).toEqual({ error: "could not start the dashboard: port 4517 busy" })
  })
})

describe("makeDashboardCommand", () => {
  it("opens the url and reports it", async () => {
    const opened: string[] = []
    const output = { parts: [] as unknown[] }
    const run = makeDashboardCommand({ ensure: async () => ({ url: "http://127.0.0.1:4517/", started: true }), open: (url) => void opened.push(url) })
    await run(output)
    expect(opened).toEqual(["http://127.0.0.1:4517/"])
    expect(output.parts[0]).toEqual({ type: "text", text: "SkillHub dashboard: http://127.0.0.1:4517/ (started just now) — opened in your browser." })
  })

  it("does not open anything on error and explains why", async () => {
    const opened: string[] = []
    const output = { parts: [] as unknown[] }
    const run = makeDashboardCommand({ ensure: async () => ({ error: "port busy" }), open: (url) => void opened.push(url) })
    await run(output)
    expect(opened).toEqual([])
    expect(output.parts[0]).toEqual({ type: "text", text: "SkillHub dashboard: port busy" })
  })
})
```

- [ ] **Step 2: Run it, confirm it fails** (cannot resolve `../src/dashboard-core.ts`).

- [ ] **Step 3: Implement dashboard-core.ts**

```ts
export type EnsureDashboardResult = { url: string; started: boolean } | { error: string }

export type EnsureDashboardOptions = {
  root: string
  uiDist: string | undefined
  port: number
  start: (opts: { root: string; uiDist: string; port: number }) => Promise<{ url: string }>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const probe = async (fetchImpl: typeof fetch, port: number, timeoutMs: number): Promise<boolean> => {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

/** Reuse a healthy local dashboard, otherwise start it. */
export async function ensureDashboard(opts: EnsureDashboardOptions): Promise<EnsureDashboardResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 800
  if (await probe(fetchImpl, opts.port, timeoutMs)) {
    return { url: `http://127.0.0.1:${opts.port}/`, started: false }
  }
  if (!opts.uiDist) return { error: 'UI is not built — run "npm run ui:build" first' }
  try {
    const server = await opts.start({ root: opts.root, uiDist: opts.uiDist, port: opts.port })
    return { url: server.url, started: true }
  } catch (error) {
    return { error: `could not start the dashboard: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Command handler factory for the /skillhub command. */
export function makeDashboardCommand(opts: { ensure: () => Promise<EnsureDashboardResult>; open: (url: string) => void }) {
  return async (output: { parts: unknown[] }): Promise<void> => {
    const result = await opts.ensure()
    if ("error" in result) {
      output.parts.push({ type: "text", text: `SkillHub dashboard: ${result.error}` })
      return
    }
    opts.open(result.url)
    output.parts.push({
      type: "text",
      text: `SkillHub dashboard: ${result.url}${result.started ? " (started just now)" : ""} — opened in your browser.`,
    })
  }
}
```

- [ ] **Step 4: Run tests + typecheck, commit**

Run: `npx vitest run packages/plugin/test/dashboard-core.test.ts && npm run typecheck`
Commit: `feat(plugin): lazily ensure and open the dashboard (testable core)`

---

### Task 3: Wire the `/skillhub` command into the plugin

**Files:**
- Modify: `packages/plugin/src/config-hook.ts` (register the command)
- Modify: `packages/plugin/src/plugin.ts` (intercept it with real deps)
- Modify: `packages/plugin/test/status.test.ts` (extend the config-hook suite)

**Interfaces:**
- `applyConfigToSkillHub` additionally registers `cfg.command.skillhub = { description: "Open the SkillHub dashboard", template: "SkillHub dashboard request." }` and returns `addedDashboardCommand`.
- `plugin.ts` builds a lazy singleton: probe/start via `ensureDashboard({ root, uiDist: resolveUiDist(), port: 4517, start: startUiServer })`; opens via `openBrowser`.

- [ ] **Step 1: Extend the config-hook test (failing first)**

Append to `packages/plugin/test/status.test.ts` inside the `applyConfigToSkillHub` describe:

```ts
  it("adds the /skillhub command but never overwrites an existing one", () => {
    const cfg: any = {}
    applyConfigToSkillHub(cfg, { root: "C:/root" })
    expect(cfg.command.skillhub.template).toBeTruthy()
    cfg.command.skillhub = { description: "custom", template: "custom" }
    applyConfigToSkillHub(cfg, { root: "C:/root" })
    expect(cfg.command.skillhub.template).toBe("custom")
  })
```

Run it: fails (`cfg.command.skillhub` undefined).

- [ ] **Step 2: Update config-hook.ts**

```ts
import { join } from "node:path"

export function applyConfigToSkillHub(
  cfg: { skills?: any; command?: any },
  opts: { root: string },
): { addedSkillPath: boolean; addedCommand: boolean; addedDashboardCommand: boolean } {
  const managed = join(opts.root, "managed")
  cfg.skills = { ...(cfg.skills ?? {}) }
  const paths: string[] = Array.isArray(cfg.skills.paths) ? [...cfg.skills.paths] : []
  const addedSkillPath = !paths.includes(managed)
  if (addedSkillPath) paths.push(managed)
  cfg.skills.paths = paths

  cfg.command = { ...(cfg.command ?? {}) }
  const addedCommand = cfg.command.skills === undefined
  if (addedCommand) {
    cfg.command.skills = { description: "Show SkillHub status (active, updates, promotions, budget)", template: "SkillHub status request." }
  }
  const addedDashboardCommand = cfg.command.skillhub === undefined
  if (addedDashboardCommand) {
    cfg.command.skillhub = { description: "Open the SkillHub dashboard", template: "SkillHub dashboard request." }
  }
  return { addedSkillPath, addedCommand, addedDashboardCommand }
}
```

- [ ] **Step 3: Wire plugin.ts**

Add imports:

```ts
import { openBrowser } from "../../cli/src/ui/open.ts"
import { resolveUiDist } from "../../cli/src/ui/paths.ts"
import { startUiServer } from "../../cli/src/ui/server.ts"
import { ensureDashboard, makeDashboardCommand, type EnsureDashboardResult } from "./dashboard-core.ts"
```

Inside `SkillHubPlugin`, after `const root = resolveRoot()`:

```ts
  let dashboardResult: Promise<EnsureDashboardResult> | undefined
  const ensure = () =>
    (dashboardResult ??= ensureDashboard({ root, uiDist: resolveUiDist(), port: 4517, start: startUiServer }))
  const dashboardCommand = makeDashboardCommand({ ensure, open: openBrowser })
```

Extend the command hook:

```ts
    "command.execute.before": async (input, output) => {
      if (input.command === "skills") {
        output.parts.push({ type: "text", text: renderStatus(collectStatus(root, directory, new Date())) } as any)
      }
      if (input.command === "skillhub") {
        await dashboardCommand(output as { parts: unknown[] })
      }
    },
```

- [ ] **Step 4: Run tests + typecheck, commit**

Run: `npx vitest run packages/plugin/test/status.test.ts packages/plugin/test/dashboard-core.test.ts`
Run: `npm run typecheck`
Commit: `feat(plugin): /skillhub command opens the dashboard`

---

### Task 4: Daily 03:00 UK sync task

**Files:**
- Create: `scripts/sync-task.ps1`
- Create: `scripts/register-sync-task.ps1`

**Interfaces:**
- `sync-task.ps1 [-RepoRoot <path>]` — runs the sync against the real store, appends to `<home>/logs/sync-YYYY-MM-DD.log`, keeps 14 logs, exits with the sync's code.
- `register-sync-task.ps1 [-RepoRoot <path>] [-Time "03:00"] [-DryRun] [-Remove]` — copies `sync-task.ps1` into `<home>/sync-task.ps1` (so the task survives repo moves/worktree removal) and registers the task `SkillHub Catalog Sync`.

- [ ] **Step 1: Write sync-task.ps1**

```powershell
# SkillHub catalog sync. Run by the "SkillHub Catalog Sync" scheduled task (daily 03:00 local).
param([string]$RepoRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"

$skillhome = if ($env:SKILLHUB_HOME) { $env:SKILLHUB_HOME } else { Join-Path $HOME ".config\opencode\.skillhub" }
$logdir = Join-Path $skillhome "logs"
New-Item -ItemType Directory -Force $logdir | Out-Null
$log = Join-Path $logdir ("sync-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

"[{0}] sync start (repo: {1})" -f (Get-Date -Format o), $RepoRoot | Add-Content $log
& node (Join-Path $RepoRoot "packages\catalog\src\sync-bin.ts") `
  --topics "claude-skills,opencode-skills" `
  --max-repos 6 --max-skills 5 `
  --agentskills "https://agentskills.codes" --agentskills-limit 30 `
  --out (Join-Path $skillhome "catalog") --state (Join-Path $skillhome "catalog\state") *>> $log
$code = $LASTEXITCODE
"[{0}] sync exit {1}" -f (Get-Date -Format o), $code | Add-Content $log

Get-ChildItem $logdir -Filter "sync-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force -ErrorAction SilentlyContinue
exit $code
```

- [ ] **Step 2: Write register-sync-task.ps1**

```powershell
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
```

- [ ] **Step 3: Dry-run, then register for real (pointing at the main checkout)**

Run: `pwsh -NoProfile -File scripts/register-sync-task.ps1 -RepoRoot "E:\Users\ethan\Desktop\SkillHub" -DryRun`
Check the printed program/args point at `<home>\sync-task.ps1` and the main repo.

Run: `pwsh -NoProfile -File scripts/register-sync-task.ps1 -RepoRoot "E:\Users\ethan\Desktop\SkillHub"`
Expected: task info prints with `NextRunTime` at 03:00. If registration is refused for permissions, register from an elevated shell with the same command and record that in the report (do not silently skip).

Verify timezone: `Get-TimeZone | Select-Object Id, DisplayName` — confirm UK (`GMT Standard Time`). If not UK, record it; 03:00 is local time by design.

- [ ] **Step 4: Run it once now and verify**

Run: `Start-ScheduledTask -TaskName "SkillHub Catalog Sync"`
Then wait ~2 minutes and check:
`Get-ScheduledTaskInfo -TaskName "SkillHub Catalog Sync" | Select-Object LastRunTime, LastTaskResult`
`Get-Content "$HOME\.config\opencode\.skillhub\logs\sync-$(Get-Date -Format yyyy-MM-dd).log" -Tail 8`
`(Get-Item "$HOME\.config\opencode\.skillhub\catalog\index.json").LastWriteTime`
Expected: `LastTaskResult` 0; log ends with `sync exit 0`; `index.json` mtime is fresh. (`LastRunTime` may lag a schedule tick — the log + mtime are the evidence.)

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-task.ps1 scripts/register-sync-task.ps1
git commit -m "feat(scripts): daily 03:00 catalog sync task with registration helper"
```

---

### Task 5: Acceptance

- [ ] `npx vitest run packages/cli/test/ui-open.test.ts packages/plugin/test/dashboard-core.test.ts packages/plugin/test/status.test.ts` — all green.
- [ ] `npm test` and `npm run typecheck` — clean (full suite unchanged otherwise).
- [ ] Task registered: `Get-ScheduledTask -TaskName "SkillHub Catalog Sync"` shows Ready; `NextRunTime` at 03:00; the task runs the hosted copy at `<home>\sync-task.ps1`.
- [ ] One manual `Start-ScheduledTask` run produced `sync exit 0` and a fresh `catalog/index.json`.
- [ ] Smoke (manual, optional): `opencode run --command skillhub -m deepseek/deepseek-flash "Reply ok"` — dashboard opens (or reuses the running one) and the message contains the URL. Record the outcome; if the running dashboard from earlier is still up, expect the reuse branch (`started` absent).
- [ ] Commit any plan/report updates; report includes: task registration output, timezone shown, log tail, and whether the smoke ran.

## Notes for later slices (do not build here)

- Slice 2 replaces the lazy-by-command model with retrieval-driven loads; the ensure/open seams stay unchanged.
- Packaging (Slice 5) replaces `-RepoRoot` with the installed location and moves the task registration into the installer.

## Implementation notes (as shipped)

- The command is `/skillhub`; it is registered by `applyConfigToSkillHub` and never overwrites an existing command of the same name.
- `makeLazyEnsure` caches usable results only: an `{ error }` result or a rejected load evicts the memo so the next `/skillhub` retries; concurrent calls while a load is in flight share that single load.
- Probe is a listener check, not a health check: any HTTP response (including an `/api/status` 404 when the catalog is not yet synced) counts as up and is reused; only a thrown error/timeout starts a new server and risks EADDRINUSE.
- Cold-start acceptance was verified in-process on 2026-10-05: with port 4517 free, `command.execute.before` produced `SkillHub dashboard: http://127.0.0.1:4517/ (started just now) — opened in your browser.` and `/api/status` answered 200 in 46 ms.
- The true-Bun, real-profile smoke runs post-merge in `opencode run --command skillhub`; the Node in-process harness cannot prove Bun runtime behaviour.
