# Open Posture — Team Charter, Responsibilities, and Delivery Model

- Status: Active maintainer and contributor operating model
- Companion specification: [open-posture-requirements.md](./open-posture-requirements.md)
- Project model: Fully open-source, source-available, local-first, community maintained, with controlled direct macOS distribution

## 1. Purpose

This charter defines the team that will design, build, validate, ship, and maintain the Open Posture requirements. It assigns one accountable owner to every critical outcome while preserving cross-functional review for posture intelligence, privacy, accessibility, and release claims.

Role names are responsibilities, not employment requirements. One qualified contributor may hold several compatible roles in the initial project, but high-risk decisions retain independent review requirements.

The operating model synthesizes five independent specialist workstreams: Product/Human Factors, Posture Intelligence, Desktop Engineering, Quality/Release, and Open-Source Operations.

## 2. Team design principles

- Helpfulness is measured by whether reminders are timely, understandable, low-noise, and help users voluntarily return toward their own comfortable calibration—not by claiming medical correction.
- Camera privacy, runtime-offline behavior, Cannot assess neutrality, and camera-stop behavior are release invariants.
- Product, algorithm, accessibility, security, and platform quality are designed together rather than inspected only at the end.
- Every subsystem has one directly responsible owner, a documented backup, measurable acceptance criteria, and reproducible tests.
- Maintainers publish evidence and platform status honestly. CI-tested is not the same as verified on real hardware.
- State-of-the-art means explainable personal calibration, strong confidence gating, deterministic validation, excellent resource use, accessible corrective UX, and unusually transparent open-source engineering—not speculative frameworks or opaque AI.
- The smallest sustainable team structure wins. Process expands only when contribution volume or risk justifies it.

## 3. Recommended team topology

### 3.1 Five permanent workstreams

| Workstream | Accountable lead | Outcome owned |
|---|---|---|
| A. Product, Human Factors & Experience | Product and Human Factors Lead | The product solves a real desk-work problem safely, accessibly, and without shame or medical overclaiming |
| B. Posture Intelligence & Evaluation | Posture Intelligence Lead | Calibration, confidence, scoring, cues, and alert timing are explainable, reproducible, performant, and useful |
| C. Desktop Application & Privacy Engineering | Principal Desktop Engineer | Secure local-first Electron application behaves correctly on macOS, Windows, and Linux |
| D. Quality, Platform Verification & Release | Quality and Release Lead | Requirements are traceable, defects are caught, claims match evidence, and source/macOS artifact releases are reproducible |
| E. Open-Source Program & Community | Open-Source Program Lead | Repository, documentation, contribution flow, governance, security intake, and maintenance remain healthy |

The five leads form the Maintainer Council for cross-cutting decisions. This is a working council, not a voting bureaucracy: the directly accountable lead recommends, required reviewers can block violations of their protected boundary, and the Project Maintainer resolves ordinary scope conflicts.

### 3.2 State-of-the-art target roster

| # | Role archetype | Home workstream | Commitment |
|---:|---|---|---|
| 1 | Project Maintainer / Product Director | A/E | Core |
| 2 | Product and Human Factors Lead | A | Core |
| 3 | Product Designer and Content Designer | A | Core |
| 4 | Accessibility Specialist | A/D | Regular specialist |
| 5 | User Researcher / Research Operations | A | Regular specialist |
| 6 | Posture Intelligence Lead | B | Core |
| 7 | Applied Computer-Vision Engineer | B | Core |
| 8 | Evaluation and Benchmark Engineer | B/D | Core |
| 9 | Principal Desktop Engineer | C | Core |
| 10 | Electron / TypeScript Product Engineer | C | Core |
| 11 | Cross-Platform Integration Engineer | C/D | Core |
| 12 | Application Security and Privacy Engineer | C/D | Regular specialist and mandatory reviewer |
| 13 | Quality and Test-Automation Lead | D | Core |
| 14 | Performance and Reliability Engineer | B/C/D | Regular specialist |
| 15 | Developer Experience and Release Engineer | D/E | Core near release |
| 16 | Open-Source Program, Documentation and Community Lead | E | Core near public launch |
| 17 | Independent Human-Factors/Safety Advisor | A/B | Part-time external reviewer; no implementation ownership |

“Core” describes continuous responsibility, not necessarily one full-time employee. A mature project benefits from these distinct competencies; an early open-source project may combine compatible roles as described below.

### 3.3 Minimum credible seed team

Seven people can start without pretending to cover everything:

1. Project Maintainer + product/program ownership.
2. Human Factors + product design + user research, with contracted accessibility review.
3. Posture Intelligence Lead + applied CV implementation.
4. Evaluation/benchmark + performance engineering.
5. Principal Desktop Engineer + Electron product implementation.
6. Cross-platform + security/privacy engineering.
7. Quality automation + DevEx/release + initial documentation operations.

Before a public beta, add or contract independent accessibility, security/privacy, real-Windows, and human-factors review. Community management can begin with the Project Maintainer but must transfer to a named owner when issue/PR volume exceeds sustainable weekly capacity.

### 3.4 Role-combination guardrails

Compatible early combinations:

- Project Maintainer + Product Director + Open-Source Program Lead.
- Human Factors Lead + Product Designer + User Researcher, if research consent/data handling is independently reviewed.
- Posture Intelligence Lead + Applied CV Engineer.
- Evaluation Engineer + Performance Engineer.
- Principal Desktop Engineer + Electron Product Engineer.
- Cross-Platform Engineer + DevEx/Release Engineer.
- QA Lead + test automation implementation.

Combinations forbidden for final approval:

- Algorithm author cannot be the only reviewer of scoring validity or user-effectiveness claims.
- Feature author cannot be the only QA/release approver.
- Product owner cannot override privacy, accessibility, or non-medical release blockers alone.
- Security implementation owner cannot be the only reviewer of the threat model and privileged IPC changes.
- Release engineer cannot declare an OS “verified” without recorded independent/manual platform evidence.
- Community/growth owner cannot change in-app behavior, telemetry, or privacy policy to increase stars.

## 4. Role charters

### 4.1 Project direction

| ID / role | Owns and executes | Decision and stop-ship rights | Required outputs |
|---|---|---|---|
| GOV-01 — Project Maintainer / Product Director | Vision, scope, P0/P1/P2, roadmap, resource allocation, maintainer appointments, cross-workstream conflict resolution, final release decision, honest public claims | Final ordinary scope/sequence/merge authority after protected gates; cannot waive privacy, safety, accessibility, scientific-validity, signing/notarization, or release-evidence blockers | Product charter, decision log, funded/staffed plan, release go/no-go record, maintainer succession plan |

### 4.2 Workstream A — Product, Human Factors, and Experience

| ID / role | Owns and executes | Decision and stop-ship rights | Required outputs |
|---|---|---|---|
| PHE-01 — Product and Human Factors Lead | User problem/outcomes, supported context, human-factors hazards, calibration instructions, cue/alert burden, safe movement language, product acceptance, finding-to-backlog priority | Blocks unsafe guidance, universal-posture/medical claims, unsupported context, and unacceptable interruption burden; recommends scope to GOV-01 | Outcome hierarchy, hazard register, approved cue contract, claims/evidence matrix, product acceptance report |
| PHE-02 — Product Designer and Content/Trust Designer | State map, complete screen/interaction specifications, focus/keyboard annotations, error recovery, visual system, canonical terminology/copy, README/demo product language | Owns interaction and editorial consistency; blocks misleading/shaming/certainty language; cannot approve physical guidance or underlying evidence alone | Prototypes, component/state library, copy deck, terminology lint rules, implementation annotations, design-QA report |
| PHE-03 — Accessibility and Inclusive Design Specialist | WCAG interpretation, keyboard, focus, semantics, status announcements, zoom, contrast, reduced motion, screen-reader/platform AT validation, physically inclusive wording | Blocks unresolved critical-path accessibility barriers; owns severity; cannot approve own implemented exception | Accessibility plan, test scripts, VoiceOver/Narrator/Orca findings, exception register, release conformance statement |
| PHE-04 — User Research and Research Operations Lead | Research questions/protocols, recruitment/consent, diverse participant panel, moderation, mixed-method analysis, data minimization/retention/deletion, insight repository | Stops sessions for discomfort/privacy/request; rejects invalid methods or insufficient evidence; cannot set algorithm/claims alone | Preregistration, consent/data plan, de-identified findings, participant coverage matrix, claims-evidence dossier, deletion closeout |
| PHE-05 — Independent Human-Factors/Safety Advisor | Periodic external review of instructions, supported use, study safety, cue risks, and non-medical boundary | Advisory stop recommendation escalates to PHE-01/GOV-01; no implementation, product-priority, or medical-treatment authority | Signed review memo at prototype, beta, stable, and material cue/claim change |

