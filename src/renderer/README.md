# Renderer

Plain HTML, CSS, and TypeScript implement the complete P0 desktop surface. There are no renderer dependencies, remote assets, Node APIs, or network calls.

## Entry points

- `index.html` — accessible document shell and live region
- `index.ts` — rendering, events, and the single preload adapter
- `state.ts` — explicit, pure renderer state and reducer
- `styles.css` — responsive original visual system, dark mode, zoom, and reduced motion
- `global.d.ts` — typed `window.openPosture` declaration
- `state.test.ts` — browser-independent state invariants

Run the focused state check with:

```bash
node --test --experimental-strip-types src/renderer/state.test.ts
```

## State and action coverage

| P0 surface/state | Entry/action | Recovery or exit |
|---|---|---|
| Privacy welcome | First run | Continue or review privacy |
| Camera permission | Continue | Not now; OS-settings explanation |
| Positioning | Permission granted | Camera choice, Back, safe Exit path |
| Calibration | Position checks pass | Cancel, retry, preserve prior reference |
| Notification test | Calibration complete | Skip; in-app fallback |
| Ready | Setup summary | Start or review settings |
| Dashboard | Start/resume | Pause, snooze, recalibrate |
| Finding/Good/Changing/Cannot assess/Cooldown/Paused/Snoozed/Error | Desktop state updates | State-specific, neutral guidance |
| Passive alert | Sustained episode | Open reset or dismiss; no focus theft |
| Corrective screen | Alert click | Adjusted, snooze, pause, recalibrate, dashboard |
| History | Navigation | Empty state and accessible textual summary |
| Settings/privacy | Navigation | Monitoring, alerts, camera, a11y, retention |
| Delete confirmations | Privacy controls | Exact consequence, Cancel or Delete |
| Recoverable error | Desktop failure | Retry, stop safely, copy sanitized diagnostics |

## Desktop integration contract

The renderer imports `DesktopApi` only as a type and accesses it through `window.openPosture`. `dispatchToDesktop` is the sole IPC-facing adapter. It uses only the narrow methods exposed by `src/preload/api-types.ts`:

- runtime/capability reads;
- validated monitoring-state updates;
- fixed test-notification request;
- allowlisted external links;
- typed desktop-command subscription.

Camera frames, landmarks, feature vectors, device labels, filesystem paths, and arbitrary notification text must never cross this bridge. Camera/MediaPipe integration may attach to the existing `.preview` surface inside the renderer process, but it must preserve the preview-off versus camera-off distinction.

When the bridge is absent, the renderer remains navigable as a browser-style product preview. No fallback accesses Node, the filesystem, camera, or network.

## Accessibility contract

- A single `main` heading receives focus only after screen changes.
- Dynamic lifecycle changes use one polite, atomic live region; scores are not announced continuously.
- Native buttons, selects, checkboxes, and dialog semantics are used.
- Every essential action is keyboard operable; Escape cancels destructive confirmation.
- State always combines text and shape/icon, never color alone.
- Preview, chart, and progress visuals include text or accessible equivalents.
- Layout remains one-dimensional at narrow widths and 200% zoom.
- OS reduced motion and the local override disable decorative animation.
- Copy is always relative to personal calibration, non-shaming, and non-medical.
