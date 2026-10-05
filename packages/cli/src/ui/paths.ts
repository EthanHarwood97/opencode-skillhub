import { existsSync } from "node:fs"
import { join } from "node:path"

/** Locate the built UI bundle. Checks SKILLHUB_UI_DIST, then packages/ui/dist relative to this file. */
export function resolveUiDist(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const candidates = [env.SKILLHUB_UI_DIST, join(import.meta.dirname, "..", "..", "..", "ui", "dist")]
  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, "index.html"))) return candidate
  }
  return undefined
}