### 4.3 Workstream B — Posture Intelligence and Evaluation

| ID / role | Owns and executes | Decision and stop-ship rights | Required outputs |
|---|---|---|---|
| PI-01 — Posture Intelligence Lead | Assessability, calibration, feature equations, robust statistics, score/EMA/dwell/cooldown/recovery, cue-key mapping, schema/version compatibility, algorithm docs | Blocks unreliable scoring, unexplained output change, silent incompatible calibration, or unsupported claim; cannot validate own change alone | Versioned algorithm spec/card, golden vectors, threshold rationale/delta, compatibility decision, limitations register |
| PI-02 — On-device CV Systems Engineer | MediaPipe/model/WASM, worker, frame transfer/disposal, timestamps, one-in-flight backpressure, adaptive FPS, restart/lifecycle, inference profiling | Blocks frame queues/leaks, UI-thread inference, invalid checksum, resource regressions; cannot redefine posture meaning alone | Worker lifecycle/data-flow, provenance/checksum, hardware benchmarks, soak/resource report, failure matrix |
| PI-03 — Applied Research and Evaluation Scientist | Hypotheses, development/holdout partition, metrics, sample-size rationale, event annotation, participant/session statistics, confidence intervals, experiment interpretation | Rejects protocol changes after results, pseudo-replication, inadequate evidence/claim, or false-alert tradeoff hidden by pooled metrics; cannot tune and approve on same corpus | Metric dictionary, experiment preregistration, deterministic analyses, benchmark/effectiveness report, limitations/go-no-go |
| PI-04 — Benchmark, Fixtures, and Reproducibility Engineer | Synthetic numeric/Y4M fixtures, generators, manifest/provenance/hashes, benchmark CLI/result schema, golden output, cross-OS determinism, traceability | Rejects personal/unlicensed/non-reproducible fixtures and silent golden-output edits; cannot approve expected changes alone | Fixture corpus/manifest, generation sources/seeds, benchmark runner, environment capture, traceability matrix |

### 4.4 Workstream C — Desktop Application, Platform, and Privacy Engineering

| ID / role | Owns and executes | Decision and stop-ship rights | Required outputs |
|---|---|---|---|
| ENG-01 — Principal Desktop Engineer | Electron architecture, process boundaries, state authority, IPC contract, architecture decisions, code ownership, technical sequencing, engineering standards and integration | Blocks architectural boundary violations, hidden second state authority, risky dependency/complexity, and changes lacking owner/tests; cannot waive security/release gates | Architecture map/ADRs, subsystem contracts, code-review map, implementation plan, technical risk/bus-factor register |
| ENG-02 — Electron / TypeScript Product Engineer | Main/preload/renderer implementation, onboarding/dashboard/correction/settings/history UI, tray/notification adapters, camera integration, accessible semantics, deterministic state bindings | Owns implementation choices within contracts; blocks designs impossible within secure/accessibility constraints; cannot approve own user-facing acceptance | Working vertical slices, unit/integration tests, UI state coverage, developer notes, defect fixes |
| ENG-03 — Cross-Platform Integration Engineer | macOS/Windows/Linux permission, camera, tray, notifications/fallback, lifecycle, windowing, fake-camera support, platform docs and manual reproduction | Blocks unsupported platform claims and platform hacks that disable OS security; cannot declare own change verified alone | Platform capability matrix, adapters, manual checklists, VM/hardware reports, platform troubleshooting |
| SEC-01 — Application Security and Privacy Engineer | Threat model, CSP/network denial, permission allowlist, IPC validation, storage/data lifecycle, dependency/supply-chain review, diagnostics redaction, private security intake coordination | Blocks external egress, frame/landmark persistence, broad privilege, microphone/sensitive permission, critical vulnerability, or misleading privacy claim; cannot be sole reviewer of own control | Threat model, privacy/data inventory, security tests, dependency/license review, incident/advisory record, release sign-off |

### 4.5 Workstream D — Quality, Reliability, and Release

| ID / role | Owns and executes | Decision and stop-ship rights | Required outputs |
|---|---|---|---|
| QA-01 — Quality and Test-Automation Lead | Test architecture, 233-case ownership, requirement traceability, fixtures/test adapters, CI E2E, defect severity/triage, accessibility/security test coordination, regression/flake policy | Blocks failed P0, untraceable behavior, invalid fixture, known critical flake, or release with missing evidence; cannot redefine requirements merely to pass | Test plan/matrix, automated suites, coverage/flake dashboard, defect report, signed release-quality report |
| REL-01 — Performance and Reliability Engineer | Latency/CPU/memory/startup budgets, adaptive-load evidence, resource instrumentation, soak/stress, track/worker/timer leak analysis, reference hardware baselines | Blocks unbounded queues/leaks, budget breach without accepted narrowed claim, or missing soak evidence; cannot approve semantics changed for speed alone | Reproducible benchmark profile, two/eight-hour soak results, regression report, resource troubleshooting |
| REL-02 — Developer Experience and Release Engineer | Node/lock/model reproducibility, CI matrix, action hardening, source-build and macOS package scripts, protected signing/notarization workflow, version/changelog/migrations, release checklist/tag/notes, rollback, platform evidence collection | Controls tag/artifact mechanics only after gates; blocks unreproducible release, missing migration/rollback, signature/notary/Gatekeeper failure, secret/artifact exposure, or inaccurate support table | CI/release workflows, per-architecture artifact/checksum evidence, release evidence bundle, signed checklist, source tag/notes, rollback and post-release verification |

### 4.6 Workstream E — Open-Source Program and Community

| ID / role | Owns and executes | Decision and stop-ship rights | Required outputs |
|---|---|---|---|
| OSS-01 — Open-Source Program, Documentation, and Community Lead | Governance/community files, canonical docs, issue/PR taxonomy/templates, contributor onboarding/mentoring, triage/cadence, release communications, asset provenance, conduct route, roadmap hygiene, launch/demo/community feedback | Blocks unlicensed/copied asset, unsafe issue request for footage, misleading launch material, unsustainable promise, conduct breach, or contribution without required provenance; cannot override technical/security gates | README/docs set, contributor journey, issue/PR queue, provenance inventory, community/release communications, maintainer health and succession report |

### 4.7 Responsibility standard for every role

Every role maintains:

- a named primary and backup;
- owned requirement IDs and repository paths;
- current artifacts with last-reviewed date;
- measurable acceptance and operational metrics;
- incoming/outgoing handoff contract;
- declared conflicts and decisions requiring independent review;
- at least one contributor-ready issue that transfers knowledge rather than hoarding it.

## 5. Decision rights and required independent review

### 5.1 Accountable decision owners

