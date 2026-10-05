import { join } from "node:path"

export function applyConfigToSkillHub(
  cfg: { skills?: any; command?: any },
  opts: { root: string },
): { addedSkillPath: boolean; addedCommand: boolean; addedDashboardCommand: boolean } {
  const managed = join(opts.root, "managed")
  cfg.skills = { ...(cfg.skills ?? {}) }
  const paths: string[] = Array.isArray(cfg.skills.paths) ? [...cfg.skills.paths] : []
  const addedSkillPath = !paths.includes(managed)
  if (addedSkillPath) paths.push(managed)
  cfg.skills.paths = paths

  cfg.command = { ...(cfg.command ?? {}) }
  const addedCommand = cfg.command.skills === undefined
  if (addedCommand) {
    cfg.command.skills = { description: "Show SkillHub status (active, updates, promotions, budget)", template: "SkillHub status request." }
  }
  const addedDashboardCommand = cfg.command.skillhub === undefined
  if (addedDashboardCommand) {
    cfg.command.skillhub = { description: "Open the SkillHub dashboard", template: "SkillHub dashboard request." }
  }
  return { addedSkillPath, addedCommand, addedDashboardCommand }
}
