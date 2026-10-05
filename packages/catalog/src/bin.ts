import { parseArgs } from "node:util"
import { buildCatalog } from "./build.ts"
import { loadFixtureCandidates } from "./sources/fixtures.ts"

const { values } = parseArgs({
  options: {
    fixtures: { type: "string" },
    out: { type: "string", default: "catalog" },
  },
})

if (!values.fixtures) {
  console.error("usage: catalog:build --fixtures <skills-dir> [--out <dir>]")
  process.exit(2)
}

const { summary, index } = buildCatalog({
  candidates: loadFixtureCandidates(values.fixtures),
  outDir: values.out,
})

console.log(`catalog: ${index.counts.total} records (${summary.published} published, ${summary.quarantined} quarantined)`)
for (const r of summary.rejected) console.log(`  rejected ${r.name}: ${r.reason}`)
