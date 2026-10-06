import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Recursive copy that dereferences symlinks consistently across platforms and Node versions.
 * fs.cpSync({ dereference: true }) preserves directory symlinks on Node >= 22.23, which would
 * put broken links into the store/managed copies of adopted skills. Broken links are skipped,
 * matching the adoption file walk.
 */
export const copyTreeDeref = (src: string, dest: string): void => {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    let stats
    try {
      stats = statSync(from) // follows symlinks; throws on broken links
    } catch {
      continue
    }
    if (stats.isDirectory()) copyTreeDeref(from, to)
    else if (stats.isFile()) copyFileSync(from, to)
  }
}
