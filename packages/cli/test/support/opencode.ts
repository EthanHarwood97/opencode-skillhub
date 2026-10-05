import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

export function resolveOpencodeBin(): string | undefined {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN
  const probe = process.platform === "win32" ? spawnSync("where.exe", ["opencode"]) : spawnSync("which", ["opencode"])
  if (probe.status !== 0) return undefined
  const lines = probe.stdout.toString().split(/\r?\n/).filter(Boolean)
  const exe = lines.find((l) => l.toLowerCase().endsWith(".exe"))
  if (exe) return exe
  for (const line of lines) {
    const nested = join(dirname(line.replace(/\.(cmd|bat|ps1)$/i, "")), "node_modules", "opencode-ai", "bin", "opencode.exe")
    if (existsSync(nested)) return nested
  }
  return lines[0]
}

export function sandboxEnv(home: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENCODE_TEST_HOME: home,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    XDG_CACHE_HOME: join(home, ".cache"),
  }
}
