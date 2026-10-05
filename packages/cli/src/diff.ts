import { createTwoFilesPatch } from "diff"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import type { StoreLayout } from "./paths.ts"

export type FileChange = { path: string; status: "added" | "removed" | "modified"; patch?: string }

export function readStoreFiles(l: StoreLayout, id: string): { path: string; bytes: Uint8Array }[] {
  const root = join(l.storeDir, id)
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      return statSync(full).isDirectory() ? walk(full) : [relative(root, full).replace(/\\/g, "/")]
    })
  return walk(root).map((path) => ({ path, bytes: new Uint8Array(readFileSync(join(root, path))) }))
}

export function diffFiles(
  oldFiles: { path: string; bytes: Uint8Array }[],
  newFiles: { path: string; bytes: Uint8Array }[],
): FileChange[] {
  const oldMap = new Map(oldFiles.map((f) => [f.path, f.bytes]))
  const newMap = new Map(newFiles.map((f) => [f.path, f.bytes]))
  const paths = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort()
  const decoder = new TextDecoder()
  const changes: FileChange[] = []

  for (const path of paths) {
    const before = oldMap.get(path)
    const after = newMap.get(path)
    if (before && !after) changes.push({ path, status: "removed" })
    else if (!before && after) changes.push({ path, status: "added", patch: createTwoFilesPatch(path, path, "", decoder.decode(after)) })
    else if (before && after && Buffer.compare(Buffer.from(before), Buffer.from(after)) !== 0) {
      changes.push({ path, status: "modified", patch: createTwoFilesPatch(path, path, decoder.decode(before), decoder.decode(after)) })
    }
  }
  return changes
}