| Decision | Accountable owner | Required evidence/review | Non-overridable blocker |
|---|---|---|---|
| Product scope and sequence | GOV-01 | PHE-01 outcome case, capacity, technical estimate, QA impact | Protected privacy/safety/accessibility boundary |
| Supported use and physical guidance | PHE-01 | PI evidence, PHE-02 copy, PHE-03 inclusion, PHE-05 material-change review | Unsafe/universal/medical instruction |
| UX interaction/copy | PHE-02 | PHE-01 factual/safety, PHE-03 accessibility, SEC-01 privacy, implementation feasibility | Misleading camera/privacy/claim behavior |
| Algorithm/features/thresholds | PI-01 | Independent PI-03 analysis, PI-04 reproduction, QA regression; PHE-01 for alert/cue changes | Invalid experiment, false-alert guardrail, incompatible calibration hidden |
| Model/runtime update | PI-01 | PI-02 implementation, PI-03/04 full evaluation, SEC-01 provenance/privacy, ENG-03/REL-01 platform/performance | License/checksum/privacy/holdout/platform failure |
| Electron architecture | ENG-01 | Affected subsystem owner, SEC-01 for privilege/data, QA testability | Sandbox/offline/camera-stop invariant violation |
| Data/permission/IPC/network policy | SEC-01 | ENG-01 non-author review, QA attack/failure evidence, PHE-02 disclosure | External egress, frame/landmark persistence, broad permission/IPC, critical vulnerability |
| Accessibility conformance | PHE-03 | QA automation/manual AT, PHE-02 design, ENG implementation | Critical essential-task barrier |
| Platform verified status | ENG-03 | QA-01 current checklist plus independent physical/VM verifier and exact commit | CI-only evidence presented as real verification |
| Test completion/severity | QA-01 | Domain owner and reproducible evidence; independent approval for downgrade | Failed/missing P0, known critical flake, invalid fixture |
| Performance budget/waiver | REL-01 | Reproducible named-hardware result, ENG/PI analysis, QA review, public narrowed claim if accepted | Leak, unbounded queue, camera retained, alert flood |
| Tag/source and optional macOS artifact release | GOV-01 | REL-02 packet; QA, SEC, PHE, PI, ENG-03, accessibility and affected owners signed; exact DMG trust evidence when attached | Any unresolved non-waivable gate or failed required signature/notary/Gatekeeper/checksum test |

### 5.2 Two-key and multi-key changes

The author is never the only approver. Minimum approvals:

| Change class | Required keys |
|---|---|
| UI behavior/content | PHE-02 + non-author ENG-02; add PHE-01 for physical cue, PHE-03 for critical flow, SEC-01 for privacy/camera copy |
| Score/threshold/cue eligibility | PI-01 + independent PI-03 + PI-04 reproducibility + QA-01; add PHE-01/PHE-02 for user-facing effect |
| Model or feature schema | PI-01/02 + independent PI-03/04 + SEC-01 + QA-01 + REL-01/ENG-03 affected evidence |
| Camera/worker frame boundary | ENG-02/PI-02 + SEC-01 + non-author ENG-01 + QA regression |
| Preload/IPC/permissions/CSP/network | SEC-01 + ENG-01/03 non-author + QA security evidence |
| Stored field/schema/migration/deletion | SEC-01 + ENG-01 + REL-02 migration harness + QA failure/rollback evidence + PHE-02 disclosure |
| Workflow permission/dependency | REL-02 + SEC-01 + subsystem owner; major Electron/MediaPipe update gets full platform matrix |
| Platform claim | ENG-03 + QA-01 + independent verifier; GOV-01 approves wording only after evidence |
| Release | REL-02 prepares; domain leads sign; GOV-01 approves; no self-release |

### 5.3 Escalation protocol

1. Record the disagreement, evidence, user/risk impact, and reversible alternatives in the decision log or private security case.
2. The accountable owner proposes a decision; protected-boundary owners may block only within their stated domain.
3. A blocker cannot be relabeled or waived by its implementer. Severity downgrade needs a non-author domain reviewer and QA-01.
4. GOV-01 may narrow scope, remove a feature, or downgrade a platform claim to ship safely; GOV-01 cannot fabricate evidence or waive a hard invariant.
5. Changing a hard invariant requires an explicit requirements revision, public design issue when safe, and fresh threat/human-factors/test review—not an exception hidden in a PR.
6. If fewer than two trusted reviewers exist, sensitive work may be prepared but not included in a stable release.

## 6. Requirement ownership map

| Requirement area | Accountable | Responsible implementers | Mandatory reviewers/evidence |
|---|---|---|---|
| Goals, scope, personas, features (`FEAT`) | GOV-01 | PHE-01, OSS-01 | ENG-01, PI-01, QA-01, capacity/evidence |
| Onboarding, screens, flows, content (`ONB`, `SCR`, `FLOW`) | PHE-01 | PHE-02, ENG-02 | PHE-03, SEC-01, QA-01, user research |
| Accessibility (`A11Y`) | PHE-03 | PHE-02, ENG-02/03, QA automation | Manual AT user/platform evidence |
| Camera permission/preview/lifecycle (`CAM`) | ENG-01 | ENG-02, ENG-03, PI-02 | SEC-01, QA-01, physical platform checks |
| Calibration (`CAL`) | PI-01 | PI-01/02, ENG-02 | PI-03/04, PHE-01, QA-01, participant evidence |
| Assessability/features/score/smoothing (`ML`) | PI-01 | PI-01/02 | PI-03/04, QA-01, deterministic holdout |
| Dwell/cooldown/recovery/cues (`ALT`, `ML`) | PI-01 | PI-01, ENG-02 | PI-03/04, PHE-01/02, QA-01, usefulness/burden study |
| Native/in-app alerts and correction (`ALT`, `FDB`) | PHE-01 | PHE-02, ENG-02/03 | PI-01, PHE-03, SEC-01, QA-01, OS evidence |
| Pause/Snooze/tray/quit/sleep (`MON`, `TRAY`) | ENG-03 | ENG-02/03 | SEC-01, QA-01, real platform and camera-release evidence |
| Settings/history/data schema (`SET`, `HIST`, `DATA`) | ENG-01 | ENG-02, SEC-01 | PHE-02/03, REL-02, QA-01 |
| Offline/privacy/security/diagnostics (`ARCH`, `PRIV`, `DIAG`) | SEC-01 | SEC-01, ENG-01/02, REL-02 | Non-author security review, QA attack/failure tests |
| Error recovery/troubleshooting (`ERR`) | ENG-01 | All subsystem owners, PHE-02, OSS-01 | QA-01, PHE-03, affected-platform evidence |
| Performance/reliability (`NFR`) | REL-01 | PI-02, ENG-02/03, QA automation | QA-01, named hardware/OS, soak reports |
| Source setup/macOS distribution/portability/Windows (`INST`, `PLAT`, `WIN`) | REL-02 | REL-02, ENG-01/03 | SEC-01, QA-01, OSS-01, clean-clone and exact-artifact evidence |
| Repository/governance/docs/community (`OSS`) | OSS-01 | All document owners/contributors | GOV-01, SEC-01 for private routes, QA release audit |
| Tests/fixtures/traceability/gates (`TST`, `FX`, `TC-*`, `GATE`) | QA-01 | QA automation, domain test owners | Domain leads and independent manual verifiers |

Each requirement ID and test case in the companion specification must appear in a machine-readable or generated ownership manifest with: primary role, backup, repository path, implementation status, test/evidence, last review, and unresolved risk.

## 7. Delivery phases, deliverables, and staffing

Stable quality is gated by evidence, not a promised date.

