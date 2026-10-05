import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { Chip, EmptyState, ErrorState, Skeleton } from "../components/primitives.tsx"
import { getClusters } from "../lib/api.ts"
import { categoryLabel } from "../lib/format.ts"
import styles from "./ClustersPage.module.css"

export default function ClustersPage() {
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["clusters"], queryFn: getClusters })

  if (isPending) return <div className="gridCards">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={120} />)}</div>
  if (isError) return <ErrorState title="Couldn't load the clusters." retry={() => void refetch()}><p>{error instanceof Error ? error.message : String(error)}</p></ErrorState>
  if (data.clusters.length === 0) {
    return <EmptyState title="No clusters yet — run a sync with clustering on."><p>Clusters group near-identical skills so the best one can win the ranking.</p></EmptyState>
  }

  return (
    <section className="stack">
      <header className="pageHead"><h1>Clusters</h1><p className="pageHint">{data.clusters.length} groups</p></header>
      <div className={styles.grid}>
        {data.clusters.map((cluster) => (
          <article key={cluster.id} className={styles.card}>
            <header className={styles.head}>
              <h2>{cluster.label}</h2>
              <span className={styles.count}>{cluster.count} skill{cluster.count === 1 ? "" : "s"}</span>
            </header>
            <p className="pageHint"><Chip tone="muted">{categoryLabel(cluster.category)}</Chip></p>
            {cluster.top ? (
              <p className={styles.top}>Top: <Link to={`/skills/${cluster.top.id}`}>{cluster.top.name}</Link></p>
            ) : null}
            {cluster.alternatives.length > 0 ? (
              <ul className={styles.alts}>
                {cluster.alternatives.map((alt) => (
                  <li key={alt.id}><Link to={`/skills/${alt.id}`}>{alt.name}</Link></li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
