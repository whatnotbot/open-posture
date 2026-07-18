# Governance

Open Posture uses a maintainer-led, evidence-based model.

## Roles

- Contributors report, design, implement, test, document, and review.
- Domain reviewers provide required review in areas such as posture intelligence, accessibility, security/privacy, storage, platform behavior, and release evidence.
- Domain maintainers may merge within areas explicitly assigned in the repository's public maintainer record; until that record names them, only the project maintainer may merge.
- The project maintainer owns roadmap, scope, ordinary conflict resolution, and final source-release approval after protected gates.

Sustained constructive contribution may lead to trusted-contributor, reviewer, or maintainer responsibility. Appointment requires nomination, a second maintainer’s approval, sound privacy/test/conduct judgment, and explicit acceptance of the time commitment. Contribution volume alone does not confer authority.

## Decisions

Routine fixes use a focused PR, green checks, and non-author review. Material feature, architecture, scoring, schema, dependency, privacy, or governance changes begin with a public design issue unless security-sensitive. High-risk changes require the domain owner and an independent reviewer.

No person may merge their own high-risk work, waive a privacy/accessibility/safety/release blocker, approve their own effectiveness claim, or publish a stable release alone. Security-sensitive work follows the private process in `SECURITY.md`.

## Inactivity and sustainability

Maintainers may mark themselves unavailable without explanation. Required routing is reassigned after 60 days of inactivity or on request. If fewer than two qualified reviewers remain, high-risk changes and stable releases pause. If maintenance ends, the repository will be archived with an honest status and fork instructions.
