import { layout, resolveHome, type StoreLayout } from "../../cli/src/paths.ts"

/** Resolve the SkillHub store root for the current environment. */
export function resolveRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.SKILLHUB_HOME ?? resolveHome(env)
}

/** Store layout (re-exported shape so the plugin has one import site). */
export function skillhubPaths(root: string): StoreLayout {
  return layout(root)
}
