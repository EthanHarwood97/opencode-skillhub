# SkillHub — Capability Label Inventory (Taxonomy v2, Phase 1)

Date: 2026-10-05. Status: **frozen** — sign-off decisions taken 2026-10-05 (24 categories, all 210 labels kept, 7 goal profiles, overlap rules below); implementation in progress. Authority: user decisions — ~22 categories + ~150 labels (nudged to 24/210 for full niche coverage); taxonomy v2 supersedes the 12-category model; topic sweep + curated seeds; first population target 1–3k.

Purpose: enumerate *everything code can do* as a machine-usable label vocabulary — the parent categories for navigation/coverage and the fine labels that make skills findable — before any code changes.

---

## 1. Method and sources

Bottom-up mining (all read-only, done 2026-10-05):

| Source | What was mined | Size |
|---|---|---|
| Local store catalog `~/.config/opencode/.skillhub/catalog` | names, tags, categories | 123 skills, 116 with `rubric-v1` reasoning |
| CI catalog `catalog/index.json` (repo) | names, tags, clusters, categories | 449 skills (394 unique engineering names) |
| skills.sh (Vercel directory) | topics, leaderboard samples, seed repos | 1.58M installs tracked; API verified (needs Vercel OIDC) |
| awesome-skills.com | tag vocabulary | 157 entries; tags: tooling, workflow, data, agents, automation, integration, ai, content, design, planning, research, ui, marketing, mcp, documents, testing, devops, security, architecture, browser, mobile, conversion, office, 3d, artifacts |
| VoltAgent/awesome-agent-skills (35k★) | section taxonomy | 1,000+ skills; official-by-vendor, Core, .NET, Java, Python, Rust, TS, community |
| awesomeagentskills.dev | category counts | 26,385 entries (OpenClaw 21,446 · MCP 4,666 · SKILL.md 203) |
| GitHub topic counts | discovery volume | agent-skills 29,056 · claude-skills 10,040 · mcp-server 33,247 · claude-code-skills 2,038 · ai-skills 1,828 · opencode-skills 223 |
| User's own installed skill set | domains actually used | seo, keyword, growth, business, writing, research, web design, frontend, testing, supabase, cloudflare, brand, poster, visual critique, media gen, ideation, codebase memory |

Top-down sweep: art → plans → UI → full stack → data → ops → business → media → science → games → hardware, cross-checked against the table above.

### Evidence of the problem (why v2)

Current pipeline: `category = candidate.categoryHint ?? "engineering"` (`packages/catalog/src/normalize.ts:75,82`); only the marketplace source sets a hint. Result:

- CI catalog: **413/449 (92%) `engineering`**; top cluster label is literally `Skills` ×383.
- Local catalog: **99/123 (80%) `engineering`**.

Real skills currently misfiled as `engineering` (verbatim from the catalog):

| Skill | Should be |
|---|---|
| `travel-planner`, `dating-web`, `furniture-fit` | lifestyle (watchlist) |
| `dcf-valuation`, `accounting`, `stock-analyzer`, `quant-analyst` | business-ops / data |
| `godot`, `unity-developer`, `2d-games`, `game-development` | games |
| `blender-toolkit`, `openscad`, `pascal-3d`, `motion-canvas` | art-creative |
| `offensive-*` (12 skills), `reverse-engineering-tools` | security |
| `axolotl`, `llama-factory`, `nanogpt`, `model-training`, `hyperparameter-tuning` | ai |
| `telegram-bot-builder`, `gws-calendar`, `atlassian-mcp`, `oauth-2-0-setup` | integrations |
| `blog-post`, `khazix-writer`, `resume-builder`, `article-factory` | writing |
| `create-prd`, `pm-brainstorm`, `pmbok-project-management`, `brainstorm-okrs` | product |
| `audio-jingle`, `video-downloader` | media |

---

## 2. Category set — 22 (replaces the 12)

Legend: **id** is the stored value; display names live in `categoryLabel`.

