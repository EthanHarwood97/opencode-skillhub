#!/usr/bin/env node
import { Command } from "commander"
import { layout, resolveHome } from "./paths.ts"
import { readCatalog, findRecord, whyLines, formatHit } from "./commands/read.ts"
import { importCatalog } from "./catalog-cache.ts"
import { searchSkills } from "./search.ts"
import { installSkill } from "./installer.ts"
import { readLockfile, upsertEntry, writeLockfile } from "./lockfile.ts"
import { activateSkill, deactivateSkill, planUpdate, applyUpdate, reviewSkill, findingRules } from "./write-helpers.ts"
import { applyCalibration, formatTrending, readTrending, runCalibrate, runLabelExport, runLabelImport } from "./commands/depth.ts"
import { resolveUiDist } from "./ui/paths.ts"
import { startUiServer } from "./ui/server.ts"
import { exportStaticSite } from "./ui/export.ts"
import { openBrowser } from "./ui/open.ts"
import { join } from "node:path"

const program = new Command("skillhub").option("--root <dir>", "SkillHub home (defaults to SKILLHUB_HOME)")

const store = () => layout(program.opts().root ?? resolveHome())

program
  .command("search")
  .argument("<query>")
  .option("--json", "machine-readable output")
  .option("--limit <n>", "max results", "5")
  .action((query: string, opts: { json?: boolean; limit: string }) => {
    const hits = searchSkills(join(store().catalogDir, "search.db"), query, { limit: Number(opts.limit) })
    console.log(opts.json ? JSON.stringify(hits, null, 2) : hits.map(formatHit).join("\n") || "no matches")
  })

program
  .command("info")
  .argument("<id>")
  .option("--json", "machine-readable output")
  .action((id: string, opts: { json?: boolean }) => {
    const record = findRecord(readCatalog(store()), id)
    if (!record) throw new Error(`skill not found: ${id}`)
    console.log(opts.json ? JSON.stringify(record, null, 2) : whyLines(record).join("\n"))
  })

program
  .command("why")
  .argument("<id>")
  .option("--json", "machine-readable output")
  .action((id: string, opts: { json?: boolean }) => {
    const record = findRecord(readCatalog(store()), id)
    if (!record) throw new Error(`skill not found: ${id}`)
    console.log(opts.json ? JSON.stringify(record.scores, null, 2) : whyLines(record).join("\n"))
  })

program
  .command("list")
  .option("--category <c>")
  .option("--json", "machine-readable output")
  .action((opts: { category?: string; json?: boolean }) => {
    const index = readCatalog(store())
    const skills = index.skills.filter((s) => !opts.category || s.category === opts.category)
    console.log(
      opts.json
        ? JSON.stringify(skills.map((s) => ({ id: s.id, name: s.name, total: s.scores.total, category: s.category, status: s.status })), null, 2)
        : skills.map((s) => `${s.id}  [${s.scores.total}] ${s.category} ${s.status}`).join("\n"),
    )
  })

program
  .command("install")
  .argument("<id>")
  .option("--dry-run")
  .option("--activate")
  .action(async (id: string, opts: { dryRun?: boolean; activate?: boolean }) => {
    const l = store()
    const index = readCatalog(l)
    const record = findRecord(index, id)
    if (!record) throw new Error(`skill not found in catalog: ${id}`)
    if (record.status !== "candidate") throw new Error(`refusing to install ${record.status} skill: ${id}`)
    const entry = await installSkill({ record, l, rawBase: process.env.SKILLHUB_RAW_BASE, dryRun: opts.dryRun })
    if (!opts.dryRun) writeLockfile(l.lockfilePath, upsertEntry(readLockfile(l.lockfilePath), entry))
    if (opts.activate) activateSkill(l, id)
    console.log(`${opts.dryRun ? "verified" : "installed"} ${id} (${entry.provenanceTier}, risk ${entry.riskLevel})`)
  })

program
  .command("review")
  .argument("<id>")
  .option("--json")
  .action(async (id: string, opts: { json?: boolean }) => {
    const l = store()
    const result = planUpdate(l, readCatalog(l), readLockfile(l.lockfilePath), id)
    if (result.kind === "not-installed") {
      if (opts.json) console.log(JSON.stringify({ id, status: "not-installed" }))
      else console.log(`${id} is not installed`)
      return
    }
    if (result.kind === "up-to-date") {
      if (opts.json) console.log(JSON.stringify({ id, status: "up-to-date" }))
      else console.log(`${id} is up to date`)
      return
    }
    if (result.kind === "blocked") {
      const findings = findingRules(result.record)
      if (opts.json) console.log(JSON.stringify({ id, status: "blocked", riskLevel: result.record.risk.level, findings }, null, 2))
      else console.log(`${id}: blocked (status ${result.record.status}; findings: ${findings.join(", ") || "none"})`)
      return
    }
    const { changes } = await reviewSkill({ plan: result.plan, l, rawBase: process.env.SKILLHUB_RAW_BASE })
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            id,
            status: "update-available",
            changes: changes.map((c) => ({ path: c.path, status: c.status, patch: c.patch })),
            riskDelta: result.plan.riskDelta,
            scoreDelta: result.plan.scoreDelta,
          },
          null,
          2,
        ),
      )
      return
    }
    for (const change of changes) {
      console.log(`${change.status} ${change.path}`)
      if (change.patch) console.log(change.patch)
    }
    console.log(`risk ${result.plan.riskDelta.from} -> ${result.plan.riskDelta.to}; score ${result.plan.scoreDelta.from} -> ${result.plan.scoreDelta.to}`)
  })

