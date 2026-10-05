#!/usr/bin/env node
import { Command } from "commander"
import { layout, resolveHome } from "./paths.ts"
import { readCatalog, findRecord, whyLines, formatHit } from "./commands/read.ts"
import { searchSkills } from "./search.ts"
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

await program.parseAsync()