| # | id | Display | Definition | Boundary notes |
|---|---|---|---|---|
| 1 | `engineering` | Engineering | Writing and maintaining software itself: app code, APIs, CLIs, libraries, desktop apps, browser extensions, architecture, refactoring, code review, debugging. | Excludes model training (`ai`), pipelines (`data`), infra config (`infrastructure-devops`). |
| 2 | `testing` | Testing | Proving software works: unit/integration/e2e, TDD, visual, load, test architecture and review. | Test *infrastructure* stays here; CI plumbing is `infrastructure-devops`. |
| 3 | `infrastructure-devops` | Infrastructure & DevOps | Running software: cloud platforms, containers, K8s, IaC, CI/CD, observability, SRE, incidents. | |
| 4 | `security` | Security | Attacking and defending systems: AppSec, offensive/pentest, threat intel, vulnerability audit, forensics, compliance, privacy, secrets. | Includes RE and crypto-security. |
| 5 | `data` | Data | Working with data: engineering/ETL, SQL, databases, analytics, BI, visualization, statistics, spreadsheets. | Data *analysis* for marketing is `marketing-growth/analytics` by label. |
| 6 | `ai` | AI & Agents | Building AI systems: LLM APIs, prompting, agents, multi-agent, MCP, RAG, embeddings, evals, training, fine-tuning, inference, MLOps, context engineering. | Biggest new domain; absorbs ML research skills (`axolotl`, `nanogpt`). |
| 7 | `design-ui` | Design & UI | Designing interfaces and visual systems: UX, UI, design systems, brand, typography, Figma, prototyping, design-to-code. | |
| 8 | `art-creative` | Art & Creative | Making art: generative, illustration, pixel art, 3D modeling, animation/motion, posters/print, comics, photography. | Split from old `media-creative` (creation side). |
| 9 | `media` | Media | Producing media assets: image/video/audio generation and editing, TTS/speech, captions, ffmpeg pipelines, publishing. | Split from old `media-creative` (production side). |
| 10 | `writing` | Writing | Words as craft: copywriting, blogging, storytelling, screenwriting, editing, humanizing, SEO writing, translation, resumes. | |
| 11 | `docs-productivity` | Docs & Productivity | Documents and personal work: documentation, API docs, READMEs, knowledge bases, note-taking, office files, PDF, meeting notes, ADRs. | |
| 12 | `marketing-growth` | Marketing & Growth | Demand generation: SEO, GEO/AEO, keyword research, content strategy, social, paid ads, email, CRO, analytics, A/B testing. | |
| 13 | `business-ops` | Business & Ops | Running a business: strategy, finance, accounting, legal, HR, sales/CRM, support, e-commerce, pricing, fundraising. | Old `business-finance` renamed/expanded. |
| 14 | `product` | Product | Deciding what to build: PRDs, specs, roadmaps, tickets, user research, prioritization, project management, OKRs, brainstorming. | New; captures the "plans" work the user named. |
| 15 | `communication` | Communication | Talking to humans at work: email, internal comms, outreach, presentations, community, meeting facilitation. | |
| 16 | `research` | Research | Finding and verifying knowledge: web/academic/literature, citations, fact-checking, competitive and market analysis, scientific computing. | |
| 17 | `education` | Education | Teaching and learning: tutoring, curriculum, courses, learning paths, assessment. | |
| 18 | `integrations` | Integrations | Connecting systems: SaaS connectors, API integrations, auth/SSO, payments, Google/Microsoft APIs, GitHub, notifications. | Includes MCP *servers* as connectors; model-context work sits in `ai`. |
| 19 | `automation` | Automation | Making things happen without humans: workflow automation, RPA, browser automation, scraping, cron, file automation. | |
| 20 | `mobile` | Mobile | Building for phones: iOS, Android, React Native/Expo, Flutter, mobile UI, store submission. | |
| 21 | `games` | Games | Building games: game design, Unity/Godot/Unreal, 2D/3D, assets, NPC content. | |
| 22 | `web3` | Web3 | Decentralized systems: chains, smart contracts, DeFi, NFTs, wallets, tokenomics. | |
| 23 | `iot-hardware` | IoT & Hardware | Code that touches the physical world: embedded/firmware, robotics, CAD/3D printing, smart home, sensors, electronics tooling. | Promoted from watchlist — the mined catalog has embedded/hardware skills. |
| 24 | `lifestyle` | Lifestyle | Personal life: travel, food/cooking, health/fitness, personal finance, home life. | Promoted from watchlist — `travel-planner`, `dating-web`, `clinical-case-report` exist today. |

**Beyond-v1 (revisit after first population):** niche sciences are covered by `research/scientific-computing` for now; OS/driver development and quantum are not represented and will be added only if the population surfaces them.

---

## 3. Label inventory

Conventions: labels are multi-valued; category is single. IDs are unique and kebab-case; ambiguous ones carry a domain prefix. `⟨trim⟩` = suggested deferral to hit the ~150 target — final cut decided at sign-off. Signal terms seed the Phase 3 rulebook (name ×3, description ×2, body ×1).

### engineering — 17

