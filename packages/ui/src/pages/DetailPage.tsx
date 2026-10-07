import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link, useParams } from "react-router"
import { Modal } from "../components/Modal.tsx"
import { UpdateReviewModal } from "../components/UpdateReviewModal.tsx"
import { Button, Chip, ErrorState, ScoreMeter, Skeleton } from "../components/primitives.tsx"
import { useToast } from "../components/toast.tsx"
import { installSkillAction, isLive, getSkill, setActive } from "../lib/api.ts"
import { categoryLabel, formatBytes, formatNumber, labelName, relativeTime, statusLabel } from "../lib/format.ts"
import styles from "./DetailPage.module.css"

const SCORE_PARTS = ["quality", "trust", "freshness", "compatibility", "adoption"] as const

export default function DetailPage() {
  const params = useParams()
  const id = params["*"] ?? ""
  const live = isLive()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [installOpen, setInstallOpen] = useState(false)
  const [confirmActive, setConfirmActive] = useState<boolean | undefined>(undefined)
  const [updateOpen, setUpdateOpen] = useState(false)

  const { data: skill, isPending, isError, error, refetch } = useQuery({ queryKey: ["skill", id], queryFn: () => getSkill(id), enabled: id.length > 0 })

  const verify = useQuery({
    queryKey: ["install-verify", id],
    queryFn: () => installSkillAction(id, true),
    enabled: installOpen && live,
    retry: false,
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["skill", id] }),
      queryClient.invalidateQueries({ queryKey: ["skills"] }),
      queryClient.invalidateQueries({ queryKey: ["status"] }),
      queryClient.invalidateQueries({ queryKey: ["review"] }),
    ])
  }

  const install = useMutation({
    mutationFn: () => installSkillAction(id, false),
    onSuccess: async () => {
      setInstallOpen(false)
      toast(`Installed ${skill?.name ?? id}. Activate it to load it in opencode.`, "success")
      await invalidate()
    },
    onError: (mutationError) => toast(mutationError instanceof Error ? mutationError.message : "install failed", "error"),
  })

  const toggleActive = useMutation({
    mutationFn: (active: boolean) => setActive(id, active),
    onSuccess: async (_result, active) => {
      setConfirmActive(undefined)
      toast(active ? `Activated ${skill?.name ?? id}. Restart opencode to pick it up.` : `Deactivated ${skill?.name ?? id}.`, "success")
      await invalidate()
    },
    onError: (mutationError) => toast(mutationError instanceof Error ? mutationError.message : "action failed", "error"),
  })

  if (isPending) {
    return (
      <div className="stack">
        <Skeleton height={180} />
        <Skeleton height={220} />
      </div>
    )
  }
  if (isError || !skill) {
    return (
      <ErrorState title="Couldn't load this skill." retry={() => void refetch()}>
        <p>{error instanceof Error ? error.message : "The catalog may have changed since this link was made."}</p>
      </ErrorState>
    )
  }

  return (
    <article className="stack">
      <header className={styles.head}>
        <div className={styles.headMain}>
          <span className="eyebrow">Specimen sheet · {categoryLabel(skill.category)}</span>
          <h1>{skill.name}</h1>
          <p className={styles.headMeta}>
            <span className="mono">{skill.id}</span>
            <Chip tone={skill.risk}>{skill.risk}</Chip>
            <Chip tone={skill.status === "quarantined" ? "critical" : "muted"}>{statusLabel(skill.status)}</Chip>
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.stamp} aria-label={`provenance ${skill.provenance}`}>{skill.provenance.replace(/-/g, " ")}</span>
          {!live ? (
            <p className="pageHint">Exported gallery: actions run in the local dashboard.</p>
          ) : skill.installed ? (
            <Button onClick={() => setConfirmActive(!skill.active)}>{skill.active ? "Deactivate" : "Activate"}</Button>
          ) : skill.status === "candidate" ? (
            <Button tone="primary" onClick={() => setInstallOpen(true)}>Install</Button>
          ) : (
            <Chip tone="critical">{statusLabel(skill.status)} — not installable</Chip>
          )}
          {live && skill.updateAvailable ? <Button onClick={() => setUpdateOpen(true)}>Review update</Button> : null}
        </div>
      </header>

      <p className={styles.description}>{skill.description}</p>

      {skill.labels.length > 0 ? (
        <div className={styles.labels}>
          {skill.labels.map((label) => (
            <Chip key={label} tone="muted">{labelName(label)}</Chip>
          ))}
        </div>
      ) : null}

      <section className={styles.panel}>
        <h2>Why this score</h2>
        <div className={styles.scoreGrid}>
          <ScoreMeter value={skill.scores.total} label="total" />
          {SCORE_PARTS.map((part) => (
            <div key={part} className={styles.scoreRow}>
              <span className={styles.scoreLabel}>{part}</span>
              <ScoreMeter value={skill.scores[part]} label={part} />
            </div>
          ))}
        </div>
        <p className="pageHint">rubric {skill.scores.rubricVersion} · evaluated {relativeTime(skill.scores.evaluatedAt, new Date())}</p>
        <ul className={styles.reasons}>
          {skill.scores.reasons.map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2>Risk findings</h2>
        {skill.riskFindings.length === 0 ? (
          <p className="pageHint">No findings. The static scan came back clean.</p>
        ) : (
          <table className="ledger">
            <thead>
              <tr><th>rule</th><th>severity</th><th>line</th><th>match</th></tr>
            </thead>
            <tbody>
              {skill.riskFindings.map((finding, index) => (
                <tr key={`${finding.rule}-${index}`}>
                  <td className="mono">{finding.rule}</td>
                  <td><Chip tone={finding.severity === "critical" ? "critical" : finding.severity === "high" ? "high" : finding.severity === "medium" ? "medium" : "low"}>{finding.severity}</Chip></td>
                  <td className="mono">{finding.line}</td>
                  <td className="mono">{finding.match}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.panel}>
        <h2>Requirements</h2>
        <dl className={styles.requires}>
          {(["runtime", "scripts", "mcp", "env", "services"] as const).map((group) => (
            <div key={group} className={styles.requireRow}>
              <dt>{group}</dt>
              <dd>{skill.requires[group].length > 0 ? skill.requires[group].join(", ") : "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.panel}>
        <h2>Files</h2>
        <ul className={styles.files}>
          {skill.files.map((file) => (
            <li key={file.path}><span className="mono">{file.path}</span><span className={styles.size}>{formatBytes(file.size)}</span></li>
          ))}
        </ul>
      </section>

      {(skill.relations.alternatives.length > 0 || skill.relations.duplicates.length > 0) ? (
        <section className={styles.panel}>
          <h2>Related</h2>
          {skill.relations.alternatives.length > 0 ? (
            <p>Alternatives: {skill.relations.alternatives.map((alt) => <Link key={alt} to={`/skills/${alt}`}>{alt}</Link>)}</p>
          ) : null}
          {skill.relations.duplicates.length > 0 ? (
            <p>Duplicates: {skill.relations.duplicates.map((dup) => <Link key={dup} to={`/skills/${dup}`}>{dup}</Link>)}</p>
          ) : null}
        </section>
      ) : null}

      <section className={styles.panel}>
        <h2>Source</h2>
        <dl className={styles.requires}>
          <div className={styles.requireRow}><dt>kind</dt><dd>{skill.source.kind}</dd></div>
          {skill.source.repo ? <div className={styles.requireRow}><dt>repo</dt><dd className="mono">{skill.source.repo}</dd></div> : null}
          {skill.source.ref ? <div className={styles.requireRow}><dt>ref</dt><dd className="mono">{skill.source.ref}</dd></div> : null}
          <div className={styles.requireRow}><dt>license</dt><dd>{skill.source.license ?? "unknown"}</dd></div>
          <div className={styles.requireRow}><dt>stars</dt><dd>{formatNumber(skill.signals.stars)}</dd></div>
        </dl>
      </section>

      <Modal
        open={installOpen}
        title={`Install ${skill.name}`}
        onClose={() => setInstallOpen(false)}
        footer={
          <>
            <Button onClick={() => setInstallOpen(false)}>Cancel</Button>
            <Button tone="primary" disabled={verify.data?.status !== "verified" || install.isPending} onClick={() => install.mutate()}>
              Install now
            </Button>
          </>
        }
      >
        {verify.isPending ? (
          <p>Verifying the pinned files…</p>
        ) : verify.isError ? (
          <p>{verify.error instanceof Error ? verify.error.message : "Verification failed."}</p>
        ) : verify.data ? (
          <p>Verified: {verify.data.entry.provenanceTier}, risk {verify.data.entry.riskLevel}, score {verify.data.entry.total}. Files are hash-checked before they land in your store.</p>
        ) : null}
      </Modal>

      <Modal
        open={confirmActive !== undefined}
        title={confirmActive ? `Activate ${skill.name}?` : `Deactivate ${skill.name}?`}
        onClose={() => setConfirmActive(undefined)}
        footer={
          <>
            <Button onClick={() => setConfirmActive(undefined)}>Cancel</Button>
            <Button tone="primary" onClick={() => toggleActive.mutate(confirmActive === true)} disabled={toggleActive.isPending}>
              {confirmActive ? "Activate skill" : "Deactivate skill"}
            </Button>
          </>
        }
      >
        <p>
          {confirmActive
            ? "Activated skills are copied into the managed folder and advertised to opencode on restart. The agent can load this skill's full instructions."
            : "Deactivated skills stay installed but leave the advertised set. The agent can still find them through the router."}
        </p>
      </Modal>

      <UpdateReviewModal id={skill.id} name={skill.name} open={updateOpen} onClose={() => setUpdateOpen(false)} />
    </article>
  )
}