| Phase | Primary team | Required deliverables | Exit gate |
|---|---|---|---|
| 0. Charter and foundation | GOV-01, all leads | Named hats/backups, architecture/state/data contracts, threat/hazard models, algorithm/model versioning, test/ownership manifests, research/fixture policies, locked toolchain/three-OS CI | No ownership gaps; hard invariants executable/documented; two-key review works |
| 1. Deterministic intelligence core | PI-01/03/04, QA-01 | Pure qualification/calibration/features/score/state modules, exact boundaries, golden numeric fixtures, algorithm card, cross-OS deterministic replay | ≥95% critical branch coverage; all core boundaries pass; independent algorithm review |
| 2. Secure vertical slice | ENG-01/02, PI-02, SEC-01, QA | Camera-off launch → consent → camera → worker → calibration → status → in-app alert → Pause/Quit; sandbox/network/permission enforcement; fake-camera E2E | Frames remain memory-local; tracks stop; happy/failure slice passes all required OS CI |
| 3. Complete MVP experience | PHE, ENG, PI, QA | Onboarding, dashboard, correction, tray/native best effort, Snooze, history/settings/deletion/diagnostics, error catalog, accessible semantics, canonical copy | Every P0 flow implemented/tested; formative user sessions find no open critical safety/trust/a11y issue |
| 4. Alpha hardening | QA, REL, ENG-03, SEC | Complete P0 automated catalog, fault injection, two/eight-hour soak as applicable, ARM Windows VM, real macOS/Linux evidence, local macOS package verification, migration rollback, accessibility/security audits | Zero S0/S1; budgets/pass or support narrowed; alpha evidence packet complete |
| 5. Public beta and outcome validation | PHE-04, PI-03, PI-04, OSS-01 | Privacy-preserving volunteer panel, scripted/ordinary movement benchmarks, alert usefulness/burden study, within-subject feedback-on vs silent comparison, physical Windows x64 evidence or honest downgrade | Narrow helpfulness claim supported; false-alert/interrupt targets pass; negative findings/limits published |
| 6. Stable release | REL-02, GOV-01, all gate owners | Exact-commit release packet, fresh-clone evidence, current platform/AT/security/privacy/human-factors sign-offs, docs/notices/model checks, migration/rollback, source notes, and exact signed/notarized/stapled macOS DMG evidence when attached | All GATE-001–030; only approved DMGs/checksum manifest attached; all claims match evidence |
| 7. Maintenance | OSS-01 plus subsystem rotation | Weekly triage when active, dependency/security review, regression tests, issue mentoring, platform revalidation, quarterly outcome/a11y/risk review | Sustainable queue, current evidence/docs, two-person knowledge on every sensitive area |

### 7.1 Staffing by phase

- Phase 0–1: the seven-person seed team is credible if independent Human Factors, Accessibility, and Security review is booked before choices freeze.
- Phase 2–3: all core engineering, PI, QA, and product roles need named weekly capacity; part-time reviewers attend change gates asynchronously.
- Phase 4: ENG-03, QA-01, REL-01/02, SEC-01, and platform volunteers become release-critical, not optional helpers.
- Phase 5: separate PHE-04/PI-03 research design and analysis from algorithm authors; use an independent method/statistical review for public outcome claims.
- Phase 6+: add OSS-01 capacity before launch traffic; split combined roles when a hat consumes more than one maintainer-day/week for four consecutive weeks or becomes the critical path twice.

## 8. Operating cadence and artifacts

### 8.1 Lean cadence

| Cadence | Participants | Required output |
|---|---|---|
| Continuous/asynchronous PR review | Author, CODEOWNER, independent reviewer | Requirement/test links, decision delta, evidence, approved or actionable review |
| Weekly 30-minute triage when activity exists | GOV-01, QA-01, OSS-01, rotating domain lead | Severity/owner/next action for product, platform, false-alert, discomfort, accessibility, privacy/security reports |
| Weekly workstream update | Each lead | Done/next/blockers, changed evidence, metric/risk delta, needed cross-review |
| Biweekly integrated demo | PHE, PI, ENG, QA | Actual source build showing one complete flow and failures; updated acceptance gaps |
| Biweekly formative research while designing | PHE-04, PHE-01/02, affected builders | De-identified findings linked to accepted/rejected/deferred decisions |
| Monthly evidence/risk review | Maintainer Council | Outcome, false-alert, quality, platform, security, accessibility, maintenance-capacity dashboard |
| Release-candidate gate review | All gate owners | Exact-commit evidence packet and explicit sign/block per domain |
| Quarterly maintenance review | Maintainers/backups | Bus factor, dependencies, roadmap/non-goals, support evidence age, accessibility and community health |

Meetings are skipped when there is no changed decision or evidence. The repository is the system of record.

### 8.2 Canonical artifacts and owners

| Artifact | Owner | Update trigger |
|---|---|---|
| Product charter/roadmap/decision log | GOV-01 | Scope/evidence/capacity change |
| Human-factors hazard and claims matrix | PHE-01 | Cue, supported context, study, public claim |
| State map/prototypes/copy deck | PHE-02 | User-visible state/copy change |
| Accessibility plan/exception register | PHE-03 | Critical flow/component/platform change |
| Research protocol/insight/evidence repository | PHE-04 | Study/finding/claim |
| Algorithm/model card and version delta | PI-01 | Behavioral/model/schema change |
| Experiment preregistration/results | PI-03 | Every behavioral candidate/effectiveness study |
| Fixture manifest/benchmark baseline | PI-04 | Model/algorithm/test corpus change |
| Architecture ADRs/contracts/data flows | ENG-01 | Boundary/dependency/state change |
| Platform capability/evidence matrix | ENG-03 | OS/Electron behavior or verification run |
| Threat model/privacy/data inventory | SEC-01 | Permission/IPC/data/dependency/network/diagnostic change |
| Test/ownership/traceability manifest | QA-01 | Requirement, implementation, test, severity change |
| Performance baseline/soak report | REL-01 | Runtime/model/platform/material implementation change |
| Release packet/changelog/support table | REL-02 | Candidate/tag/migration change |
| README/contributor/community/governance docs | OSS-01 | Workflow, public behavior, ownership, policy change |

### 8.3 Definition of Ready

A work item is ready only when it has: user/problem statement; requirement IDs; named accountable/implementing/review roles; privacy/accessibility/platform/algorithm impact; acceptance and test plan; fixture/data/provenance need; documentation/migration need; rejected simpler alternative; and a bounded completion condition.

### 8.4 Definition of Done

Done means code/design/research artifact is complete; affected deterministic/manual tests pass; no P0 regression or unreviewed protected boundary; docs/copy/traceability/provenance/migration updated; observed user/platform evidence attached where required; primary and backup can reproduce it; and the issue records the decision and remaining limitation. “Works on my machine” is not Done.

## 9. RACI for critical outcomes

Legend: **A** accountable final owner, **R** responsible doers, **C** mandatory consulted/review roles, **I** informed through the repository. Each row has one A; protected gates still apply.

