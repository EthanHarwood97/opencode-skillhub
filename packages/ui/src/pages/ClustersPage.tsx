import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { DrawPath } from "../components/plot.tsx"
import { Chip, EmptyState, ErrorState, Skeleton } from "../components/primitives.tsx"
import { getClusters } from "../lib/api.ts"
import { categoryLabel } from "../lib/format.ts"
import styles from "./ClustersPage.module.css"

/** Deterministic constellation glyph per cluster. */
function Constellation({ seed }: { seed: string }) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const rand = () => {
    hash ^= hash << 13
    hash ^= hash >>> 17
    hash ^= hash << 5
    return ((hash >>> 0) % 1000) / 1000
  }
  const points = Array.from({ length: 6 }, () => [12 + rand() * 40, 12 + rand() * 40] as const)
  return (
    <svg viewBox="0 0 64 64" className={styles.constellation} aria-hidden="true">
      {points.map(([x, y], index) => (
        <DrawPath key={`l${index}`} d={`M32 32 L${x.toFixed(1)} ${y.toFixed(1)}`} width={0.8} duration={400} delay={index * 70} />
      ))}
      {points.map(([x, y], index) => (
        <circle key={`p${index}`} cx={x} cy={y} r={1.6} className={styles.node} />
      ))}
      <circle cx={32} cy={32} r={2.8} className={styles.core} />
    </svg>
  )
}

export default function ClustersPage() {
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: ["clusters"], queryFn: getClusters })

  if (isPending) return <div className="gridCards">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={148} />)}</div>
  if (isError) return <ErrorState title="Couldn't load the clusters." retry={() => void refetch()}><p>{error instanceof Error ? error.message : String(error)}</p></ErrorState>
  if (data.clusters.length === 0) {
    return <EmptyState title="No clusters yet — run a sync with clustering on."><p>Clusters group near-identical skills so the best one can win the ranking.</p></EmptyState>
  }

  return (
    <section className="stack">
      <header className="pageHead">
        <div>
          <span className="eyebrow">Plate 02 · Constellations</span>
          <h1>Clusters</h1>
        </div>
        <p className="pageHint">{data.clusters.length} groups</p>
      </header>
      <div className={styles.grid}>
        {data.clusters.map((cluster) => (
          <article key={cluster.id} className={styles.card}>
            <header className={styles.head}>
              <div>
                <h2>{cluster.label}</h2>
                <p className={styles.meta}>
                  <Chip tone="muted">{categoryLabel(cluster.category)}</Chip>
                  <span className="mono">{cluster.count} skill{cluster.count === 1 ? "" : "s"}</span>
                </p>
              </div>
              <Constellation seed={cluster.id} />
            </header>
            {cluster.top ? (
              <p className={styles.top}>
                <span className={styles.topLabel}>Top</span>
                <Link to={`/skills/${cluster.top.id}`}>{cluster.top.name}</Link>
              </p>
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
