# Contributing

Thanks for helping build a private, explainable posture-awareness tool.

## Before starting

1. Read the quick start in `README.md`.
2. Read the relevant parts of `open-posture-requirements.md` and `open-posture-team-charter.md`.
3. Check existing issues or open a focused design issue for material algorithm, privacy, architecture, dependency, schema, or governance changes.
4. Never submit personal camera footage, raw landmarks, unsafe diagnostics, generated application binaries, secrets, or copied SuperShrimp material.

## Local workflow

```bash
npm ci --ignore-scripts
npm run model:verify
npm start
npm run check
```

Node 24.11.0 or newer within the 24.x line and npm 11 are required; the repository pins Node 24.14.0 and npm 11.18.0 as the verified toolchain. Source-only setup skips dependency install scripts; run a full `npm ci` before testing macOS packaging so the two reviewed, version-pinned native DMG helpers can build. Initial dependency installation uses the network; normal application runtime does not.

## Pull requests

Keep one problem per PR. Link the issue and list:

- affected requirement and test IDs;
- test commands/results and platforms exercised;
- UI/accessibility impact and screenshots when relevant;
- privacy, security, data, dependency, license, and documentation impact;
- migration and rollback behavior for persisted-data changes;
- deterministic fixture and user-visible threshold effects for posture-engine changes.

Behavior and documentation change together. New dependencies must justify why platform APIs, the standard library, or existing dependencies are insufficient.

Contributions are submitted under the Apache License 2.0. No contributor license agreement is required initially.