| Outcome/work | A | R | C | I / evidence |
|---|---|---|---|---|
| Vision, scope, roadmap | GOV-01 | GOV-01, PHE-01 | ENG-01, PI-01, QA-01, OSS-01 | All; decision log/outcome case |
| Supported use/hazard analysis | PHE-01 | PHE-01, PHE-05 | PI-01/03, PHE-03/04, SEC-01 | GOV; hazard/limitations register |
| User research protocol/consent | PHE-04 | PHE-04 | PHE-01/03, PI-03, SEC-01, independent method reviewer | All; preregistration/data plan |
| Interaction/content system | PHE-02 | PHE-02, ENG-02 | PHE-01/03/04, SEC-01, PI-01 | QA; prototypes/copy deck |
| Accessibility acceptance | PHE-03 | PHE-03, PHE-02, ENG-02/03 | QA-01, platform/AT users | GOV; conformance/evidence |
| Algorithm/features/calibration | PI-01 | PI-01/02 | PI-03/04, PHE-01, QA-01 | ENG/GOV; spec/golden/benchmark |
| Evaluation protocol/statistics | PI-03 | PI-03, PI-04 | PHE-04, PI-01, QA-01, independent reviewer | GOV; preregistered report |
| Fixture/provenance system | PI-04 | PI-04, QA automation | PI-01/03, SEC-01, OSS-01 | REL; manifest/generator/hash |
| Model/worker integration | PI-02 | PI-02, ENG-02 | PI-01/03/04, SEC-01, REL-01 | QA; provenance/performance/soak |
| Desktop architecture/state | ENG-01 | ENG-01/02 | PI-01/02, ENG-03, SEC-01, QA-01 | All; ADR/contracts |
| Platform lifecycle/tray/alerts | ENG-03 | ENG-03, ENG-02 | PHE-02/03, SEC-01, QA-01 | GOV; capability/manual evidence |
| Security/privacy/data/IPC | SEC-01 | SEC-01, ENG-01/02 | QA-01, REL-02, PHE-02 | All; threat model/attack tests |
| Test strategy/catalog | QA-01 | QA automation, domain test owners | All affected domain leads | GOV/REL; traceability/pass report |
| Performance/reliability | REL-01 | REL-01, PI-02, ENG-02/03 | QA-01, PI-01 | GOV; named-hardware/soak evidence |
| CI/source and package reproducibility | REL-02 | REL-02, ENG-03 | SEC-01, QA-01, OSS-01 | GOV; exact-commit clean-clone and macOS artifact results |
| Platform verified claim | ENG-03 | QA platform coordinator/community verifier | QA-01, REL-02, PHE-03, SEC-01 | GOV; current exact-commit checklist |
| Docs/contributor experience | OSS-01 | OSS-01, domain doc owners | PHE-02, QA-01, SEC-01, REL-02 | Community; tested commands/provenance |
| Security response | SEC-01 | Two unconflicted responders | ENG-01, GOV-01, REL-02 as needed | Public after safe disclosure |
| Conduct response | OSS-01 conduct stewards | Two unconflicted stewards | GOV recusal/appeal contact | Minimal confidential record |
| Release evidence packet | REL-02 | REL-02, QA-01, all domain signers | OSS-01, GOV-01 | Community; exact tag packet |
| Final source and optional macOS artifact release | GOV-01 | GOV-01, REL-02 | QA, SEC, PHE, PI, ENG-03, Accessibility, OSS | Community; signed go/no-go and exact artifact trust evidence |

No RACI assignment authorizes self-approval, a gate waiver, or work outside the role’s competence.

## 10. User-helpfulness and scientific validation program

### 10.1 Claim boundary

The team is not validating “correct posture,” treatment, pain reduction, injury prevention, productivity, or clinical benefit. It is validating this narrow product claim:

> Low-noise alerts can help users notice sustained change and return toward the comfortable posture they personally calibrated.

If evidence succeeds, public wording may say: **“In our study, low-noise alerts increased how often participants returned near the posture they personally calibrated.”** No stronger health/ergonomic claim follows.

### 10.2 Primary research question and outcome

Does feedback increase the probability and speed of returning near the personal reference without unacceptable interruption, false alerts, confusion, discomfort, exclusion, or loss of trust?

Primary outcome: **Reset Success Rate** — the proportion of eligible assessable episodes reaching score ≥75 for three valid seconds within 120 seconds of alert delivery, compared within participant to matched threshold eligibility in a silent-feedback condition.

Secondary outcomes: time to recovery; alert usefulness/relevance; false/mistimed alerts; alerts per assessed hour; dismiss/snooze/pause/disable behavior; assessable time; calibration completion/retry; interruption burden; privacy/score/non-medical comprehension; critical-task accessibility; outcome variation by supported setup/platform; discomfort or unsafe interpretation.

### 10.3 Evidence ladder

| Stage | Team | Method | Advancement condition |
|---|---|---|---|
| E0 Expert/design review | PHE-01/02/03/05, PI-01, SEC-01 | Hazard/claim review, cognitive walkthrough, accessibility and privacy design review | No unsafe cue, deceptive state, or untestable claim |
| E1 Deterministic bench | PI-01/03/04, QA | Synthetic numeric fixtures and generated Y4M across boundaries/ordinary movement/failures | Exact deterministic contract; canonical false alerts zero |
| E2 Formative prototype | PHE-04 with PHE/ENG | Two rounds of 5–8 participants; include keyboard/screen-reader/low-vision/limited-mobility contexts | Essential tasks work; ≥90% understand personal-reference/privacy/non-medical meaning |
| E3 Local instrumented alpha | PHE-04, PI-03, SEC, QA | Aggregate-only, opt-in local research mode during natural desk work; no auto-upload | Provisional calibration/assessability/usefulness/burden targets; zero serious trust/safety/a11y issue |
| E4 Comparative beta | PI-03/PHE-04, independent method reviewer | Preregistered, counterbalanced within-subject feedback-on vs silent control; practical pilot 24–30 completers followed by optional field period | Positive within-participant reset effect plus guardrails; negative/uncertain results published |
| E5 Stable/maintenance | All leads | Real platform panel, ongoing issue synthesis, targeted revalidation on behavioral changes | Current evidence continues to match model/algorithm/platform release |

### 10.4 Initial product-quality targets

These are hypotheses/gates to revise from preregistered pilot evidence, never medical thresholds.

| Metric | Initial target |
|---|---:|
| Source-to-monitoring time | ≤10 minutes excluding downloads |
| In-app onboarding/calibration | Median <7 minutes; ≥90% completion on compatible hardware |
| Calibration after one retry | ≥95% supported attempts |
| Immediate recalibration repeatability | Score difference median ≤5, p90 ≤10 in unchanged setup |
| Personal-reference/privacy/non-medical comprehension | ≥90% correct without prompting |
| Assessable supported seated time | Median ≥95%, p10 ≥85% |
| Cross-resolution score stability | MAE ≤3; state/cue agreement ≥99% |
| Scripted sustained-drift event recall | ≥90% |
| Canonical ordinary-movement false alerts | 0 |
| Participant-reported unhelpful alerts | Median ≤0.25 per assessed hour; p90 ≤0.5 |
| Alert understandable/actionable | ≥80% |
| Clearly false/inappropriate or unacceptably interruptive | ≤10% |
| Alerted episodes recovering within 120 seconds | ≥70% plus positive preregistered delta vs silent control |
| Median recovery time among recovered episodes | ≤60 seconds |
| Participants disabling mainly from annoyance | <15% |
| Directional cue without qualified evidence | 0 |
| Painful/coercive study instruction or medical confusion left unresolved | 0 |
| Critical accessibility barrier in essential flow | 0 |
| Frame/raw-landmark/research auto-upload incident | 0 |

### 10.5 Study safeguards

1. Participants choose their own comfortable reference; researchers never physically position them or call a posture correct/incorrect.
2. Ordinary computer work is used. Do not induce slouching, neck extension, asymmetry, pain, or prolonged immobility.
3. Stop immediately on discomfort, pain, dizziness, distress, privacy concern, or request; provide only the standard qualified-professional boundary.
4. Recruitment covers supported OSs/cameras/workspaces, body proportions, appearance conditions, asymmetric comfortable positions, limited mobility, keyboard/screen-reader/low-vision/reduced-motion use—without inferring or unnecessarily collecting sensitive traits.
5. Minors, clinical populations, treatment contexts, workplace compliance, and health outcomes are outside v0.x and require separate formal legal/ethics review.
6. Analyze at participant/session/event level, not frames as independent samples. Freeze development/validation/holdout partitions; a threshold changed after holdout creates a new candidate/holdout.
7. Publish protocol, exact model/algorithm/fixture versions, aggregate results, confidence intervals, exclusions, limitations, and negative findings.

### 10.6 Privacy-preserving research data

