import { NavLink } from "react-router"
import { isLive } from "../lib/api.ts"
import styles from "./RailNav.module.css"

const LINKS = [
  { to: "/", label: "Status", end: true },
  { to: "/gallery", label: "Gallery", end: false },
  { to: "/clusters", label: "Clusters", end: false },
  { to: "/trending", label: "Trending", end: false },
  { to: "/review", label: "Review", end: false },
]

export function RailNav() {
  const live = isLive()
  return (
    <nav className={styles.rail} aria-label="Sections">
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">SH</span>
        <span className={styles.brandName}>SkillHub</span>
      </div>
      <ul className={styles.links}>
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} end={link.end} className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <p className={styles.mode}>
        {live ? "Local dashboard" : "Read-only snapshot"}
        {live ? null : <span className={styles.modeHint}>Actions need the local dashboard.</span>}
      </p>
    </nav>
  )
}
