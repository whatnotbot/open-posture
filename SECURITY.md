# Security policy

## Supported versions

Until 1.0, only the latest source release and current `main` are supported. This project publishes source code only; it does not publish installers or application binaries.

## Report privately

Use GitHub private vulnerability reporting for vulnerabilities and privacy regressions. Do not open a public issue for:

- unexpected network traffic;
- stored or transmitted camera frames or raw landmarks;
- microphone or over-broad permission access;
- camera use after Pause, Snooze, lock, reset, or Quit;
- preload/IPC, filesystem, navigation, dependency, or workflow vulnerabilities;
- destructive migration or deletion failures.

Include the affected commit/version, OS, reproduction steps, impact, and the smallest safe diagnostic evidence. Never attach personal camera recordings, raw landmarks, usernames, home paths, secrets, or unreviewed logs.

We aim to acknowledge a credible report within seven days and provide initial triage within fourteen days, usually faster for critical issues. These are best-effort open-source targets, not contractual SLAs or a bug-bounty promise. Disclosure is coordinated with the reporter; credit is opt-in.

## Security invariants

Runtime is offline, renderer processes are sandboxed and context-isolated, permissions fail closed, frames remain in renderer/worker memory, persisted data is minimized, and all sensitive changes require independent review. A regression in these invariants blocks release.
