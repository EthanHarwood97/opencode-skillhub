import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { BudgetFigure, NightlyFigure, StationGlyph, SystemDiagram } from "../components/figures.tsx"
import { Counter, PlotBar } from "../components/plot.tsx"
import { StatTile } from "../components/primitives.tsx"
import { getStatus } from "../lib/api.ts"
import { formatNumber } from "../lib/format.ts"
import styles from "./HowItWorksPage.module.css"

const STAGES = [
  {
    id: "sync",
    glyph: "sync" as const,
    title: "Sync",
    body: "Eight sources every night: GitHub topics, a curated seed list of 57 repositories, a skills marketplace, and your own local folders.",
  },
  {
    id: "gates",
    glyph: "gates" as const,
    title: "Gates",
    body: "Frontmatter parses. License known. Repository alive. Files present. Fail a gate and the skill never reaches your machine.",
  },
  {
    id: "scan",
    glyph: "scan" as const,
    title: "Scan",
    body: "A deterministic pass flags instruction overrides, exfiltration shapes, shell calls, credential access, and hidden text. Every finding keeps its rule, line, and match.",
  },
  {
    id: "score",
    glyph: "score" as const,
    title: "Score",
    body: "Five components combine into one number: quality, trust, freshness, compatibility, adoption. Each score keeps written reasons you can audit.",
  },
  {
    id: "cluster",
    glyph: "cluster" as const,
    title: "Cluster",
    body: "Near-identical copies collapse into one group. The best version wins the ranking, and the rest stay visible as alternatives.",
  },
  {
    id: "curate",
    glyph: "curate" as const,
    title: "Curate",
    body: "New entries get one LLM review under a hard spending cap. Corrections land in a ledger with the reason attached.",
  },
]

const TIERS = [
  { id: "L0", label: "Router", width: 20, tokens: "≈200 tokens", note: "The search tool. Always present." },
  { id: "L1", label: "Active set", width: 80, tokens: "≈800 tokens", note: "The handful of skills your projects lean on." },
  { id: "L2", label: "Library", width: 2, tokens: "0 until read", note: "Everything else, searchable in milliseconds." },
  { id: "L3", label: "Quarantine", width: 2, tokens: "never loaded", note: "Failed the scan. Visible only for review." },
]

