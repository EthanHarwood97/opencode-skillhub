# DESIGN.md — SkillHub Dashboard + "How it works" (2026-10-07)

```text
REGISTER: R4 Expressive — developer tooling / agent-skill infrastructure; positioning: personal
  tool + flagship public showcase ("coolest dashboard anyone has seen"). Operational data views
  keep R2 legibility discipline; R4 governs the presentation chrome and the How-it-works plate.
BRAND: SkillHub — "a precision instrument that charts, vets and maintains your agent's skill
  universe." Refresh mode: name + SH monogram are core recognition; colour + type evolve
  (observed mint-on-dark collides with the most recent fingerprint build).
STATUS: observed-kit (existing tokens, README, monogram) -> proposed refresh (this document + brand.json)
PALETTE (<=3 hues, 60/30/10):
  surface #F4F3EE graph-paper 60 (raised #FBFAF6, grid #E5E4DC)
  ink #191A16 + grays #55564F / #86877F 30
  accent oxblood #9E2820 ~hue 5 (hover #831F19), 10
  (feedback: ok #2E6B4F / warn #A8741A / high #C2551F / critical #9E2820 + hatch patterns)
TYPE: display Instrument Serif 400 + italic / body Space Grotesk 400-600 / mono IBM Plex Mono 400-500
RADIUS/DENSITY: 0px plate radius / 2px inputs / circular markers; dense ledger rows inside
  generous plate margins; asymmetric 12-col (7/5, 8/4)
MOTION (one signature + calm rest): PLOTTER-DRAW — strokes draw on at 900ms
  cubic-bezier(0.65,0,0.35,1) with a pen marker; counters step mechanically; leader-line hovers;
  rest = 150-200ms fades. reduced-motion: plates render fully drawn, counters final.
TASTE LOG:
  1. The Pudding (pudding.cool) — steal: data-as-article, annotation-first composition /
     avoid: sticker-playful voice (too whimsical for an instrument).
  2. Feltron (feltron.com) — steal: specimen-plate density and typographic rigor /
     avoid: density without interaction affordances.
  3. Vault fallback (research tools degraded, declared): 100 Lost Species — restraint + a live
     counter as the emotional beat; Hearst — 5% grain texture; No Art — asymmetric bento.
FINGERPRINT DIFF: 0/7 shared with hedgehog-pitch (most recent: hero_pattern, accent, motion all
  differ); 1/7 with coopers-bathrooms (paper-light) — PASS.
SLOP PRE-CHECK: palette[x] type[x] grid[x] hero[x] motion[x] radius[x] order[x]
```

## Fingerprint (to log at Stage 7)

```json
{
  "project": "skillhub-dashboard",
  "register": "R4 Expressive",
  "industry": "developer tooling / AI agent skill infrastructure",
  "hero_pattern": "other:animated-technical-plate (live plotter-drawn system diagram)",
  "accent_hue_family": "other:oxblood-ink",
  "motion_system": "other:plotter-draw (stroke draw-on + stepped counters)",
  "section_order": ["rack-nav", "plate-hero-observatory", "kpi-plot", "atlas", "pipeline-strip", "field-notes", "domain-chart", "survey-index", "how-plates", "close"],
  "type_pairing": "instrument-serif+space-grotesk+ibm-plex-mono",
  "surface_mood": "other:graph-paper-light",
  "signature_wow": ["live plotter-drawn plates", "the atlas - interactive canvas map of every skill", "stepped mechanical counters"],
  "palette": { "surface": "#F4F3EE", "accent": ["#9E2820"] }
}
```

## Notes on deliberate deviations

- Accent family is red-adjacent to meridian-demo's coral-red (2026-09-09); differentiated by
  material (dark oxblood annotation ink on light paper vs bright coral on midnight) and by the
  pipeline rule that only the most recent build must differ (hedgehog green, ~130 deg move).
- Mint (#6ee7a8, observed in tokens.css) is retired as brand accent to avoid the recent green
  builds and the light-surface contrast problem; it survives only inside risk semantics.
- The dashboard is a dense instrument: data surfaces stay quiet (ink on paper, mono), and the
  plotter motion carries the personality.
- How-it-works page: R4 narrative applied to a document; every claim must map to a real mechanic
  in the repo (no invented capabilities).
