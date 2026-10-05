export type StatusInput = {
  active: string[]
  installed: number
  updates: number
  proposals: { id: string; uses: number }[]
  demote: string[]
  l1Tokens: number
  l0Tokens: number
}

export function renderStatus(input: StatusInput): string {
  const total = input.l0Tokens + input.l1Tokens
  const lines = [
    `SkillHub — active ${input.active.length}/${input.installed} installed`,
    input.active.length ? `  active: ${input.active.join(", ")}` : "  active: (none)",
    `  updates available: ${input.updates}`,
    input.proposals.length ? `  promotion proposals: ${input.proposals.map((p) => `${p.id} (${p.uses} uses)`).join(", ")}` : "  promotion proposals: none",
    `  context budget: ${total}/1000 est. tokens (L0 ${input.l0Tokens} + L1 ${input.l1Tokens})${total > 1000 ? " ⚠ over budget" : ""}`,
    `  demote suggestions: ${input.demote.length ? input.demote.join(", ") : "none"}`,
  ]
  return lines.join("\n")
}

export function makeStartupNotifier(deps: {
  toast: (message: string, variant?: string) => Promise<void>
  compute: () => StatusInput
}) {
  let fired = false
  return {
    get fired() {
      return fired
    },
    async notifyOnce(): Promise<void> {
      if (fired) return
      fired = true
      const status = deps.compute()
      if (status.updates > 0) await deps.toast(`SkillHub: ${status.updates} updates available — run \`skillhub review\``, "warning")
      if (status.proposals.length > 0)
        await deps.toast(`SkillHub: ${status.proposals.length} skill(s) ready to promote — run /skills`, "info")
    },
  }
}
