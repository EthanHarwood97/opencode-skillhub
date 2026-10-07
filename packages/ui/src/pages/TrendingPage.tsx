import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { EmptyState, ErrorState, Skeleton } from "../components/primitives.tsx"
import { getTrending } from "../lib/api.ts"
import styles from "./TrendingPage.module.css"

export default function TrendingPage() {
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["trending"], queryFn: getTrending })

  if (isPending) return <div className="stack"><Skeleton height={220} /><Skeleton height={140} /></div>
  if (isError) return <ErrorState title="Couldn't load trending." retry={() => void refetch()}><p>{error instanceof Error ? error.message : String(error)}</p></ErrorState>

  const empty = data.topVelocity.length === 0 && data.newThisMonth.length === 0
  if (empty) {
    return <EmptyState title="No velocity data yet. Trends build as daily snapshots accumulate."><p>Each sync records star counts; the next one starts producing deltas.</p></EmptyState>
  }

  const max30 = Math.max(1, ...data.topVelocity.map((entry) => entry.delta30d))

  return (
    <section className="stack">
      <header className="pageHead">
        <div>
          <span className="eyebrow">Plate 03 · Velocities</span>
          <h1>Trending</h1>
        </div>
        <p className="pageHint">star velocity across daily snapshots</p>
      </header>
      {data.topVelocity.length > 0 ? (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <span className="plateNo">Fig. 01 <b>·</b> Fastest movers</span>
            <h2>Fastest movers</h2>
          </header>
          <table className="ledger">
            <thead>
              <tr><th>skill</th><th>repo</th><th className="num">stars</th><th className="num">7d</th><th className="num">30d</th><th aria-hidden="true"></th></tr>
            </thead>
            <tbody>
              {data.topVelocity.map((entry) => (
                <tr key={entry.card.id}>
                  <td><Link to={`/skills/${entry.card.id}`}>{entry.card.name}</Link></td>
                  <td className="mono">{entry.card.sourceRepo ?? "—"}</td>
                  <td className="num">{entry.stars}</td>
                  <td className={`num ${styles.delta}`}>+{entry.delta7d}</td>
                  <td className={`num ${styles.delta}`}>+{entry.delta30d}</td>
                  <td aria-hidden="true">
                    <span className={styles.deltaTrack}>
                      <span className={styles.deltaFill} style={{ width: `${Math.round((entry.delta30d / max30) * 100)}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {data.newThisMonth.length > 0 ? (
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <span className="plateNo">Fig. 02 <b>·</b> New this month</span>
            <h2>New this month</h2>
          </header>
          <ul className={styles.newList}>
            {data.newThisMonth.map((entry) => (
              <li key={entry.card.id}>
                <Link to={`/skills/${entry.card.id}`}>{entry.card.name}</Link>
                <span className={styles.newMeta}>{entry.card.sourceRepo ?? "—"} · {entry.stars} stars</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  )
}
