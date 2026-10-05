#!/usr/bin/env node
import { Command } from "commander"
import { layout, resolveHome } from "./paths.ts"
import { readCatalog, findRecord, whyLines, formatHit } from "./commands/read.ts"
import { searchSkills } from "./search.ts"
import { installSkill } from "./installer.ts"
import { readLockfile, upsertEntry, writeLockfile } from "./lockfile.ts"
import { activateSkill, deactivateSkill, planUpdate, applyUpdate, reviewSkill } from "./write-helpers.ts"
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
    if (record.status === "quarantined") throw new Error(`refusing to install quarantined skill: ${id}`)
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
    const plan = planUpdate(l, readCatalog(l), readLockfile(l.lockfilePath), id)
    if (!plan) return console.log(`${id} is up to date`)
    const { changes } = await reviewSkill({ plan, l, rawBase: process.env.SKILLHUB_RAW_BASE })
    console.log(opts.json ? JSON.stringify({ id, changes: changes.map((c) => ({ path: c.path, status: c.status })) }, null, 2) : changes.map((c) => `${c.status} ${c.path}`).join("\n"))
    console.log(`risk ${plan.riskDelta.from} -> ${plan.riskDelta.to}; score ${plan.scoreDelta.from} -> ${plan.scoreDelta.to}`)
  })

program
  .command("update")
  .argument("[id]")
  .option("--apply")
  .option("--json")
  .action(async (id: string | undefined, opts: { apply?: boolean; json?: boolean }) => {
    const l = store()
    const lock = readLockfile(l.lockfilePath)
    const targets = id ? [id] : Object.keys(lock.skills)
    for (const target of targets) {
      const plan = planUpdate(l, readCatalog(l), lock, target)
      if (!plan) {
        console.log(`${target}: up to date`)
        continue
      }
      if (!opts.apply) {
        console.log(`${target}: update available (re-run with --apply after review)`)
        continue
      }
      const entry = await applyUpdate({ plan, l, rawBase: process.env.SKILLHUB_RAW_BASE })
      console.log(`${target}: updated to ${entry.contentHash.slice(0, 12)} (risk ${entry.riskLevel})`)
    }
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

await program.parseAsync()
