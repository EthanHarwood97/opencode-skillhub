import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router"
import { UpdateReviewModal } from "../components/UpdateReviewModal.tsx"
import { Button, Chip, EmptyState, ErrorState, Skeleton } from "../components/primitives.tsx"
import { getReview, isLive } from "../lib/api.ts"
import styles from "./ReviewPage.module.css"

export default function ReviewPage() {
  const live = isLive()
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["review"], queryFn: getReview })
  const [reviewing, setReviewing] = useState<{ id: string; name: string } | undefined>(undefined)

  if (isPending) {
    return (
      <div className="stack">
        <Skeleton height={120} />
        <Skeleton height={120} />
      </div>
    )
  }
  if (isError) {
    return <ErrorState title="Couldn't load the review queue." retry={() => void refetch()}><p>{error instanceof Error ? error.message : String(error)}</p></ErrorState>
  }

  const empty = data.newCandidates.length === 0 && data.upgrades.length === 0 && data.updates.length === 0 && data.quarantined.length === 0 && data.gaps.length === 0
  if (empty) {
    return <EmptyState title="Nothing needs your attention. The next sync will surface new candidates here." />
  }

  return (
    <section className="stack">
      <header className="pageHead"><h1>Review</h1></header>

      <section className={styles.section}>
        <h2>New this week</h2>
        {data.newCandidates.length === 0 ? (
          <p className="pageHint">No new candidates in the queue.</p>
        ) : (
          <ul className={styles.list}>
            {data.newCandidates.map((card) => (
              <li key={card.id}>
                <Link to={`/skills/${card.id}`} className="mono">{card.id}</Link>
                <span className={styles.meta}>score {card.total} · {card.risk} risk</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2>Upgrade suggestions</h2>
        {data.upgrades.length === 0 ? (
          <p className="pageHint">Every active skill is the best in its group.</p>
        ) : (
          <ul className={styles.list}>
            {data.upgrades.map((upgrade) => (
              <li key={upgrade.from}>
                <Link to={`/skills/${upgrade.to}`} className="mono">{upgrade.from} → {upgrade.to}</Link>
                <span className={styles.meta}>
                  <Chip tone="low">+{Math.round(upgrade.toTotal - upgrade.fromTotal)}</Chip>
                  <span className="pageHint">Review the alternative in the gallery before switching.</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2>Updates available</h2>
        {data.updates.length === 0 ? (
          <p className="pageHint">Every installed skill matches the catalog.</p>
        ) : (
          <ul className={styles.list}>
            {data.updates.map((update) => (
              <li key={update.id}>
                <Link to={`/skills/${update.id}`} className="mono">{update.id}</Link>
                <span className={styles.meta}>
                  <span className="mono">{update.from} → {update.to}</span>
                  <Chip tone={update.riskTo === "critical" ? "critical" : update.riskTo === "high" ? "high" : update.riskTo === "medium" ? "medium" : "low"}>{update.riskFrom} → {update.riskTo}</Chip>
                  {live ? (
                    <Button onClick={() => setReviewing({ id: update.id, name: update.id.split("/").at(-1) ?? update.id })}>Review update</Button>
                  ) : (
                    <span className="pageHint">Exported gallery: actions run in the local dashboard.</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2>Quarantined</h2>
        {data.quarantined.length === 0 ? (
          <p className="pageHint">The scan found nothing critical.</p>
        ) : (
          <ul className={styles.list}>
            {data.quarantined.map((card) => (
              <li key={card.id}>
                <Link to={`/skills/${card.id}`} className="mono">{card.id}</Link>
                <span className={styles.meta}><Chip tone="critical">{card.risk}</Chip> score {card.total}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2>Source gaps</h2>
        {data.gaps.length === 0 ? (
          <p className="pageHint">No gaps reported by the last reconciliation.</p>
        ) : (
          <ul className={styles.list}>
            {data.gaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        )}
      </section>

      {reviewing ? <UpdateReviewModal id={reviewing.id} name={reviewing.name} open onClose={() => setReviewing(undefined)} /> : null}
    </section>
  )
}