| Label | What it means | Signals |
|---|---|---|
| `web-frontend` | Browser UI code | react, vue, svelte, css, tailwind, component, dom, frontend |
| `web-backend` | Server-side apps/services | fastapi, express, django, endpoint, server, backend |
| `fullstack` | End-to-end app delivery | fullstack, mvp, scaffold, boilerplate, saas app |
| `api-design` | API contracts/styles | rest, graphql, openapi, trpc, grpc, endpoint design |
| `cli` | Command-line tools | cli, terminal, argv, shell tool, commander, cobra |
| `sdk-library` ⟨trim⟩ | Libraries/packages | sdk, library, package, npm, pip, publish |
| `desktop-app` | Desktop/native apps | electron, tauri, macos app, windows app, qt |
| `browser-extension` | Extensions/userscripts | chrome extension, manifest v3, userscript, plugin browser |
| `architecture` | System structure/design | architecture, design pattern, ddd, monorepo, modular |
| `refactoring` | Restructuring existing code | refactor, simplify, cleanup, modernization, migration code |
| `code-review` | Reviewing diffs/PRs | review, pull request, diff, reviewer, quality gate |
| `debugging` | Diagnosing failures | debug, stack trace, diagnose, bug, root cause |
| `performance` | Speed/memory optimization | performance, optimize, core web vitals, profiling, latency |
| `lang-typescript` | TS/JS ecosystem | typescript, javascript, node, deno, bun |
| `lang-python` | Python ecosystem | python, pip, poetry, asyncio, pydantic |
| `lang-rust-go` | Rust/Go systems | rust, cargo, golang, go module, systems |
| `lang-jvm-dotnet` ⟨trim⟩ | Java/Kotlin/C#/.NET | java, kotlin, spring, csharp, dotnet |

### testing — 9

| Label | What it means | Signals |
|---|---|---|
| `unit-testing` | Unit tests | unit test, assert, mock, stub, pytest |
| `integration-testing` | Integration/API tests | integration test, contract test, api test |
| `e2e-testing` | End-to-end/browser tests | e2e, end-to-end, playwright, cypress, selenium |
| `tdd` | Test-first workflows | tdd, red green, test first, failing test |
| `visual-testing` | Visual regression | visual regression, screenshot diff, snapshot |
| `load-testing` | Load/stress/bench | load test, stress, benchmark, k6, locust |
| `a11y-testing` | Accessibility testing | wcag test, axe, screen reader, a11y audit |
| `fixtures` ⟨trim⟩ | Test data/factories | fixture, factory, seed data, test data |
| `test-review` ⟨trim⟩ | Test quality review | test review, flaky, coverage, testing strategy |

### infrastructure-devops — 9

| Label | What it means | Signals |
|---|---|---|
| `cloud-platforms` | Major clouds | aws, azure, gcp, s3, lambda, cloud run |
| `containers` | Containers/images | docker, dockerfile, compose, container, image |
| `kubernetes` | Kubernetes | kubernetes, k8s, helm, pod, cluster |
| `iac` | Infra as code | terraform, pulumi, cloudformation, iac |
| `ci-cd` | Pipelines/releases | ci, cd, github actions, pipeline, release |
| `observability` | Logs/metrics/traces | observability, logging, metrics, traces, grafana, prometheus |
| `sre-incident` | Reliability/incidents | sre, incident, on-call, postmortem, runbook |
| `serverless-edge` | Serverless/edge | serverless, workers, edge functions, faas |
| `linux-ops` ⟨trim⟩ | Linux/servers | linux, systemd, ssh, nginx, bash |

### security — 9

| Label | What it means | Signals |
|---|---|---|
| `appsec` | Application security | appsec, owasp, injection, secure code, xss |
| `offensive-security` | Pentest/red team | pentest, offensive, exploit, red team, burp |
| `threat-intel` | Threat research | threat intel, mitre, att&ck, ioc, adversary |
| `vuln-audit` | Vulnerability assessment | vulnerability, cve, dependency audit, sbom, scan |
| `forensics` ⟨trim⟩ | Incident forensics | forensics, memory dump, artifact, malware analysis |
| `compliance` | Standards/audits | soc2, iso 27001, hipaa, pci, audit |
| `privacy` | Data protection | privacy, gdpr, pii, consent, retention |
| `secrets-keys` | Secrets/keys | secret, kms, vault, encryption, key rotation |
| `reverse-engineering` | RE/binary analysis | reverse engineering, decompile, jadx, ghidra, disassembly |

### data — 9

