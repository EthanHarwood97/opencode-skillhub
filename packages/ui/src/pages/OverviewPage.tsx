import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router"
import { Modal } from "../components/Modal.tsx"
import { Button, Chip, ErrorState, Skeleton, StatTile } from "../components/primitives.tsx"
import { useToast } from "../components/toast.tsx"
import { getStatus, installBestAction, installSkillAction, isLive } from "../lib/api.ts"
import type { CoverageGapDto, InstallBestResultDto } from "../lib/contract.ts"
import { formatNumber, relativeTime } from "../lib/format.ts"
import styles from "./OverviewPage.module.css"

export default function OverviewPage() {
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["status"], queryFn: getStatus })
  const toast = useToast()
  const queryClient = useQueryClient()
  const [installGap, setInstallGap] = useState<CoverageGapDto | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [installing, setInstalling] = useState(false)
  const [bestOpen, setBestOpen] = useState(false)
  const [bestPreview, setBestPreview] = useState<InstallBestResultDto | null>(null)
  const [bestBusy, setBestBusy] = useState(false)

  const openBest = async () => {
    if (bestBusy) return
    setBestOpen(true)
    setBestPreview(null)
    setBestBusy(true)
    try {
      setBestPreview(await installBestAction({ perCategory: 1, dryRun: true, activate: false }))
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : "Couldn't preview the picks.", "error")
      setBestOpen(false)
    } finally {
      setBestBusy(false)
    }
  }

  const installBest = async () => {
    if (bestBusy) return
    setBestBusy(true)
    try {
      const result = await installBestAction({ perCategory: 1, dryRun: false, activate: true })
      const activated = result.picks.filter((pick) => pick.outcome === "activated").length
      const failed = result.picks.filter((pick) => pick.outcome === "failed").length
      toast(
        `Installed and activated ${activated} skill${activated === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}.`,
        activated > 0 ? "success" : "error",
      )
      setBestOpen(false)
      setBestPreview(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["status"] }),
        queryClient.invalidateQueries({ queryKey: ["skills"] }),
      ])
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : "Couldn't install the picks.", "error")
    } finally {
      setBestBusy(false)
    }
  }

  const openInstall = (gap: CoverageGapDto) => {
    setInstallGap(gap)
    setChecked(new Set(gap.top.map((skill) => skill.id)))
    setInstalling(false)
  }

  const toggleSkill = (id: string) => {
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const installSelected = async () => {
    if (!installGap || installing || checked.size === 0) return
    setInstalling(true)
    try {
      let successes = 0
      for (const id of checked) {
        try {
          await installSkillAction(id, false)
          successes += 1
        } catch (failure) {
          toast(failure instanceof Error ? failure.message : `Couldn't install ${id}.`, "error")
        }
      }
      if (successes > 0) {
        toast(`Installed ${successes} skill${successes === 1 ? "" : "s"}. Activate them from the gallery when you're ready.`, "success")
        setInstallGap(null)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["status"] }),
          queryClient.invalidateQueries({ queryKey: ["skills"] }),
        ])
      }
    } finally {
      setInstalling(false)
    }
  }

  if (isPending) {
    return (
      <section className="stack">
        <header className="pageHead"><h1>Status</h1></header>
        <div className={styles.tiles}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={86} />)}</div>
        <Skeleton height={160} />
      </section>
    )
  }
  if (isError) {
    return (
      <ErrorState title="Couldn't load the catalog status." retry={() => void refetch()}>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        <p>Run the sync, import the catalog, then reload this page.</p>
      </ErrorState>
    )
  }

  return (
    <section className="stack">
      <header className="pageHead">
        <h1>Status</h1>
        <p className="pageHint">Last sync {relativeTime(data.generatedAt, new Date())}</p>
      </header>

      <div className={styles.tiles}>
        <StatTile label="Library" value={formatNumber(data.counts.total)} hint={`${data.counts.byStatus.candidate ?? 0} published`} />
        <StatTile label="Installed" value={data.installed} hint={`${data.active} active`} />
        <StatTile label="Updates" value={data.updates} hint="awaiting review" />
        <StatTile label="Review queue" value={data.reviewQueue} hint="new candidates" />
      </div>

      <section className={styles.panel}>
        <h2>Sources</h2>
        {data.sources.length === 0 ? (
          <p className="pageHint">No source stats yet. They appear after a sync writes reconciliation.json.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>source</th><th>candidates</th><th>last fetched</th><th>status</th></tr>
            </thead>
            <tbody>
              {data.sources.map((source) => (
                <tr key={source.source}>
                  <td className="mono">{source.source}</td>
                  <td>{source.candidates}</td>
                  <td>{relativeTime(source.fetchedAt, new Date())}</td>
                  <td>
                    {source.error ? <Chip tone="critical">error</Chip> : (source.warnings?.length ?? 0) > 0 ? <Chip tone="medium">warnings</Chip> : <Chip tone="low">ok</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(data.sources.some((source) => (source.warnings?.length ?? 0) > 0)) ? (
          <ul className={styles.notes}>
            {data.sources.flatMap((source) => (source.warnings ?? []).map((warning) => <li key={`${source.source}:${warning}`}>{source.source} — {warning}</li>))}
          </ul>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Coverage</h2>
          {isLive() ? (
            <Button onClick={() => void openBest()} disabled={bestBusy}>{bestBusy && bestOpen ? "Finding picks…" : "Install best per category"}</Button>
          ) : null}
        </div>
        <p className="pageHint">What each goal profile needs, measured against the catalog.</p>
        {data.counts.total === 0 && data.coverage.every((profile) => profile.coverage === 0) ? (
          <p className="pageHint">No skills yet — run a sync to populate the catalog.</p>
        ) : (
          <ul className={styles.coverage}>
            {data.coverage.map((profile) => (
              <li key={profile.profile} className={styles.coverageRow}>
                <span className={styles.coverageProfile}>{profile.profile}</span>
                <span className={`mono ${styles.coveragePct}`}>{profile.coverage}%</span>
                <span className={styles.coverageTrack} aria-hidden="true">
                  <span className={styles.coverageFill} style={{ width: `${profile.coverage}%` }} />
                </span>
                <span className={styles.coverageGaps}>
                  {profile.gaps.map((gap) => (
                    <span key={gap.category} className={styles.gapItem}>
                      <Link to={`/gallery?category=${encodeURIComponent(gap.category)}`} className={styles.gapLink}>
                        <Chip tone="muted">{gap.category} {gap.supply}/{gap.min}</Chip>
                      </Link>
                      {isLive() && gap.top.length > 0 ? <Button onClick={() => openInstall(gap)}>Review for install</Button> : null}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel}>
        <h2>Gaps</h2>
        {data.gaps.length === 0 ? (
          <p className="pageHint">No gaps reported by the last reconciliation.</p>
        ) : (
          <ul className={styles.notes}>
            {data.gaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        )}
      </section>

      <p><Link to="/review">Open the review queue</Link></p>

      <Modal
        open={bestOpen}
        title="Install the best skill per category"
        dismissible={!bestBusy}
        onClose={() => { if (!bestBusy) setBestOpen(false) }}
        footer={
          <>
            <Button onClick={() => setBestOpen(false)} disabled={bestBusy}>Cancel</Button>
            <Button tone="primary" disabled={bestBusy || !bestPreview || bestPreview.picks.length === 0} onClick={() => void installBest()}>
              {bestBusy && bestPreview ? "Installing…" : `Install + activate ${bestPreview?.picks.length ?? 0}`}
            </Button>
          </>
        }
      >
        {bestPreview === null ? (
          <p className="pageHint">Finding the best skill for each category…</p>
        ) : bestPreview.picks.length === 0 ? (
          <p className="pageHint">Every category already has its best skill installed.</p>
        ) : (
          <>
            <p className="pageHint">
              Top-scoring, gate-passed candidate for each of the {bestPreview.picks.length} category slots not yet covered. They are activated on install so your agent can use them.
              {bestPreview.covered.length > 0 ? ` ${bestPreview.covered.length} categories are already covered.` : ""}
            </p>
            <ul className={styles.installList}>
              {bestPreview.picks.map((pick) => (
                <li key={pick.id}>
                  <span>{pick.category} — {pick.name} <span className="mono">(score {pick.total}, risk {pick.risk})</span></span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>

      <Modal
        open={installGap !== null}
        title={installGap ? `Install skills for ${installGap.category}` : "Install skills"}
        dismissible={!installing}
        onClose={() => { if (!installing) setInstallGap(null) }}
        footer={
          <>
            <Button onClick={() => setInstallGap(null)} disabled={installing}>Cancel</Button>
            <Button tone="primary" disabled={checked.size === 0 || installing} onClick={() => void installSelected()}>
              Install selected
            </Button>
          </>
        }
      >
        {installGap ? (
          <ul className={styles.installList}>
            {installGap.top.map((skill) => (
              <li key={skill.id}>
                <label className={styles.installItem}>
                  <input type="checkbox" checked={checked.has(skill.id)} onChange={() => toggleSkill(skill.id)} disabled={installing} />
                  <span>{skill.name} ({skill.id}, score {skill.total})</span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </Modal>
    </section>
  )
}
