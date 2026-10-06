import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Chip, EmptyState, ErrorState, ScoreMeter, Skeleton } from "../components/primitives.tsx"
import { getSkills } from "../lib/api.ts"
import type { SkillCard, SkillsQuery } from "../lib/contract.ts"
import { categoryLabel, clampText, statusLabel } from "../lib/format.ts"
import styles from "./GalleryPage.module.css"

const CATEGORIES = ["engineering", "testing", "infrastructure-devops", "security", "data", "ai", "design-ui", "art-creative", "media", "writing", "docs-productivity", "marketing-growth", "business-ops", "product", "communication", "research", "education", "integrations", "automation", "mobile", "games", "web3", "iot-hardware", "lifestyle"]
const STATUSES = ["candidate", "quarantined", "active"]
const RISKS = ["low", "medium", "high", "critical"]
const SORTS: { value: NonNullable<SkillsQuery["sort"]>; label: string }[] = [
  { value: "score", label: "Best score" },
  { value: "freshness", label: "Freshest" },
  { value: "name", label: "Name" },
]

export default function GalleryPage() {
  const [params, setParams] = useSearchParams()
  const query: SkillsQuery = {
    q: params.get("q") ?? undefined,
    category: params.get("category") ?? undefined,
    status: params.get("status") ?? undefined,
    risk: params.get("risk") ?? undefined,
    sort: (params.get("sort") as SkillsQuery["sort"] | null) ?? "score",
    page: Number(params.get("page") ?? "1") || 1,
  }
  const [term, setTerm] = useState(query.q ?? "")
  useEffect(() => setTerm(query.q ?? ""), [query.q])

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({ queryKey: ["skills", query], queryFn: () => getSkills(query), placeholderData: keepPreviousData })

  const update = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") next.delete(key)
      else next.set(key, value)
    }
    if (resetPage) next.delete("page")
    setParams(next)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <section className="stack">
      <header className="pageHead">
        <h1>Gallery</h1>
        {data ? <p className="pageHint">{data.total} skill{data.total === 1 ? "" : "s"}{isFetching ? " · updating…" : ""}</p> : null}
      </header>

      <form
        className={styles.filters}
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          update({ q: term.trim() || undefined })
        }}
      >
        <label className={styles.search}>
          <span className={styles.label}>Search skills</span>
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="pdf, seo, cloudflare…" type="search" />
        </label>
        <label className={styles.select}>
          <span className={styles.label}>Category</span>
          <select value={query.category ?? ""} onChange={(event) => update({ category: event.target.value || undefined })}>
            <option value="">All</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>{categoryLabel(category)}</option>
            ))}
          </select>
        </label>
        <label className={styles.select}>
          <span className={styles.label}>Status</span>
          <select value={query.status ?? ""} onChange={(event) => update({ status: event.target.value || undefined })}>
            <option value="">All</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>{statusLabel(status)}</option>
            ))}
          </select>
        </label>
        <label className={styles.select}>
          <span className={styles.label}>Risk</span>
          <select value={query.risk ?? ""} onChange={(event) => update({ risk: event.target.value || undefined })}>
            <option value="">All</option>
            {RISKS.map((risk) => (
              <option key={risk} value={risk}>{risk}</option>
            ))}
          </select>
        </label>
        <label className={styles.select}>
          <span className={styles.label}>Sort</span>
          <select value={query.sort ?? "score"} onChange={(event) => update({ sort: event.target.value })}>
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>{sort.label}</option>
            ))}
          </select>
        </label>
      </form>

      {isPending ? (
        <div className="gridCards" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} height={132} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState title="Couldn't load the gallery." retry={() => void refetch()}>
          <p>{error instanceof Error ? error.message : String(error)}</p>
          <p>Run the sync, import the catalog, then try again.</p>
        </ErrorState>
      ) : data.total === 0 ? (
        <EmptyState title="No skills match these filters.">
          <button type="button" className={styles.clear} onClick={() => setParams(new URLSearchParams())}>Clear filters</button>
        </EmptyState>
      ) : (
        <>
          <div className="gridCards" aria-busy={isFetching}>
            {data.items.map((card) => (
              <SkillCardView key={card.id} card={card} />
            ))}
          </div>
          {totalPages > 1 ? (
            <nav className={styles.pager} aria-label="Pages">
              <button type="button" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) }, false)}>Previous</button>
              <span>Page {data.page} of {totalPages}</span>
              <button type="button" disabled={data.page >= totalPages} onClick={() => update({ page: String(data.page + 1) }, false)}>Next</button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  )
}

function SkillCardView({ card }: { card: SkillCard }) {
  return (
    <Link to={`/skills/${card.id}`} className={styles.card}>
      <span className={styles.cardTop}>
        <span className={styles.cardName}>{card.name}</span>
        <ScoreMeter value={card.total} />
      </span>
      <span className={styles.cardId}>{card.id}</span>
      <span className={styles.cardDesc}>{clampText(card.description, 140) || "No description yet."}</span>
      <span className={styles.cardMeta}>
        <Chip tone="muted">{categoryLabel(card.category)}</Chip>
        <Chip tone={card.risk}>{card.risk}</Chip>
        {card.active ? <Chip tone="accent">Active</Chip> : card.installed ? <Chip tone="info">Installed</Chip> : null}
        {card.status !== "candidate" && card.status !== "active" ? <Chip tone={card.status === "quarantined" ? "critical" : "neutral"}>{statusLabel(card.status)}</Chip> : null}
        {card.updateAvailable ? <Chip tone="medium">Update</Chip> : null}
      </span>
    </Link>
  )
}