| Label | What it means | Signals |
|---|---|---|
| `data-engineering` | Pipelines/ETL | etl, pipeline, ingestion, dbt, airflow |
| `sql` | SQL/querying | sql, query, join, postgres, mysql |
| `databases` | DB design/admin | database, schema, migration, index, nosql |
| `analytics` | Analysis/metrics | analytics, cohort, funnel, kpi, metrics |
| `bi-dashboards` | Dashboards/reporting | dashboard, bi, report, metabase, looker |
| `visualization` | Charts/graphs | visualization, chart, plot, matplotlib, d3 |
| `statistics` | Stats/modeling | statistics, regression, significance, bayesian |
| `spreadsheets` | xlsx/csv work | spreadsheet, xlsx, csv, excel, formula |
| `data-quality` ⟨trim⟩ | Validation/cleaning | data quality, validation, cleaning, dedupe, labeling |

### ai — 13

| Label | What it means | Signals |
|---|---|---|
| `llm-api` | Calling LLMs | openai, anthropic, chat completion, llm api, sdk |
| `prompt-engineering` | Prompts | prompt, system prompt, few-shot, chain of thought |
| `agents` | Agent systems | agent, autonomous loop, tool use, react pattern |
| `multi-agent` | Agent teams | multi-agent, swarm, orchestrator, subagent, agent team |
| `mcp` | Model Context Protocol | mcp, model context protocol, mcp server |
| `rag` | Retrieval augmented generation | rag, retrieval, chunking, grounding |
| `embeddings` | Vectors/similarity | embedding, vector, similarity, vector db |
| `evals` | AI evaluation | eval, benchmark, rubric, judge, scoring ai |
| `training` | Model training | training, pretraining, gpu, distributed, dataset |
| `fine-tuning` | Adaptation | fine-tune, lora, qlora, peft, adapter |
| `inference` | Serving models | inference, serving, quantization, llama.cpp, vllm |
| `mlops` | ML lifecycle ops | mlops, experiment tracking, registry, deployment ml |
| `context-engineering` | Context/memory mgmt | context window, context engineering, compaction, memory |

### design-ui — 10

| Label | What it means | Signals |
|---|---|---|
| `ux` | User experience | ux, user flow, journey, usability |
| `ui` | Interface design | ui, layout, interface, screen design |
| `design-system` | Tokens/components | design system, tokens, component library, style guide |
| `brand` | Brand identity | brand, logo, identity, brand voice |
| `typography` | Type craft | typography, font, type scale, typeface |
| `color` ⟨trim⟩ | Color systems | color, palette, contrast, hsl |
| `icons` ⟨trim⟩ | Iconography | icon, icon set, svg icons |
| `figma` | Figma workflows | figma, frames, auto layout, figma plugin |
| `prototyping` | Mockups/wireframes | prototype, wireframe, mockup, sketch |
| `design-to-code` | Design → code | design to code, screenshot to code, figma to code, pixel perfect |

### art-creative — 8

| Label | What it means | Signals |
|---|---|---|
| `generative-art` | Code art | generative art, p5.js, processing, flow field, particle |
| `illustration` | Drawn imagery | illustration, drawing, vector art, procreate |
| `pixel-art` | Pixel/retro | pixel art, sprite, aseprite, 8-bit |
| `3d-modeling` | 3D assets | 3d model, blender, mesh, sculpt, openscad |
| `animation-motion` | Animation/motion | animation, motion graphics, easing, motion canvas |
| `poster-print` | Print design | poster, flyer, print, cmyk, print layout |
| `photography` ⟨trim⟩ | Photo craft | photography, photo, composition, lighting |
| `comics` ⟨trim⟩ | Comics/visual stories | comic, manga, storyboard, panels |

### media — 9

| Label | What it means | Signals |
|---|---|---|
| `image-generation` | Generate images | image generation, diffusion, midjourney, stable diffusion |
| `image-editing` | Edit images | image editing, retouch, upscale, inpaint, background removal |
| `video-generation` | Generate video | video generation, veo, sora, runway, kling |
| `video-editing` | Edit video | video editing, cut, timeline, captions, recut |
| `audio-music` | Audio/music | audio, music, jingle, mixing, sound design |
| `tts-speech` | Speech synthesis | tts, text to speech, voice, speech |
| `subtitles-captions` | Captions/transcripts | subtitle, caption, transcript, srt, vtt |
| `media-pipelines` | Encoding/ffmpeg | ffmpeg, encode, transcode, codec |
| `podcast-streaming` ⟨trim⟩ | Publish media | podcast, stream, youtube, publishing video |

### writing — 9

