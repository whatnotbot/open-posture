# Contributing

Thanks for helping build a private, explainable posture-awareness tool.

## Before starting

1. Read the quick start in `README.md`.
2. Check existing issues and the relevant architecture, privacy, or testing guide.
3. Open a focused issue before material algorithm, privacy, architecture, dependency, schema, or governance changes.
4. Never submit personal camera footage, raw landmarks, unsafe diagnostics, generated application binaries, secrets, or copied third-party material.

## Local workflow

```bash
npm ci --ignore-scripts
npm run model:verify
npm start
npm run check
```

Node 24.11.0 or newer within the 24.x line and npm 11 are required; the repository pins Node 24.14.0 and npm 11.18.0 as the verified toolchain. Source-only setup skips dependency install scripts; run a full `npm ci` before testing macOS packaging so the two reviewed, version-pinned native DMG helpers can build. Initial dependency installation uses the network; normal application runtime does not.

## Pull requests

Keep one problem per PR. Explain:

- user-visible behavior before and after;
- test commands, results, and platforms exercised;
- UI/accessibility impact and screenshots when relevant;
- privacy, security, data, dependency, license, and documentation impact;
- migration and rollback behavior when persisted data changes.

Behavior and documentation change together. New dependencies must justify why platform APIs, the standard library, or existing dependencies are insufficient.

Contributions are submitted under the Apache License 2.0. No contributor license agreement is required initially.
