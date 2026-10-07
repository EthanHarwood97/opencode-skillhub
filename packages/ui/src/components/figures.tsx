import { DrawPath } from "./plot.tsx"
import styles from "./figures.module.css"

/** Hero diagram: sources → gates → scan → score → autopilot → agent, plotted on one baseline. */
export function SystemDiagram() {
  const baseline = "M16 158 H946"
  const stations = [
    { x: 96, key: "sources" },
    { x: 286, key: "gates" },
    { x: 476, key: "scan" },
    { x: 666, key: "score" },
    { x: 856, key: "autopilot" },
  ]
  return (
    <svg className={styles.fig} viewBox="0 0 960 210" role="img" aria-label="Diagram: sources flow through gates, scanning, and scoring into an active set kept current by autopilot, then reach the agent.">
      <DrawPath d={baseline} width={1.25} duration={1200} />
      {stations.map((station, index) => (
        <g key={station.key}>
          {/* station tick */}
          <DrawPath d={`M${station.x} 152 V164`} width={1.25} duration={200} delay={250 + index * 120} />
          {station.key === "sources" ? (
            <g>
              {[92, 108, 124, 140].map((y, i) => (
                <DrawPath key={y} d={`M${station.x - 34} ${y} H${station.x + 34}`} width={1} duration={300} delay={150 + i * 90} />
              ))}
              <DrawPath d={`M${station.x + 34} 124 h6`} width={1.5} duration={120} delay={650} />
            </g>
          ) : null}
          {station.key === "gates" ? (
            <g>
              <DrawPath d={`M${station.x - 15} 92 v48`} width={1.1} duration={320} delay={300} />
              <DrawPath d={`M${station.x} 92 v48`} width={1.1} duration={320} delay={380} />
              <DrawPath d={`M${station.x + 15} 92 v48`} width={1.1} duration={320} delay={460} />
            </g>
          ) : null}
          {station.key === "scan" ? (
            <g>
              <DrawPath d={`M${station.x - 16} 96 A16 16 0 1 1 ${station.x + 16} 96 A16 16 0 1 1 ${station.x - 16} 96`} width={1.25} duration={500} delay={300} />
              <DrawPath d={`M${station.x + 11} 107 L${station.x + 25} 121`} width={1.25} duration={200} delay={780} />
            </g>
          ) : null}
          {station.key === "score" ? (
            <g>
              {[0, 1, 2, 3].map((i) => (
                <DrawPath key={i} d={`M${station.x - 27 + i * 14} ${132 - i * 11} v${10 + i * 11}`} width={1.25} duration={220} delay={300 + i * 110} />
              ))}
            </g>
          ) : null}
          {station.key === "autopilot" ? (
            <g>
              <DrawPath d={`M${station.x + 17} 114 A17 17 0 1 1 ${station.x - 17} 114 A17 17 0 1 1 ${station.x + 17} 114`} width={1.25} duration={520} delay={300} />
              <DrawPath d={`M${station.x} 114 m0 0`} width={0} duration={1} />
              <circle cx={station.x} cy={114} r={2.6} className={styles.figDot} />
              <circle cx={station.x + 17} cy={114} r={2.2} className={styles.figDotAccent} />
            </g>
          ) : null}
        </g>
      ))}
      <DrawPath d="M946 158 l-10 -4 M946 158 l-10 4" width={1.25} duration={200} delay={1150} />
      <g className={styles.figLabels}>
        <text x="96" y="192" textAnchor="middle">sources</text>
        <text x="286" y="192" textAnchor="middle">gates</text>
        <text x="476" y="192" textAnchor="middle">scan</text>
        <text x="666" y="192" textAnchor="middle">score</text>
        <text x="856" y="192" textAnchor="middle">autopilot</text>
        <text x="946" y="192" textAnchor="middle">agent</text>
      </g>
    </svg>
  )
}