| Label | What it means | Signals |
|---|---|---|
| `copywriting` | Marketing copy | copy, headline, ad copy, landing copy |
| `blogging` | Blogs/articles | blog, article, post, editorial |
| `storytelling` | Narrative fiction | story, narrative, fiction, character, plot |
| `screenwriting` ⟨trim⟩ | Scripts | screenplay, script, dialogue, scenes |
| `editing` | Revise/polish | edit, proofread, copyedit, line edit |
| `humanizing` | Natural voice | humanize, de-slop, natural tone, avoid ai writing |
| `seo-writing` | Search-optimized content | seo content, search intent, serp, keyword placement |
| `translation` | Translate | translate, translation, bilingual, localization text |
| `resumes` | CVs/job docs | resume, cv, cover letter, job application |

### docs-productivity — 9

| Label | What it means | Signals |
|---|---|---|
| `documentation` | Docs authoring | docs, documentation, guide, tutorial |
| `api-docs` | API reference | api docs, reference, openapi docs |
| `readme` ⟨trim⟩ | Repo docs | readme, contributing, changelog |
| `knowledge-base` | KB/wiki | knowledge base, wiki, faq, handbook |
| `note-taking` | Notes/PKM | note, obsidian, pkm, zettelkasten |
| `office-docs` | Word/Excel/PowerPoint | docx, word, xlsx, excel, pptx, powerpoint |
| `pdf` | PDF workflows | pdf, form, extract, merge, ocr |
| `meeting-notes` | Meetings | meeting, minutes, agenda, action items |
| `adr` | Decision records | adr, decision record, rfc |

### marketing-growth — 10

| Label | What it means | Signals |
|---|---|---|
| `seo` | Search optimization | seo, serp, backlink, on-page |
| `geo-aeo` | AI-search optimization | geo, aeo, ai overviews, llm visibility, ai search |
| `keyword-research` | Keywords | keyword research, search volume, long-tail |
| `content-strategy` | Content planning | content strategy, editorial calendar, topic cluster |
| `social-media` | Social platforms | social, twitter, x, linkedin, instagram, tiktok |
| `paid-ads` | Ad platforms | ads, google ads, meta ads, ppc, campaign |
| `email-marketing` | Email/lifecycle | email marketing, newsletter, drip, deliverability |
| `cro` | Conversion optimization | cro, conversion, funnel, landing page, signup flow |
| `marketing-analytics` | Measurement | ga4, attribution, utm, marketing analytics |
| `ab-testing` | Experiments | a/b test, experiment, variant, significance |

### business-ops — 11

| Label | What it means | Signals |
|---|---|---|
| `strategy` | Business strategy | strategy, swot, positioning, business model |
| `finance` | Finance/valuation | finance, valuation, dcf, p&l, cashflow |
| `accounting` | Books/tax | accounting, bookkeeping, invoice, tax, vat |
| `legal` | Legal/contracts | legal, contract, terms, nda, compliance legal |
| `hr-recruiting` | People ops | hr, recruiting, hiring, interview, onboarding |
| `sales-crm` | Sales | sales, crm, pipeline, deal, prospecting |
| `customer-support` | Support | support, ticket, helpdesk, customer service |
| `ecommerce` | Stores/marketplaces | ecommerce, shopify, amazon, product listing |
| `pricing` | Pricing/monetization | pricing, plan, monetization, packaging |
| `fundraising` ⟨trim⟩ | Investors | fundraising, pitch deck, investor, cap table |
| `feedback-reviews` ⟨trim⟩ | Performance/feedback | 360 feedback, performance review, peer review |

### product — 8

| Label | What it means | Signals |
|---|---|---|
| `prd-specs` | PRDs/specs | prd, spec, requirements, user story |
| `roadmaps` | Product planning | roadmap, milestone, now next later |
| `tickets-backlog` | Issue tracking | ticket, backlog, issue, jira, kanban |
| `user-research` | Research with users | user interview, usability test, persona, jtbd |
| `prioritization` | Prioritization | prioritize, rice, moscow, tradeoff |
| `project-management` | PM execution | project plan, gantt, status report, stakeholder, risk |
| `brainstorming` | Ideation | brainstorm, ideate, divergent, concept |
| `okrs` | Goals | okr, objectives, key results, goals |

### communication — 6

| Label | What it means | Signals |
|---|---|---|
| `email-comms` | Email writing | email, reply, inbox, follow-up |
| `internal-comms` | Statuses/updates | status update, leadership update, 3p update, internal newsletter |
| `outreach` | Cold/warm outreach | outreach, cold email, dm, prospecting message |
| `presentations` | Slides/talks | presentation, deck, slides, pitch, keynote |
| `community` ⟨trim⟩ | Community mgmt | community, moderation, discord, forum |
| `meetings` ⟨trim⟩ | Facilitation | meeting facilitation, agenda, workshop |

### research — 8

