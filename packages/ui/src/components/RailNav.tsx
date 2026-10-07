import { useQuery } from "@tanstack/react-query"
import { NavLink } from "react-router"
import { getStatus, isLive } from "../lib/api.ts"
import { formatNumber, relativeTime } from "../lib/format.ts"
import { DrawPath } from "./plot.tsx"
import styles from "./RailNav.module.css"

const LINKS = [
  { to: "/", label: "Status", end: true, no: "00" },
  { to: "/gallery", label: "Gallery", end: false, no: "01" },
  { to: "/clusters", label: "Clusters", end: false, no: "02" },
  { to: "/trending", label: "Trending", end: false, no: "03" },
  { to: "/review", label: "Review", end: false, no: "04" },
]

function RegistrationMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 34 34" width="34" height="34" aria-hidden="true">
      <DrawPath d="M17 1 V33" width={1} duration={700} delay={100} />
      <DrawPath d="M1 17 H33" width={1} duration={700} delay={200} />
      <DrawPath d="M26 17 A9 9 0 1 1 8 17 A9 9 0 1 1 26 17" width={1.5} duration={900} delay={300} />
    </svg>
  )
}

export function RailNav() {
  const live = isLive()
  const { data } = useQuery({ queryKey: ["status"], queryFn: getStatus, staleTime: 30_000 })

  return (
    <nav className={styles.rail} aria-label="Sections">
      <div className={styles.brand}>
        <RegistrationMark />
        <div>
          <span className={styles.brandName}>SkillHub</span>
          <span className={styles.brandTag}>skill layer for agents</span>
        </div>
      </div>

      <ul className={styles.links}>
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} end={link.end} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
              <span className={styles.no} aria-hidden="true">{link.no}</span>
              <span className={styles.linkLabel}>{link.label}</span>
            </NavLink>
          </li>
        ))}
        <li className={styles.divider} aria-hidden="true" />
        <li>
          <NavLink to="/how" className={({ isActive }) => (isActive ? `${styles.link} ${styles.active} ${styles.how}` : `${styles.link} ${styles.how}`)}>
            <span className={styles.no} aria-hidden="true">05</span>
            <span className={styles.linkLabel}>How it works</span>
          </NavLink>
        </li>
      </ul>

      {data ? (
        <dl className={styles.stats}>
          <div>
            <dt>catalogued</dt>
            <dd className="num">{formatNumber(data.counts.total)}</dd>
          </div>
          <div>
            <dt>active</dt>
            <dd className="num">{formatNumber(data.active)}</dd>
          </div>
          <div>
            <dt>synced</dt>
            <dd className="num">{relativeTime(data.generatedAt, new Date())}</dd>
          </div>
        </dl>
      ) : null}

      <p className={styles.mode}>
        {live ? "Local dashboard" : "Read-only snapshot"}
        {live ? null : <span className={styles.modeHint}>Actions need the local dashboard.</span>}
      </p>
      <a className={styles.repo} href="https://github.com/EthanHarwood97/opencode-skillhub" target="_blank" rel="noreferrer noopener">
        source ↗
      </a>
    </nav>
  )
}