Research mode is explicit and off by default. It may store locally only condition, eligible-episode time, delivery result, recovery result/time, assessed duration, version hashes, and optional participant usefulness response. Never collect frames, screenshots, audio, raw landmarks, feature vectors, continuous score traces, device labels/IDs, usernames, or paths. Nothing uploads automatically; the participant previews and manually exports pseudonymous event aggregates. Identity keys remain separate; retention/deletion is fixed before recruitment; small identifying cells are suppressed.

### 10.7 Change revalidation

- Cue/copy-only: comprehension, safety, accessibility, exact state tests.
- Threshold/dwell/recovery: full deterministic replay, false-alert guardrails, targeted human burden/effectiveness check.
- Feature equation/anchor/normalization: calibration compatibility, full benchmark, explicit recalibration, targeted participant validation.
- Model revision/replacement: provenance/license/security, full OS/hardware/fixture/soak/human benchmark, new model card, explicit recalibration unless equivalence is proven.
- Platform adapter: affected OS manual permission/camera/lifecycle/alert/AT evidence.
- New persisted field/network behavior: requirements revision, privacy threat/data review, user disclosure/research-data review, full security tests.

## 11. Quality, platform, and release organization

### 11.1 Ownership of the 233-case catalog

QA-01 maintains one canonical manifest row per case:

```text
test ID · requirement IDs · priority · test level · automated/manual
platforms · fixture IDs · primary owner · independent reviewer
implementation status · last passing exact commit/run · evidence · open issue
```

| Catalog area | Primary | Mandatory reviewers |
|---|---|---|
| Install/build/first launch | REL-02/QA automation | ENG-03 |
| Camera/calibration/ML | QA automation + PI test owner | QA-01, PI-03/04, PHE-01 where human behavior changes |
| Alerts/correction/state | QA automation | QA-01, PHE-02/03, PI-01 |
| History/storage/migrations | QA-01 | SEC-01, ENG-01, REL-02 |
| Security/offline/IPC/license | SEC-01 | QA-01, non-author ENG reviewer |
| Accessibility | PHE-03 | QA-01, PHE-02, platform verifier |
| Performance/soak | REL-01 | QA-01, ENG/PI owners |
| Manual platform | ENG-03/QA platform coordinator | Independent platform verifier |
| OSS/release gates | OSS-01/REL-02 | QA-01, GOV-01 |

P0 behavior requires positive, boundary, and relevant failure cases. A reproducible defect gets a regression test. Removing/quarantining a P0 test requires a public requirement rationale and independent QA approval.

### 11.2 Automation versus manual evidence

Automate on every PR: pure algorithm/state/data logic; adapters/fault injection; Electron fake-camera flows; process teardown; CSP/permissions/network/IPC/static endpoints/secrets/checksum/notices/CodeQL/dependency review; keyboard/accessibility automation; production compile on required runners.

Keep scripted/manual: real webcam driver and OS camera indicator; permission denial/re-enable; native notification/DND; tray overflow/status notifier; lock/sleep/wake and physical disconnect; GPU/power; VoiceOver/Narrator/Orca; visual zoom/reduced motion; fresh-clone docs; unusual Linux portal/desktop behavior.

### 11.3 Windows without owned hardware

1. Every PR: GitHub-hosted Windows x64 proves clean Node 24 install, typecheck/unit/integration/compile, checksum/licenses, fake-camera Electron, offline/security, and teardown.
2. Each beta/release candidate: Windows 11 ARM64 VM on Apple silicon with ARM64 Node, camera passthrough/USB when possible, permission/UI/tray/fallback/Pause/Snooze/Quit/lock checks. x64 emulation is exploratory only.
3. Before **Windows verified**: an independent volunteer runs the exact-commit checklist on physical Windows 11 x64 with a real camera. Until then, publish **Windows CI-tested / physical verification wanted**.

### 11.4 Severity and response targets

Best-effort open-source targets, not contractual SLAs:

| Severity | Examples | Acknowledge | Triage | Release rule |
|---|---|---:|---:|---|
| S0 Security/Safety | Frame egress/storage, mic, camera after Quit, broad IPC/RCE, data loss, dangerous/medical cue | Privately ≤24h when staffed | ≤24h | Stop/revert; coordinated response; no waiver |
| S1 Critical | Tier-1 core unusable, alert flood, migration corruption, essential a11y blocked, repeat crash | 1 business day | 2 business days | Blocks merge/release; patch candidate |
| S2 Major | Recoverable platform failure, incorrect fallback, substantial performance regression | 3 business days | 5 business days | Fix before next minor or disclose/narrow claim |
| S3 Minor | Cosmetic/low-impact/rare unsupported context | 7 days | 14 days | Prioritized backlog |
| S4 Enhancement | New/broader capability | 14 days | Roadmap review | No release block |

Reduced maintainer capacity is published; targets are not maintained through burnout. Security/conduct routes may use the OSS response targets if the team cannot credibly meet the stricter S0 target.

### 11.5 Performance and reliability gates

REL-01 records hardware/OS/method beside results and owns: warm UI ≤3 seconds; first suitable pose ≤3 seconds; interaction p95 <100 ms; inference p95 ≤180 ms with exact adaptive behavior; one in-flight image; ≤350 MB after 10 minutes; no unbounded post-warmup growth; Paused/Snoozed zero capture/inference; storage/log caps; 100 lifecycle cycles leak-free; two-hour P0 and eight-hour stable soak; cooldown/fresh-dwell alert-rate invariant.

Budget misses block stable release unless Product, QA, Performance, and Maintainer publicly narrow the relevant support claim. Privacy, camera-release, data-loss, alert-flood, and unbounded-resource failures cannot be waived.

### 11.6 Release evidence packet

REL-02 binds all evidence to the exact tag commit:

1. Lockfile/toolchain/model checksum and provenance.
2. Required CI, P0 catalog, coverage, fake-camera E2E.
3. Offline/CSP/IPC/permission/storage/security and supply-chain results.
4. Two/eight-hour soak and named-hardware performance.
5. Migration success plus forced-failure rollback.
6. Accessibility automation and current manual AT evidence.
7. Current macOS physical, Windows CI/ARM VM/physical-x64 status, and Linux Xvfb/X11/Wayland status.
8. Fresh-clone result for each verified platform.
9. Known defects/flakes/limitations and exact support wording.
10. Changelog/roadmap/security/model/notices/docs source and distribution notes, including install/upgrade/uninstall and trust status.
11. Confirmation that no unsigned/ad-hoc or unapproved binary, personal footage, unsafe diagnostic, secret, or unlicensed asset is attached; any macOS attachments are the exact approved DMGs plus checksum manifest.
12. Domain sign-offs and GOV-01 go/no-go.

### 11.7 Quality team health metrics

- P0 requirement/test traceability 100%; deterministic P0 automation ≥95% excluding inherently manual cases.
- Known release-suite flakes 0; repaired flakes pass 10 consecutive runs.
- Escaped S0/S1 target 0; reproducible defect regression-test rate 100%.
- Critical PR suite target ≤15 minutes; slow soaks scheduled/release-bound.
- Release evidence/provenance completeness 100%.
- Platform claims contradicted by evidence and sensitive test-artifact incidents 0.

## 12. Open-source community and maintenance model

### 12.1 Operating hats

OSS-01 may coordinate these hats, but named alternates and separation remain:

