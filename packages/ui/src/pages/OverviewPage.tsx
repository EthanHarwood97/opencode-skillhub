import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Chip, ErrorState, Skeleton, StatTile } from "../components/primitives.tsx"
import { getStatus } from "../lib/api.ts"
import { formatNumber, relativeTime } from "../lib/format.ts"
import styles from "./OverviewPage.module.css"

export default function OverviewPage() {
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["status"], queryFn: getStatus })

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
    </section>
  )
}