program
  .command("update")
  .argument("[id]")
  .option("--apply")
  .option("--json")
  .action(async (id: string | undefined, opts: { apply?: boolean; json?: boolean }) => {
    const l = store()
    const lock = readLockfile(l.lockfilePath)
    const index = readCatalog(l)
    const targets = id ? [id] : Object.keys(lock.skills)
    const results: { id: string; status: "not-installed" | "up-to-date" | "update-available" | "updated" | "blocked"; contentHash?: string; riskLevel?: string; findings?: string[] }[] = []
    for (const target of targets) {
      const result = planUpdate(l, index, lock, target)
      if (result.kind === "not-installed") {
        if (opts.json) results.push({ id: target, status: "not-installed" })
        else console.log(`${target}: not installed`)
        continue
      }
      if (result.kind === "up-to-date") {
        if (opts.json) results.push({ id: target, status: "up-to-date" })
        else console.log(`${target}: up to date`)
        continue
      }
      if (result.kind === "blocked") {
        const findings = findingRules(result.record)
        if (opts.json) results.push({ id: target, status: "blocked", riskLevel: result.record.risk.level, findings })
        else console.log(`${target}: blocked (status ${result.record.status}; findings: ${findings.join(", ") || "none"})`)
        continue
      }
      if (!opts.apply) {
        if (opts.json) results.push({ id: target, status: "update-available" })
        else console.log(`${target}: update available (re-run with --apply after review)`)
        continue
      }
      const entry = await applyUpdate({ plan: result.plan, l, rawBase: process.env.SKILLHUB_RAW_BASE })
      if (opts.json) results.push({ id: target, status: "updated", contentHash: entry.contentHash, riskLevel: entry.riskLevel })
      else console.log(`${target}: updated to ${entry.contentHash.slice(0, 12)} (risk ${entry.riskLevel})`)
    }
    if (opts.json) console.log(JSON.stringify(results, null, 2))
  })

program.command("activate").argument("<id>").action((id: string) => {
  const l = store()
  activateSkill(l, id)
  console.log(`activated ${id} — restart opencode for skills.paths to re-resolve`)
})

program.command("deactivate").argument("<id>").action((id: string) => {
  const l = store()
  deactivateSkill(l, id)
  console.log(`deactivated ${id}`)
})

program
  .command("ui")
  .description("Open the local SkillHub dashboard")
  .option("--port <n>", "port to listen on", "4517")
  .option("--no-open", "do not open a browser")
  .option("--export <dir>", "write a read-only static gallery and exit")
  .option("--catalog-dir <dir>", "catalog artifacts directory for export (defaults to the store catalog)")
  .option("--max-records <n>", "max records in a static export", "5000")
  .option("--force", "replace the export target if it already exists")
  .action(async (opts: { port: string; open: boolean; export?: string; catalogDir?: string; maxRecords: string; force?: boolean }) => {
    const l = store()
    const uiDist = resolveUiDist()
    if (!uiDist) throw new Error('UI is not built — run "npm run ui:build" first')
    if (opts.export) {
      const result = exportStaticSite({ l, outDir: opts.export, uiDist, catalogDir: opts.catalogDir, maxRecords: Number(opts.maxRecords), force: opts.force })
      console.log(`exported ${result.skills} skill(s) to ${result.outDir} (${Math.round(result.bytes / 1024)} KiB)`)
      for (const warning of result.warnings) console.log(`  warning: ${warning}`)
      return
    }
    const server = await startUiServer({ root: l.root, uiDist, port: Number(opts.port), catalogDir: l.catalogDir })
    console.log(`SkillHub dashboard: ${server.url}`)
    if (opts.open) openBrowser(server.url)
  })

const catalogCommand = program.command("catalog")
catalogCommand
  .command("import")
  .argument("<dir>")
  .action((dir: string) => {
    importCatalog(dir, store())
    console.log(`imported catalog from ${dir}`)
  })

program
  .command("calibrate")
  .option("--golden <file>", "golden set JSON file", "golden.json")
  .option("--json", "machine-readable output")
  .option("--apply", "write catalog/calibration.json")
  .action((opts: { golden: string; json?: boolean; apply?: boolean }) => {
    const result = runCalibrate(store(), opts.golden)
    const path = opts.apply ? applyCalibration(store(), result) : undefined
    if (opts.json) {
      console.log(JSON.stringify({ ...result, applied: path }, null, 2))
    } else {
      console.log(`golden set: ${result.goldenSize} labels; agreement ${result.agreement.toFixed(3)} (baseline ${result.baselineAgreement.toFixed(3)}), grid ${result.gridSize}`)
      console.log(`weights: ${JSON.stringify(result.weights)}`)
      if (path) console.log(`applied -> ${path}`)
    }
  })

const labelCommand = program.command("label")
labelCommand
  .command("export")
  .option("--out <file>", "worksheet path", "label-worksheet.tsv")
  .option("--limit <n>", "sample size", "40")
  .action((opts: { out: string; limit: string }) => {
    const count = runLabelExport(store(), opts.out, Number(opts.limit))
    console.log(`wrote ${count} candidate(s) to ${opts.out} — fill the tier column (1=best … 4=weak), then run: skillhub label import ${opts.out}`)
  })
labelCommand
  .command("import")
  .argument("<tsv>")
  .option("--out <file>", "golden set output", "golden.json")
  .action((tsv: string, opts: { out: string }) => {
    const count = runLabelImport(tsv, opts.out)
    console.log(`imported ${count} label(s) -> ${opts.out}`)
  })

program
  .command("trending")
  .option("--json", "machine-readable output")
  .action((opts: { json?: boolean }) => {
    const file = readTrending(store())
    if (!file) throw new Error("no trending.json in the store catalog — run `npm run catalog:sync` first")
    console.log(opts.json ? JSON.stringify(file, null, 2) : formatTrending(file))
  })

await program.parseAsync()