| Hat | Exact responsibility | Cannot do alone |
|---|---|---|
| Lead Maintainer / Project Steward | Scope, governance, maintainer appointments, roadmap/support policy, cross-domain conflict, maintenance/archive decision | Own high-risk PR/release, privacy exception, serious conduct sanction, self-serving governance change |
| Repository Operations / Release | Branch/tag/environment protections, Actions permissions, CodeQL/dependency review/Dependabot, signing/notary secret boundary, templates/labels/CODEOWNERS, settings drift, tag/artifact mechanics/evidence archive | Own workflow approval, gate bypass, dependency/model license, source and macOS artifact release |
| Documentation / Contributor Experience | README/quick start, contributor tour, architecture/privacy/algorithm/data/testing/troubleshooting editorial system, command verification, same-PR docs | Technical behavior/claim/license/privacy decision by documentation edit |
| Community Programs / Communications | Welcomes/mentors, genuine starter issues, feedback summaries, original demo/social preview, launch/release posts, capacity status | Technical claim/release, conduct sanction, security response, personal-data publication |
| Security/Privacy Response | Private vulnerability route, acknowledgement/triage, coordinated fix/disclosure, privacy-regression classification | Own-code severity/fix/disclosure, reporter attribution, privacy exception |
| Conduct/Safety Stewards | Separate private route, conflict check, evidence, immediate harm mitigation, recommendation/appeal | Permanent ban/serious sanction, public identity, conflicted decision |
| Domain Maintainers/CODEOWNERS | Technical review, requirement/test/docs ownership, starter issues and domain limitations | Own PR/high-risk change/release/scope outside domain |

Minimum public-launch coverage: three core maintainers for project, repo/release, and docs/community; two security responders; two conduct contacts; two people who can run a release; two capable reviewers for posture scoring, privacy/security, workflows, and storage/migrations.

### 12.2 Governance and contributor authority

Contributor → trusted contributor/triager → domain reviewer → domain maintainer → lead maintainer. Security/conduct responder authority is separate from code status. Promotion requires sustained substantive work/review, sound privacy/test/conduct judgment, nomination plus second-maintainer approval, explicit time acceptance, and no promise based on contribution count alone. Inactive maintainers can step away without stigma; required routing is removed after 60 days unavailable/on request and restored only after access/current-state review.

Decision classes:

- Routine bug/doc/test: focused PR, green checks, one qualified non-author approval.
- Material feature/architecture/threshold/schema/dependency: public design issue, alternatives/impacts, normally 7-day comment window.
- High risk model/network/privacy/workflow/governance: design issue unless security-sensitive, two qualified approvals and named specialist gate.
- Security-sensitive: coordinated private handling, public rationale when safe.
- Emergency active exploit/data-loss/privacy regression: two maintainers may patch/revert immediately; exact-commit checks and retrospective remain.

### 12.3 Issue/PR intake and mentoring

Triage first removes/redacts secrets, personal camera media, raw landmarks, identifiable screenshots, or exploit details; moves security/conduct privately; confirms scope/duplicate; requests minimum sanitized reproduction; prefers synthetic fixtures; assigns type/area/status/priority/platform, one DRI, acceptance/tests; closes only with resolution/duplicate/scope/explicit reason, never a stale bot.

A real `good first issue` has confirmed behavior, desired behavior/non-goals, acceptance, likely files, exact test command, privacy/a11y notes, one-focused-PR scope, and a named reviewer. It excludes critical scoring/privacy/security/migration/workflow authority. One mentor supports at most three active newcomers; distinguish required changes from suggestions; recognize docs/tests/reproduction/a11y/review as well as code; never rank contributors.

PRs include linked issue/decision, requirement/test groups, evidence/platforms, UI/a11y/privacy/security/data/docs/dependency/license/provenance impact, no personal camera/raw landmark/binary/secret data, migration/rollback when relevant, and scoring-fixture/threshold impact. High-risk paths require two approvals/CODEOWNER. Default squash merge.

### 12.4 Documentation and provenance

Behavior and docs change together. Commands are executed on claimed shells; runtime offline is distinguished from `npm ci`; platform status uses exact CI-tested/verified/experimental language; limitations sit next to claims; UI language remains personal-reference/non-medical; demos show the actual current source build.

The provenance inventory covers every dependency, Electron/MediaPipe/WASM/model version/hash, font, icon, logo, screenshot, demo, fixture, and sample. It records creator/source, explicit license/consent, modification, and verification date, including an explicit clean-room statement for SuperShrimp. No asset merges without a row and independent review.

### 12.5 Security and conduct routes

Enable GitHub private vulnerability reporting. `SECURITY.md` states supported versions, contents, best-effort response, coordinated disclosure, and no bounty. Treat external request, frame/landmark persistence, microphone, broad IPC, unsafe diagnostics, camera-after-stop, and data loss as security/privacy reports. Do not request webcam footage. Reporter credit is opt-in; disclosure/fix gets independent review.

Conduct uses a different private route with two trained contacts, recusal/appeal, minimal access/retention, immediate spam/doxxing/personal-data removal, and two-person serious sanctions. Public statements disclose only what safety requires.

### 12.6 Ethical growth and launch

Launch only when the real end-to-end source build, independent 10–20 second demo, verified quick start, privacy/source/platform status, starter issues with reviewers, security/conduct routes, and current evidence/limits exist. The launch message leads with the problem/demo/local privacy, three clone/run commands, support status, one technical insight, and a specific contribution request. One line below usefulness may ask for a star.

Never buy/exchange stars, automate follows/replies/DMs, spam communities, require a star for help, add in-app star prompts/tracking, inflate badge walls/counters, manufacture issues/activity, or present a mockup as shipped. Use GitHub, a personal X account, Show HN when ready, and relevant communities only under their rules. Follow-ups require substantive engineering/evidence/contributor stories and consent.

### 12.7 Sustainability controls and metrics

- Two repository administrators with passkeys/2FA/recovery; least privilege; no shared credentials.
- Two CODEOWNERS for critical paths and two release-capable people; quarterly secondary-owner rehearsal.
- Rotate/timebox public triage (recommended two hours/week); limit roadmap Now to three outcomes and mentors to three newcomers.
- Publish normal/reduced/maintenance mode; pause targets rather than silently burn out.
- No individual performs >50% of merges/reviews over eight weeks once three maintainers exist.
- Add dedicated community capacity after >10 substantive new issues/week for six weeks or >5 simultaneous newcomer PRs exceed mentoring capacity.
- Add release capacity when operational review, not product evidence, repeatedly delays tags.
- If fewer than two trusted maintainers remain, freeze high-risk changes/stable releases; if all leave, archive read-only with fork instructions.

Track issue/PR response, first-time/returning contributors, mentor load, contributions by type, command/provenance/release completion, review concentration, visitors/clones/stars/forks/watchers and aggregate X results. Treat working installations, useful issues, and contributor retention as more meaningful than stars. Use no in-app or third-party user tracking.

## 13. Risks, escalation, and bus-factor controls

### 13.1 Active organizational risk register