| Label | What it means | Signals |
|---|---|---|
| `web-research` | Online research | web search, research, sources, browsing |
| `academic` | Papers/scholarship | paper, arxiv, academic, peer review |
| `literature-review` | Literature reviews | literature review, systematic review, survey paper |
| `citations` | Citing/sourcing | citation, reference, bibtex, bibliography |
| `fact-checking` | Verification | fact check, verify claim, debunk, source check |
| `competitive-analysis` | Competitor research | competitor, teardown, landscape, benchmarking |
| `market-research` | Market analysis | market research, market sizing, tam, trends |
| `scientific-computing` | Science code/sims | astropy, bioinformatics, genomics, simulation, numpy |

### education — 5

| Label | What it means | Signals |
|---|---|---|
| `tutoring` | Teaching/explaining | tutor, teach, student, explain |
| `curriculum` | Course design | curriculum, syllabus, lesson plan, course |
| `learning-paths` | Study plans | learning path, study plan, roadmap learning |
| `quizzes-assessment` ⟨trim⟩ | Assessment | quiz, assessment, exam, flashcard |
| `educational-content` | Learning material | educational, eli5, analogy, examples for learning |

### integrations — 8

| Label | What it means | Signals |
|---|---|---|
| `saas-connector` | Connecting SaaS | notion, slack, linear, connector, integration |
| `api-integration` | Third-party APIs | api integration, rest client, sdk integration |
| `auth-oauth` | Auth flows | oauth, oidc, jwt, sso, login flow |
| `payments` | Payments/billing | stripe, payment, billing, checkout, subscription |
| `google-workspace` | Google APIs | gmail, google drive, google calendar, sheets api |
| `microsoft-365` ⟨trim⟩ | Microsoft APIs | outlook, teams, sharepoint, excel api |
| `github-integrations` | GitHub platform | github, gh cli, actions, pr bot |
| `notifications` | Messaging APIs | notification, webhook send, push, telegram, email api |

### automation — 6

| Label | What it means | Signals |
|---|---|---|
| `workflow-automation` | Orchestrating tools | workflow, automation, zapier, make, n8n |
| `rpa` | Process automation | rpa, desktop automation, ui automation |
| `browser-automation` | Driving browsers | browser automation, playwright, puppeteer, cdp |
| `scraping` | Web data extraction | scrape, crawler, crawl, firecrawl, spider |
| `cron-jobs` | Scheduling | cron, scheduled job, trigger, timer |
| `file-automation` ⟨trim⟩ | File ops | file organizer, rename, batch files, watcher |

### mobile — 6

| Label | What it means | Signals |
|---|---|---|
| `ios` | Apple platforms | ios, swift, swiftui, xcode |
| `android` | Android | android, kotlin, jetpack, gradle |
| `react-native` | RN/Expo | react native, expo, metro |
| `flutter` | Flutter | flutter, dart, widget |
| `app-store` ⟨trim⟩ | Store submission | app store, play store, aso, app release |
| `mobile-ui` | Mobile design | mobile design, touch, ios design, android design |

### games — 7

| Label | What it means | Signals |
|---|---|---|
| `game-design` | Mechanics/loops | game design, mechanics, balance, game loop |
| `unity` | Unity engine | unity, prefab, csharp unity |
| `godot` | Godot engine | godot, gdscript |
| `unreal` ⟨trim⟩ | Unreal engine | unreal, blueprint, ue5 |
| `2d-games` | 2D games | 2d game, sprite game, platformer |
| `3d-game-assets` | 3D game assets | 3d asset, level art, rigging, texture game |
| `npc-writing` ⟨trim⟩ | Game content | npc, dialogue, quest, lore |

### web3 — 6

| Label | What it means | Signals |
|---|---|---|
| `blockchain` | Chains/networks | blockchain, chain, consensus, node |
| `smart-contracts` | Contracts | smart contract, solidity, anchor, evm |
| `defi` | DeFi | defi, swap, liquidity, yield |
| `nft` | NFTs | nft, mint, token metadata |
| `wallets` | Wallets/keys | wallet, seed phrase, signature, custody |
| `tokenomics` ⟨trim⟩ | Token design | token, tokenomics, dao, governance |

### iot-hardware — 6

| Label | What it means | Signals |
|---|---|---|
| `embedded` | Microcontrollers/firmware | arduino, esp32, firmware, microcontroller, rtos |
| `robotics` | Robots/drones | robot, ros, drone, servo, actuator |
| `cad-printing` | CAD/physical fabrication | cad, fusion 360, 3d printing, gcode, pcb |
| `smart-home` | Home automation hardware | home assistant, zigbee, mqtt, smart home |
| `sensors` | Sensor integration | sensor, i2c, spi, gpio, telemetry |
| `electronics-tooling` | Electronics work | oscilloscope, soldering, circuit, schematic |