export default function HowItWorksPage() {
  const { data } = useQuery({ queryKey: ["status"], queryFn: getStatus })
  const total = data?.counts.total

  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <span className="eyebrow">Plate 05 · The Machine</span>
        <h1 className={styles.heroTitle}>Your agent is only as good as the skills it can find.</h1>
        <p className={styles.heroSub}>
          SkillHub charts tens of thousands of agent skills, keeps the ones worth keeping, and hands your agent exactly what a task needs. The
          library costs nothing until it is used.
        </p>
        <p className={styles.heroMeta}>
          <span className="mono">{total !== undefined ? `${formatNumber(total)} skills charted` : "catalog on your machine"}</span>
          <span className="mono">24 domains</span>
          <span className="mono">open source · MIT</span>
        </p>
        <div className={styles.ctaRow}>
          <Link to="/" className={styles.ctaPrimary}>
            Open the dashboard
          </Link>
          <a className={styles.ctaGhost} href="https://github.com/EthanHarwood97/opencode-skillhub" target="_blank" rel="noreferrer noopener">
            Read the code ↗
          </a>
        </div>
        <div className={styles.heroFig}>
          <SystemDiagram />
        </div>
      </header>

      <section className={styles.section}>
        <header className={styles.secHead}>
          <span className="plateNo">01 · The problem</span>
          <h2>The ecosystem grew faster than anyone can judge it.</h2>
        </header>
        <div className={styles.twoCol}>
          <div className={styles.prose}>
            <p>
              GitHub now lists tens of thousands of repositories that carry agent skills. Stars rank the repositories, not the skills inside
              them. A popular monorepo can hold one good skill and forty abandoned ones.
            </p>
            <p>
              A skill is also instructions you are about to hand your agent. Most people install first and inspect never. That order is
              backwards.
            </p>
            <p className={styles.punch}>Finding one good skill takes an afternoon. Keeping a hundred current is a job.</p>
          </div>
          <ul className={styles.facts}>
            <li>
              <span className={styles.factNum}>29,000+</span>
              <span>repositories under the agent-skills topic on GitHub, measured this month.</span>
            </li>
            <li>
              <span className={styles.factNum}>10,000+</span>
              <span>more under claude-skills, and the lists keep growing weekly.</span>
            </li>
            <li>
              <span className={styles.factNum}>0</span>
              <span>standard ways to score a skill before you install it.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.secHead}>
          <span className="plateNo">02 · The pipeline</span>
          <h2>Six stages stand between raw repositories and your active set.</h2>
        </header>
        <div className={styles.rail}>
          {STAGES.map((stage, index) => (
            <div key={stage.id} className={styles.station}>
              <StationGlyph kind={stage.glyph} />
              <span className={styles.stationNo}>{String(index + 1).padStart(2, "0")}</span>
              <h3>{stage.title}</h3>
              <p>{stage.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.secHead}>
          <span className="plateNo">03 · The catalog</span>
          <h2>A rolling inventory, built to be audited.</h2>
        </header>
        <div className={styles.statsRow}>
          <StatTile
            label="Skills charted"
            value={total !== undefined ? <Counter value={total} format={formatNumber} /> : "—"}
            hint="live from the catalog"
          />
          <StatTile label="Domains" value="24" hint="one home per skill" />
          <StatTile label="Seed repositories" value="57" hint="hand-picked, reviewed by name" />
          <StatTile label="Rehosted files" value="0" hint="installs fetch from source" />
        </div>
        <p className={styles.sectionProse}>
          Every entry keeps its source URL, commit pin, license, file hashes, and score. SkillHub stores metadata, never content. When you
          install, the files come from the original repository at the reviewed commit, and every hash is verified before anything lands.
        </p>
      </section>

      <section className={styles.splitSection}>
        <div className={styles.splitText}>
          <span className="plateNo">04 · The nightly loop</span>
          <h2>It runs at 03:00, so mornings start current.</h2>
          <p>
            One scheduled sweep does everything: sync, score, review, then autopilot. The review step is delta-only under a hard cap, so a
            normal night costs cents. The last full curation pass cost $0.0966.
          </p>
          <p>
            By morning the dashboard shows what changed, what was corrected, and the reason. One line in the brief replaces twenty minutes of
            maintenance.
          </p>
        </div>
        <div className={styles.splitFig}>
          <NightlyFigure />
          <p className={styles.figCaption}>03:00 sync · 03:05 curate · 03:10 autopilot</p>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.secHead}>
          <span className="plateNo">05 · Autopilot</span>
          <h2>One best skill per domain, held in place.</h2>
        </header>
        <div className={styles.twoCol}>
          <div className={styles.prose}>
            <p>
              Autopilot fills empty domains, updates changed skills in place, and swaps only when a challenger wins by at least three points
              without carrying worse risk. Pinned skills are never touched. Deactivated files are never deleted.
            </p>
            <p>Nothing changes silently. Installs, updates, and activation all pass through a review step first.</p>
          </div>
          <ul className={styles.rules}>
            <li>
              <span className="mono">rule 1</span>
              <span>Three-point margin before any swap. Ties go to the incumbent.</span>
            </li>
            <li>
              <span className="mono">rule 2</span>
              <span>Worse risk never wins, whatever the score says.</span>
            </li>
            <li>
              <span className="mono">rule 3</span>
              <span>Your pins outrank every computed number.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.secHead}>
          <span className="plateNo">06 · Retrieval and context</span>
          <h2>Small in the prompt, vast behind it.</h2>
        </header>
        <p className={styles.sectionProse}>
          Every prompt is matched against the catalog: embeddings blended with full-text search. The best matches arrive as one-line pointers.
          A body loads only when it is actually used.
        </p>
        <div className={styles.budget}>
          <BudgetFigure />
        </div>
        <ul className={styles.tiers}>
          {TIERS.map((tier) => (
            <li key={tier.id} className={styles.tier}>
              <span className={styles.tierId}>{tier.id}</span>
              <span className={styles.tierLabel}>{tier.label}</span>
              <span className={styles.tierBar}>
                <PlotBar value={tier.width} max={100} tone={tier.id === "L2" || tier.id === "L3" ? "hatch" : tier.id === "L1" ? "accent" : "ink"} />
              </span>
              <span className={styles.tierTokens}>{tier.tokens}</span>
              <span className={styles.tierNote}>{tier.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <header className={styles.secHead}>
          <span className="plateNo">07 · Trust</span>
          <h2>Pinned, scanned, and review-gated.</h2>
        </header>
        <ul className={styles.rules}>
          <li>
            <span className="mono">pin</span>
            <span>Every install records a commit SHA and a content hash. The bytes that land are the bytes that were reviewed.</span>
          </li>
          <li>
            <span className="mono">scan</span>
            <span>Findings list their rule, line, and match. Critical findings quarantine a skill instead of hiding it.</span>
          </li>
          <li>
            <span className="mono">ask</span>
            <span>New skills default to permission-ask. The dashboard binds to 127.0.0.1, and its write actions need a per-run token.</span>
          </li>
        </ul>
        <p className={styles.honest}>
          SkillHub cannot promise a skill is safe. It can promise you will see what the scan found before the skill runs.
        </p>
      </section>

      <section className={styles.close}>
        <span className="plateNo">08 · Install</span>
        <h2 className={styles.closeTitle}>Give your agent the right skills.</h2>
        <pre className={styles.install}>
          <code>
{`git clone https://github.com/EthanHarwood97/opencode-skillhub
cd opencode-skillhub
pwsh ./scripts/install.ps1`}
          </code>
        </pre>
        <p className={styles.sectionProse}>
          One command sets up the catalog, the plugin, and the 03:00 task. Node 22 and opencode required. Windows first; Linux works.
        </p>
        <div className={styles.ctaRow}>
          <Link to="/" className={styles.ctaPrimary}>
            Open the dashboard
          </Link>
          <a className={styles.ctaGhost} href="https://github.com/EthanHarwood97/opencode-skillhub" target="_blank" rel="noreferrer noopener">
            GitHub ↗
          </a>
        </div>
        <footer className={styles.foot}>
          Independent project, not affiliated with the opencode team. Code MIT. Catalog snapshots are metadata only.
        </footer>
      </section>
    </article>
  )
}