| Risk | Early signal | Accountable owner | Control / response |
|---|---|---|---|
| False alerts destroy trust | Unhelpful alerts >target, pause/disable, ordinary-movement issues | PI-01 | False-alert guardrail primary; publish slices; narrow context; do not improve recall by nuisance |
| App is mistaken for medical/“correct posture” system | Comprehension <90%, health questions, copied marketing language | PHE-01 | Claims matrix/content lint, research, advisor review, remove/clarify feature or claim |
| Camera/privacy regression | Unexpected egress/data field/mic/track after stop | SEC-01 | S0 private response, stop/revert release, threat/attack tests, disclosure |
| Algorithm overfits fixtures/holdout | Golden edits, threshold tuned after result, pooled frame metrics | PI-03 | Preregistration, participant split, frozen holdout, independent review/new holdout |
| Unevaluated users/setups get confident low scores | Slice gap, Cannot assess converted to drift | PI-01/PHE-01 | Neutral uncertainty, broaden private evidence before claim, publish not-yet-evaluated |
| Platform claim outruns evidence | CI green but real permission/tray/alert fails | ENG-03 | Exact evidence tiers, physical verifier, downgrade claim without blocking other platforms |
| Accessibility arrives late | Critical flows implemented without semantics/keyboard prototypes | PHE-03 | Review at prototype/vertical slice, P0 AT scripts, stop-ship authority |
| Electron/model/dependency update breaks trust or reproducibility | Major bump mixed with feature PR, checksum/license/perf delta | REL-02/PI-01/SEC | Separate update PR, full matrix/benchmark/provenance, rollback, explicit recalibration |
| Test suite becomes slow/flaky theater | >15m critical PR, quarantined P0, random E2E failures | QA-01 | Pure tests/adapters, failure artifacts, 10-run repair, scheduled soaks, no silent quarantine |
| Single maintainer/reviewer bottleneck | >50% reviews/merges, unavailable sensitive owner | GOV-01 | Primary/backup, rotations, rehearsal, knowledge-transfer issue, freeze high-risk work if two-key unavailable |
| Community success burns out team | Response targets missed, unreviewed starter issues, mentor overload | OSS-01 | Publish reduced mode, narrow intake/Now, cap mentor load, add capacity at triggers |
| Growth goal distorts product | Star nags, vanity work, rushed launch/claim | GOV-01/OSS-01 | Ethical-growth policy; outcome/evidence/repository quality gate promotion |
| Scope creep delays usable alpha | Backend, non-macOS installers, updater, App Store, plugins, themes, or social proposals | GOV-01 | Enforce companion non-goals; public defer reason; max three Now outcomes |
| Research data becomes hidden telemetry | Automatic export or continuous/body-derived collection | PHE-04/SEC | Separate explicit research mode, local aggregate-only/manual preview, preregistered retention |
| Release knowledge/settings inaccessible | One personal machine/token/private step | REL-02 | Two admins/release operators, protected environment/runbook, clean rehearsal, reproducible bounded artifacts, no secret in Git/logs/app |

### 13.2 Bus-factor minimums

- Every critical repository path has primary and secondary CODEOWNER by public beta; the secondary reviews one meaningful change per release cycle.
- Two admins, release operators, security responders, conduct contacts, and reviewers for scoring/privacy/workflows/storage.
- Architecture, algorithm, threat/data models, fixtures, platform checklists, research methods, and release process live in version control.
- No personal machine, secret service, unpublished fixture, manual binary, or private recording is necessary.
- Quarterly: access review, backup-owner release/security drill, clean-clone exercise, platform-rotation, inactive-owner update.
- A person may mark Away without explanation; remove them from required routing rather than pressure them.

### 13.3 Non-waivable stop conditions

Release stops for: frame/raw-landmark egress or persistence; microphone/unknown permission; camera not stopping; broad exploitable IPC; data loss/migration corruption; unbounded resource/alert flood; unsafe/medical cue; critical essential-task accessibility barrier; invalid model/license/provenance; false verified-platform claim; known S0/S1 or release-suite flake; missing independent reviewer; or evidence bound to a different commit.

## 14. First 90-day team execution plan

The responsible target for 90 days is a high-quality source alpha plus a local macOS installer candidate with evidence, not a prematurely “stable” or signed/notarized product claim.

| Time | Outcome | Accountable / primary roles | Concrete deliverables and gate |
|---|---|---|---|
| Days 1–7 | Team/repository ready | GOV-01, ENG-01, REL-02, OSS-01 | Assign all hats/backups/CODEOWNERS; branch/workflow/security/conduct setup; ownership/test manifests; max-three Now outcomes; no blank critical owner |
| Days 8–14 | Contracts and risks frozen | ENG-01, PI-01, SEC-01, PHE-01, QA-01 | Architecture/state/typed data contracts, algorithm v0, threat/privacy inventory, human-factors hazard/claims matrix, fixture/research policies, initial prototypes and test architecture |
| Days 15–28 | Deterministic engine | PI-01/03/04, QA | Pure qualification/calibration/features/score/EMA/dwell/recovery; numeric generators/golden; ≥95% critical branches; cross-OS exact replay; independent review |
| Days 22–35 | Formative product round 1 | PHE-01/02/03/04 | Complete clickable core-state prototype; 5–8 diverse sessions; privacy/score comprehension; accessibility findings; revised screen/copy/cues before expensive implementation |
| Days 29–42 | Secure vertical slice | ENG-01/02, PI-02, SEC-01, QA | Camera-off first launch → consent → local model/worker → calibration → live state → in-app alert → Pause/Quit; sandbox/offline/permission tests; fake-camera E2E on three OSs |
| Days 43–56 | MVP experience | PHE, ENG, PI, QA | Dashboard/correction, Snooze, tray/native adapters, errors, settings/history/deletion, accessible semantics, fixtures for ordinary movement/failure; formative round 2 |
| Days 57–70 | Hardening and platform evidence | QA-01, REL-01/02, ENG-03, SEC | Complete highest-risk P0 catalog; faults/migrations; two-hour soak; ARM Windows VM; physical macOS; Linux Xvfb plus available real check; AT/security audits; no S0/S1 |
| Days 71–80 | Privacy-preserving alpha pilot | PHE-04, PI-03/04, SEC, QA | Opt-in local aggregate-only research build; supported setup matrix; calibration/assessability/alert usefulness/burden results; no media collection/upload |
| Days 81–87 | Source and macOS installer alpha candidate | REL-02, QA-01, all domain leads | Exact-commit packet, fresh clone, local DMG package/resource checks, docs/provenance/model/notices, trust/support tier, known limits, original demo, real starter issues with mentors; no public installer without signed/notarized final-artifact evidence |
| Days 88–90 | Alpha go/no-go and public handoff | GOV-01, OSS-01, gate owners | Sign or block by domain; tag only if alpha gates pass; publish honest experimental status and specific verifier/contributor asks; post-alpha evidence backlog |

### 14.1 Parallel workstream goals

- Product/Human Factors: prove comprehension and control before adding polish; freeze the cue/claim allowlist by Day 42.
- Posture Intelligence: keep the first algorithm transparent/fixed; optimize false-alert guardrails, not a fancier score.
- Desktop Engineering: one end-to-end secure slice before separate screens; no native-notification/platform workaround may delay guaranteed in-app behavior.
- Quality/Release: build adapters/fixtures alongside implementation; no “test month” at the end.
- Open Source: make repo contributor-ready privately by Day 56; public promotion waits for the real demo/evidence/security/conduct routes.

### 14.2 After Day 90

Run the preregistered comparative beta, obtain physical Windows x64 evidence or keep the downgrade, close alert/a11y/performance gaps, and issue a stable release only when the companion requirements’ GATE-001–030 pass. Attach macOS DMGs only when their conditional artifact gates also pass. The calendar cannot override the evidence.

## 15. Definition of team readiness

- Every role/workstream/requirement/test has a primary owner, competent backup, repository path, and escalation route.
- All combined-role conflicts are identified and two-key reviewers are actually available.
- Maintainer Council accepts the product claim boundary, hard invariants, severity policy, and non-waivable blockers.
- Toolchain/CI/ownership/test manifests, architecture/state/data/algorithm contracts, threat/hazard models, research/fixture/provenance policies, and public/private intake routes exist.
- Product, PI, engineering, QA, security, accessibility, platform, release, and OSS leads can each state their evidence required to sign a release.
- Two people can administer the repository, handle a security report, run the release, and review every sensitive path; two unconflicted conduct contacts exist.
- The team has budgeted time/people for real users, assistive technology, macOS, Windows ARM VM + physical x64 volunteer, Linux, security review, and soak testing.
- The first three Now outcomes and 90-day capacity are realistic; reduced-capacity and maintenance/archive procedures are accepted.
- Nobody is rewarded for stars at the expense of user outcome, truthful claims, privacy, safety, accessibility, tests, or maintainer health.

When these are true, the team may begin Phase 1. When any becomes false, the relevant high-risk work pauses until ownership/evidence is restored.