### lifestyle — 5

| Label | What it means | Signals |
|---|---|---|
| `travel` | Travel planning | travel, itinerary, flight, hotel |
| `food-cooking` | Food/recipes | recipe, cooking, meal plan, nutrition |
| `health-fitness` | Health/fitness | workout, fitness, health, sleep, medical |
| `personal-finance` | Personal money | budget, savings, personal finance, pension |
| `home-life` | Home/daily life | furniture, home, dating, errands, shopping |

### Cross-cutting — 7

These can attach to any skill regardless of category.

| Label | What it means | Signals |
|---|---|---|
| `accessibility` | A11y focus | accessibility, wcag, screen reader, contrast |
| `internationalization` | i18n/l10n | i18n, l10n, locale, rtl |
| `templates` | Templates/starters | template, boilerplate, starter, scaffold |
| `plugins` ⟨trim⟩ | Plugin ecosystems | plugin, addon, extension architecture |
| `multimodal` | Cross-media AI | multimodal, vision, audio image |
| `dataset` | Data corpora | dataset, corpus, training data |
| `self-hosted` ⟨trim⟩ | Self-hosting | self-hosted, homelab, docker compose deploy |

**Counts:** 24 categories · 210 labels · all kept for v1 (the 27 ⟨trim⟩ markers now flag labels to watch for classifier noise after the first population, not cuts). Any pruning happens against real population data in Phase 4.

---

## 4. Assignment model (Phase 3 design preview)

Deterministic, explainable, testable — in priority order:

1. **Frontmatter** — if SKILL.md declares `category` or `tags`, map through the v2 thesaurus (highest trust).
2. **Source hint** — GitHub topic → category map and the curated `seed-repos.json` hints; marketplace `category` through `mapCategory` v2.
3. **Keyword scoring** — per-label signal terms: name ×3, description ×2, body headings/first lines ×1; `category` = parent of the winning label; `labels` = all labels above threshold, capped.
4. **Cluster tie-break** — sibling skills in the same cluster vote (optional, only when scores tie).
5. **Fallback** — if nothing clears the bar: `category: engineering`, `labels: []`, confidence recorded; eligible for optional LLM assist (existing cost-capped client), never a silent `engineering` for an obvious misfit.

Stored: `labels: string[]` added to `SkillRecord` (default `[]`, backward compatible) + confidence. `search.db` FTS gains labels; index `counts.byCategory` drives the dashboard.

### Overlap precedence (which category wins)

One category per skill; labels carry everything else. When several categories score, resolve in this order:

1. **Frontmatter / seed hint** — explicit wins.
2. **Specialised over generic** — if a specialised label (`mobile`, `games`, `web3`, `ai`, `security`, `data`, `iot-hardware`) ties with a generic one, the specialised category wins; `engineering` is the catch-all of last resort.
3. **Artifact over activity** — classify by what the skill produces, not the context it's used in: a video-ad generator → `media` (artifact: video) + `paid-ads` label, not `marketing-growth`; a campaign strategy doc → `marketing-growth`; design decisions → `design-ui`; art objects → `art-creative`.
4. **Build over analyse** — building software/infra → `engineering`/`infrastructure-devops`; analysing data → `data`; finding/verifying knowledge → `research`.
5. **Connect vs act** — connecting systems → `integrations`; acting without a human (browser/scrape/cron) → `automation`.
6. **Business vs product** — revenue/ops/people → `business-ops`; what-to-build decisions → `product`.
7. **Life vs work** — personal-life skills → `lifestyle` even if technically complex (e.g., personal budget → `lifestyle/personal-finance`, business books → `business-ops/finance`).
8. **CAD split** — physical fabrication → `iot-hardware/cad-printing`; artistic 3D → `art-creative/3d-modeling`.

Known overlap pairs and their rule: design-ui ↔ engineering (artifact vs code), art-creative ↔ media (authored vs produced asset), writing ↔ marketing-growth (copy vs campaign), research ↔ marketing-growth (knowledge vs demand), data ↔ ai (analysis vs models), integrations ↔ automation (connect vs act), mobile/games/web3 ↔ engineering (specialised platform wins), lifestyle ↔ business-ops (personal vs business context).

### Coverage check (the work types you named)