/** Small plotted glyphs for the pipeline stations. */
export function StationGlyph({ kind }: { kind: "sync" | "gates" | "scan" | "score" | "cluster" | "curate" }) {
  const shared = { width: 1.4 as const, duration: 500 }
  return (
    <svg className={styles.glyph} viewBox="0 0 40 40" aria-hidden="true">
      {kind === "sync" ? (
        <>
          <DrawPath d="M8 14 A14 14 0 0 1 32 14" {...shared} />
          <DrawPath d="M32 14 l-3 -4 M32 14 l4 1" width={1.2} duration={150} delay={420} />
          <DrawPath d="M32 26 A14 14 0 0 1 8 26" {...shared} delay={250} />
          <DrawPath d="M8 26 l3 4 M8 26 l-4 -1" width={1.2} duration={150} delay={700} />
        </>
      ) : null}
      {kind === "gates" ? (
        <>
          <DrawPath d="M10 9 v22" {...shared} />
          <DrawPath d="M20 9 v22" {...shared} delay={120} />
          <DrawPath d="M30 9 v22" {...shared} delay={240} />
        </>
      ) : null}
      {kind === "scan" ? (
        <>
          <DrawPath d="M6 20 A14 14 0 1 1 34 20 A14 14 0 1 1 6 20" {...shared} />
          <DrawPath d="M29 29 L36 36" width={1.4} duration={250} delay={480} />
        </>
      ) : null}
      {kind === "score" ? (
        <>
          {[0, 1, 2, 3].map((i) => (
            <DrawPath key={i} d={`M${8 + i * 8} ${32 - i * 6} v-${8 + i * 5}`} {...shared} delay={i * 130} />
          ))}
        </>
      ) : null}
      {kind === "cluster" ? (
        <>
          {[[12, 14], [26, 12], [20, 26], [10, 27], [30, 24]].map(([x, y], i) => (
            <DrawPath key={i} d={`M${x} ${y} m-0.5 0 a0.6 0.6 0 1 0 1 0 a0.6 0.6 0 1 0 -1 0`} width={1.2} duration={120} delay={i * 90} />
          ))}
          <DrawPath d="M12 14 L20 26 M26 12 L20 26 M10 27 L20 26 M30 24 L20 26" width={0.9} duration={400} delay={520} />
        </>
      ) : null}
      {kind === "curate" ? (
        <>
          <DrawPath d="M20 6 L24 14 V30 L20 34 L16 30 V14 Z" {...shared} />
          <DrawPath d="M20 17 V24" width={1.4} duration={250} delay={520} />
        </>
      ) : null}
    </svg>
  )
}

/** The 1,000-token budget ruler. */
export function BudgetFigure() {
  const ticks = Array.from({ length: 11 }, (_, i) => 40 + i * 88)
  return (
    <svg className={styles.fig} viewBox="0 0 960 130" role="img" aria-label="Budget ruler: router about 200 tokens, pointers about 180 tokens, the rest of the 1,000-token budget stays free.">
      <rect x="40" y="52" width="176" height="12" className={styles.figFillInk} />
      <rect x="216" y="52" width="158" height="12" className={styles.figFillAccent} />
      <rect x="374" y="52" width="506" height="12" className={styles.figFillHatch} />
      <DrawPath d="M40 44 H920" width={1.25} duration={1100} />
      {ticks.map((x, i) => (
        <DrawPath key={x} d={`M${x} 44 v${i % 5 === 0 ? 26 : 16}`} width={1} duration={160} delay={i * 70} />
      ))}
      <g className={styles.figLabels}>
        <text x="40" y="100" textAnchor="start">0</text>
        <text x="480" y="100" textAnchor="middle">500</text>
        <text x="920" y="100" textAnchor="end">1,000 tokens</text>
        <text x="128" y="32" textAnchor="middle">router ≈200</text>
        <text x="295" y="32" textAnchor="middle">pointers ≈180</text>
        <text x="640" y="32" textAnchor="middle">free budget</text>
      </g>
    </svg>
  )
}

/** 03:00 clock with the three nightly stations. */
export function NightlyFigure() {
  return (
    <svg className={styles.figSmall} viewBox="0 0 240 240" role="img" aria-label="Clock face at three in the morning with three nightly stations: sync, curate, autopilot.">
      <DrawPath d="M120 20 A100 100 0 1 1 120 220 A100 100 0 1 1 120 20" width={1.4} duration={1100} />
      <DrawPath d="M120 20 v10" width={1.2} duration={140} delay={900} />
      <DrawPath d="M220 120 h-10" width={1.2} duration={140} delay={980} />
      <DrawPath d="M120 220 v-10" width={1.2} duration={140} delay={1060} />
      <DrawPath d="M20 120 h10" width={1.2} duration={140} delay={1140} />
      <DrawPath d="M120 120 L120 56" width={1.5} duration={420} delay={1000} />
      <DrawPath d="M120 120 L168 120" width={1.5} duration={420} delay={1150} />
      <circle cx="120" cy="120" r="3" className={styles.figDot} />
      <circle cx="218" cy="108" r="2.6" className={styles.figDot} />
      <circle cx="221" cy="124" r="3.2" className={styles.figDotAccent} />
      <circle cx="217" cy="138" r="2.6" className={styles.figDot} />
    </svg>
  )
}
