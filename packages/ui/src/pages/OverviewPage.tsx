import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router"
import { Atlas } from "../components/Atlas.tsx"
import { Modal } from "../components/Modal.tsx"
import { PipelineStrip, type PipelineStep } from "../components/PipelineStrip.tsx"
import { Button, Chip, ErrorState, PlotBar, Skeleton, StatTile } from "../components/primitives.tsx"
import { Counter } from "../components/plot.tsx"
import { useToast } from "../components/toast.tsx"
import { getBrief, getStatus, installBestAction, installSkillAction, isLive } from "../lib/api.ts"
import type { CoverageGapDto, InstallBestResultDto } from "../lib/contract.ts"
import { CATEGORY_ORDER, categoryLabel, formatNumber, relativeTime } from "../lib/format.ts"
import styles from "./OverviewPage.module.css"

export default function OverviewPage() {
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["status"], queryFn: getStatus })
  const { data: brief } = useQuery({ queryKey: ["brief"], queryFn: getBrief })
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
        <header className={styles.masthead}>
          <div>
            <span className="eyebrow">Plate 00 · The Observatory</span>
            <h1>Status</h1>
          </div>
        </header>
        <div className={styles.tiles}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={96} />)}</div>
        <Skeleton height={420} />
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

  const anySourceError = data.sources.some((source) => source.error)
  const lastFetch = data.sources.map((source) => source.fetchedAt).sort().at(-1)
  const steps: PipelineStep[] = [
    {
      id: "sync",
      label: "Sync",
      detail: `${data.sources.length} sources${lastFetch ? ` · ${relativeTime(lastFetch, new Date())}` : ""}`,
      state: anySourceError ? "warn" : data.sources.length > 0 ? "ok" : "idle",
    },
    { id: "gates", label: "Gates", detail: `${formatNumber(data.counts.byStatus.candidate ?? 0)} published`, state: data.counts.total > 0 ? "ok" : "idle" },
    {
      id: "scan",
      label: "Scan",
      detail: `${formatNumber(data.counts.byStatus.quarantined ?? 0)} quarantined`,
      state: (data.counts.byStatus.quarantined ?? 0) > 0 ? "warn" : "ok",
    },
    { id: "score", label: "Score", detail: "quality · trust · freshness", state: "ok" },
    {
      id: "curate",
      label: "Curate",
      detail: brief ? `${brief.curated} curated · $${brief.spentUsd.toFixed(4)}` : "runs at 03:00",
      state: brief ? "ok" : "idle",
    },
    { id: "autopilot", label: "Autopilot", detail: `${formatNumber(data.active)} active · 1 per domain`, state: "ok" },
  ]

  const categoryMax = Math.max(1, ...CATEGORY_ORDER.map((category) => data.counts.byCategory[category] ?? 0))

  return (
    <section className="stack">
      <header className={styles.masthead}>
        <div className={styles.mastLeft}>
          <span className="eyebrow">Plate 00 · The Observatory</span>
          <h1>Status</h1>
          <p className={styles.mastSub}>Every skill your agent can reach, plotted and kept current.</p>
        </div>
        <div className={styles.mastRight}>
          <p className="pageHint">Last sync {relativeTime(data.generatedAt, new Date())}</p>
          <Link to="/how" className={styles.howCta}>How it works</Link>
        </div>
      </header>

      <div className={styles.tiles}>
        <StatTile label="Library" value={<Counter value={data.counts.total} format={formatNumber} />} hint={`${data.counts.byStatus.candidate ?? 0} published`} />
        <StatTile label="Installed" value={<Counter value={data.installed} />} hint={`${data.active} active · autopilot`} />
        <StatTile label="Updates" value={<Counter value={data.updates} />} hint="awaiting review" />
        <StatTile label="Review queue" value={<Counter value={data.reviewQueue} />} hint="new candidates" />
      </div>

      <section className={styles.plate}>
        <header className="plateHead">
          <div>
            <span className="plateNo">Fig. 01 <b>·</b> The Atlas</span>
            <h2>Every skill in the catalog</h2>
          </div>
          <p className="pageHint">plotted by score · hover to inspect · click to open</p>
        </header>
        <Atlas />
      </section>

      <div className={styles.split}>
        <section className={styles.plate}>
          <header className="plateHead">
            <div>
              <span className="plateNo">Fig. 02 <b>·</b> The Pipeline</span>
              <h2>Sources to active set</h2>
            </div>
          </header>
          <div className="plateBody">
            <PipelineStrip steps={steps} />
          </div>
        </section>

        {brief ? (
          <section className={styles.plate}>
            <header className="plateHead">
              <div>
                <span className="plateNo">Fig. 03 <b>·</b> Field notes</span>
                <h2>Nightly brief</h2>
              </div>
              <span className="pageHint num">
                {relativeTime(brief.generatedAt, new Date())} · {brief.curated} curated · ${brief.spentUsd.toFixed(4)}
              </span>
            </header>
            <div className={`plateBody ${styles.briefBody}`}>
              <p className="pageHint">{brief.summary}</p>
              {brief.corrections.length > 0 ? (
                <>
                  <h3>Category corrections</h3>
                  <ul className={styles.notes}>
                    {brief.corrections.map((correction) => (
                      <li key={correction.id}>
                        <Link to={`/skills/${correction.id}`}>{correction.name}</Link> — {categoryLabel(correction.from)} → {categoryLabel(correction.to)}: {correction.reason}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {brief.highlights.length > 0 ? (
                <>
                  <h3>Flagged skills</h3>
                  <ul className={styles.notes}>
                    {brief.highlights.map((highlight) => (
                      <li key={highlight.id}>
                        <Link to={`/skills/${highlight.id}`}>{highlight.name}</Link> [{highlight.flags.join(", ")}] — {highlight.summary}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </section>
        ) : (
          <section className={styles.plate}>
            <header className="plateHead">
              <div>
                <span className="plateNo">Fig. 03 <b>·</b> Field notes</span>
                <h2>Nightly brief</h2>
              </div>
            </header>
            <div className="plateBody">
              <p className="pageHint">The curator writes a brief after the 03:00 sync. Nothing yet.</p>
            </div>
          </section>
        )}
      </div>

      <section className={styles.plate}>
        <header className="plateHead">
          <div>
            <span className="plateNo">Fig. 04 <b>·</b> Domains</span>
            <h2>Categories</h2>
          </div>
          <span className="pageHint">24 domains — every skill lives in exactly one</span>
        </header>
        <div className="plateBody">
          <ul className={styles.domains}>
            {CATEGORY_ORDER.map((category) => {
              const count = data.counts.byCategory[category] ?? 0
              return (
                <li key={category}>
                  <Link to={`/gallery?category=${encodeURIComponent(category)}`} className={styles.domainRow}>
                    <span className={styles.domainLabel}>{categoryLabel(category)}</span>
                    <PlotBar value={count} max={categoryMax} />
                    <span className={`mono ${styles.domainCount}`}>{count}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className={styles.plate}>
        <header className="plateHead">
          <div>
            <span className="plateNo">Fig. 05 <b>·</b> Coverage</span>
            <h2>Coverage</h2>
          </div>
          {isLive() ? (
            <Button onClick={() => void openBest()} disabled={bestBusy}>{bestBusy && bestOpen ? "Finding picks…" : "Install best per category"}</Button>
          ) : null}
        </header>
        <div className="plateBody">
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
        </div>
      </section>

      <section className={styles.plate}>
        <header className="plateHead">
          <div>
            <span className="plateNo">Fig. 06 <b>·</b> Survey index</span>
            <h2>Sources</h2>
          </div>
        </header>
        <div className="plateBody">
          {data.sources.length === 0 ? (
            <p className="pageHint">No source stats yet. They appear after a sync writes reconciliation.json.</p>
          ) : (
            <table className="ledger">
              <thead>
                <tr><th>source</th><th className="num">candidates</th><th>last fetched</th><th>status</th></tr>
              </thead>
              <tbody>
                {data.sources.map((source) => (
                  <tr key={source.source}>
                    <td className="mono">{source.source}</td>
                    <td className="num">{source.candidates}</td>
                    <td className="mono">{relativeTime(source.fetchedAt, new Date())}</td>
                    <td>
                      {source.error ? <Chip tone="critical">error</Chip> : (source.warnings?.length ?? 0) > 0 ? <Chip tone="medium">warnings</Chip> : <Chip tone="low">ok</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.sources.some((source) => (source.warnings?.length ?? 0) > 0) ? (
            <ul className={styles.notes}>
              {data.sources.flatMap((source) => (source.warnings ?? []).map((warning) => <li key={`${source.source}:${warning}`}>{source.source} — {warning}</li>))}
            </ul>
          ) : null}
          {data.gaps.length > 0 ? (
            <>
              <h3>Gaps</h3>
              <ul className={styles.notes}>
                {data.gaps.map((gap) => <li key={gap}>{gap}</li>)}
              </ul>
            </>
          ) : null}
        </div>
      </section>

      <Modal
        open={bestOpen}
        title="Install the best skill per category"
        dismissible={!bestBusy}
        onClose={() => { if (!bestBusy) setBestOpen(false) }}
        footer={
          <>
            <Button onClick={() => setBestOpen(false)} disabled={bestBusy}>Cancel</Button>
            <Button tone="primary" onClick={() => void installBest()} disabled={bestBusy || !bestPreview || bestPreview.picks.length === 0}>
              {bestBusy ? "Working…" : `Install ${bestPreview?.picks.length ?? 0} and activate`}
            </Button>
          </>
        }
      >
        {bestPreview ? (
          bestPreview.picks.length === 0 ? (
            <p>Every category already has a pick.</p>
          ) : (
            <ul className={styles.picks}>
              {bestPreview.picks.map((pick) => (
                <li key={pick.id}>
                  <span className="mono">{pick.category}</span>
                  <span>{pick.name}</span>
                  <span className="mono">score {pick.total}</span>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p>Finding the best uninstalled skill for each category…</p>
        )}
      </Modal>

      <Modal
        open={installGap !== null}
        title={installGap ? `Install skills for ${installGap.category}` : "Install skills"}
        onClose={() => setInstallGap(null)}
        footer={
          <>
            <Button onClick={() => setInstallGap(null)} disabled={installing}>Cancel</Button>
            <Button tone="primary" onClick={() => void installSelected()} disabled={installing || checked.size === 0}>
              {installing ? "Installing…" : "Install selected"}
            </Button>
          </>
        }
      >
        {installGap ? (
          <ul className={styles.picks}>
            {installGap.top.map((skill) => (
              <li key={skill.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked.has(skill.id)}
                    onChange={() => toggleSkill(skill.id)}
                    aria-label={`${skill.name} (${skill.id}, score ${skill.total})`}
                  />
                  <span>{skill.name}</span>
                  <span className="mono">score {skill.total}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </Modal>
    </section>
  )
}