| Work type | Category | Labels that carry the nuance |
|---|---|---|
| Research | `research` | web-research, academic, literature-review, citations, fact-checking, scientific-computing |
| Websites | `engineering` + `design-ui` | web-frontend, web-backend, fullstack, ui, ux, design-to-code, performance |
| Motion graphics | `art-creative` | animation-motion; video production lands in `media` (video-generation, video-editing) |
| Writing | `writing` | copywriting, blogging, storytelling, editing, humanizing, translation |
| Sales / marketing | `business-ops` + `marketing-growth` | sales-crm vs seo, geo-aeo, paid-ads, email-marketing, cro |
| AI | `ai` | agents, multi-agent, mcp, rag, evals, training, fine-tuning, inference |
| Games | `games` | game-design, unity, godot, 2d-games, 3d-game-assets |
| Mobile | `mobile` | ios, android, react-native, flutter |
| Embedded / hardware | `iot-hardware` | embedded, robotics, cad-printing, smart-home, sensors |
| Personal life | `lifestyle` | travel, food-cooking, health-fitness, personal-finance, home-life |

Nothing in the two mined catalogs (123 local + 449 CI) falls outside this table; residual odds and ends default to `engineering` with `labels: []`, which Phase 4's population report will surface.

## 5. Goal profiles v2 (preview — weights frozen at Phase 2)

| Profile | Weights | Change |
|---|---|---|
| `coding` | engineering .28 · testing .15 · infrastructure-devops .15 · security .10 · ai .10 · data .10 · docs-productivity .07 · research .05 | ai added |
| `content` | writing .30 · marketing-growth .20 · design-ui .15 · media .15 · art-creative .10 · research .10 | media/art split |
| `research` | research .35 · data .20 · ai .15 · writing .15 · docs-productivity .10 · engineering .05 | ai added |
| `business-ops` | business-ops .45 · marketing-growth .20 · product .10 · data .10 · docs-productivity .10 · communication .05 | product/comm added |
| `design-creative` | design-ui .40 · art-creative .25 · media .20 · writing .10 · engineering .05 | art/media split |
| `ai-builder` | ai .40 · engineering .20 · data .15 · integrations .10 · testing .10 · security .05 | new profile |
| `game-dev` | games .50 · art-creative .15 · engineering .15 · media .10 · writing .10 | new profile |

## 6. Migration map (old 12 → new 22)

| Old | New |
|---|---|
| engineering, testing, design-ui, writing, data, research, marketing-growth, docs-productivity, security, infrastructure-devops | unchanged ids |
| media-creative | split → `art-creative` + `media` (label-level reassignment by classifier) |
| business-finance | renamed → `business-ops` |
| — | new: `ai`, `product`, `communication`, `education`, `integrations`, `automation`, `mobile`, `games`, `web3` |

No data migration code: the Phase 4 re-sync re-categorises every skill with the v2 classifier; rubric evals are reused via the content-hash cache.

## 7. Acceptance for Phase 3 (build)

- Golden set: 50 hand-labelled skills from the local + CI catalogs; classifier agreement ≥90%.
- Every record gets ≥1 label; ≤2% fall back unlabelled.
- Category spread after re-sync: no category >40% (today: 92% engineering CI / 80% local).
- `npm test` + `npm run typecheck` green; dashboard/filters/coverage render on v2.

## 8. Decisions taken (frozen 2026-10-05)

1. **Categories:** 24 — the 22 listed plus `iot-hardware` and `lifestyle` promoted from watchlist, so every work type found in the mined catalogs has a home.
2. **Labels:** all 210 kept for v1; no cuts. ⟨trim⟩ markers become a noise-watch list for the Phase 4 population report.
3. **Goal profiles:** 7 — existing 5 updated to v2 weights, plus `ai-builder` and `game-dev`.
4. **Overlap:** precedence rules above are normative for the classifier tie-breaks.
5. **Population:** GitHub topic sweep + curated `seed-repos.json`; optional code search later; first target 1–3k verified skills.
6. **License policy (settled 2026-10-05):** strict — unlicensed repos are rejected at the gate and stay out of the catalog (dominant rejection reason in verification; the public CI catalog is likewise license-vetted). Revisit only if real coverage gaps justify flagging `unknown-license` the way the marketplace source does.

**Implementation status (2026-10-05):** built and tested — `taxonomy.ts` (24 categories), `labels.ts` (210-label classifier, golden set 60/60 = 100%), normalize/types/publish/coverage/UI wired, `seed-repos.json` (53 curated repos) + topic sweep with pagination/qualifiers, CI + local task updated. Verification sweep (2 topics × 12 repos × 15 skills + 53 seeds): **637 candidates → 410 published across 22 categories; max category share 17.8%** (was 92% engineering). Remaining before live population: license policy for unlicensed repos (26 of 38 rejections in the seed sample) and the paid eval/vector pass on the live store.
