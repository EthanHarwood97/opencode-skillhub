import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { EmptyState, ErrorState, Skeleton } from "../components/primitives.tsx"
import { getTrending } from "../lib/api.ts"
import styles from "./TrendingPage.module.css"

export default function TrendingPage() {
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["trending"], queryFn: getTrending })

  if (isPending) return <div className="stack"><Skeleton height={200} /><Skeleton height={120} /></div>
  if (isError) return <ErrorState title="Couldn't load trending." retry={() => void refetch()}><p>{error instanceof Error ? error.message : String(error)}</p></ErrorState>

  const empty = data.topVelocity.length === 0 && data.newThisMonth.length === 0
  if (empty) {
    return <EmptyState title="No velocity data yet. Trends build as daily snapshots accumulate."><p>Each sync records star counts; the next one starts producing deltas.</p></EmptyState>
  }

  return (
    <section className="stack">
      <header className="pageHead"><h1>Trending</h1></header>
      {data.topVelocity.length > 0 ? (
        <section className={styles.panel}>
          <h2>Fastest movers</h2>
          <table className={styles.table}>
            <thead><tr><th>skill</th><th>repo</th><th>stars</th><th>7d</th><th>30d</th></tr></thead>
            <tbody>
              {data.topVelocity.map((entry) => (
                <tr key={entry.card.id}>
                  <td><Link to={`/skills/${entry.card.id}`}>{entry.card.name}</Link></td>
                  <td className="mono">{entry.card.sourceRepo ?? "—"}</td>
                  <td className="mono">{entry.stars}</td>
                  <td className={`mono ${styles.delta}`}>+{entry.delta7d}</td>
                  <td className={`mono ${styles.delta}`}>+{entry.delta30d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {data.newThisMonth.length > 0 ? (
        <section className={styles.panel}>
          <h2>New this month</h2>
          <ul className={styles.newList}>
            {data.newThisMonth.map((entry) => (
              <li key={entry.card.id}>
                <Link to={`/skills/${entry.card.id}`}>{entry.card.name}</Link>
                <span className="pageHint">{entry.card.sourceRepo ?? "—"} · {entry.stars} stars</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  )
}
