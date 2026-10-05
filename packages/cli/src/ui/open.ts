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
