import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import type { Candidate, CandidateFile } from "./types.ts"

const walk = (root: string, dir = root): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(root, full) : [relative(root, full).replace(/\\/g, "/")]
  })

export function loadFixtureCandidates(root: string): Candidate[] {
  return readdirSync(root)
    .filter((entry) => statSync(join(root, entry)).isDirectory())
    .map((dirName) => {
      const files: CandidateFile[] = walk(join(root, dirName)).map((path) => {
        const content = readFileSync(join(root, dirName, path), "utf8")
        return { path: `${dirName}/${path}`, content, size: Buffer.byteLength(content) }
      })
      return {
        source: { kind: "local" as const, path: `${dirName}/SKILL.md`, license: "MIT", licenseFlags: [] },
        name: dirName,
        dir: dirName,
        tags: [dirName.split("-")[0] ?? dirName],
        signals: {},
        files,
      }
    })
}
