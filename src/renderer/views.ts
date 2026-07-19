import type { MinuteAggregate, StoredHistory } from '../preload/api-types';
import { settingsForPreset } from '../shared/posture/index.ts';
import {
  correctionText,
  deleteLabel,
  monitorLabel,
  positioningReady,
  type CameraGuidance,
  type Model,
  type MonitorStatus,
  type Screen,
} from './state.ts';

export type ViewState = {
  model: Model;
  cameraDevices: readonly { deviceId: string; label: string }[];
  selectedCameraId: string | null;
  storedHistory: StoredHistory;
  currentBucket: MinuteAggregate | null;
  storageWarning: string | null;
  trayAvailable: boolean;
  hasPreviewStream: boolean;
  diagnosticsPreview: string | null;
  calibrationCountdownSeconds: number;
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

const icon = (name: 'home' | 'history' | 'settings' | 'check' | 'shield' | 'camera' | 'bell' | 'pause' | 'info' | 'alert' | 'spark'): string => {
  const paths = {
    home: '<path d="M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z"/>',
    history: '<path d="M4 6v5h5M5.2 16.7A8 8 0 1 0 4 11"/><path d="M12 8v5l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    camera: '<path d="M14.5 6 13 4h-2L9.5 6H4a2 2 0 0 0-2 2v10h20V8a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3.5"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/>',
    spark: '<path d="m12 2 1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

const logo = (): string => `<svg class="brand-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
  <circle cx="24" cy="24" r="21" fill="#dcece4" stroke="#225f4a" stroke-width="2"/>
  <path d="M17 33c0-5 3-8 7-8s7 3 7 8M24 25V14m0 0-4 4m4-4 4 4" stroke="#225f4a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="11" r="2.5" fill="#225f4a"/>
</svg>`;

const setupScreens: Screen[] = ['welcome', 'camera', 'positioning', 'calibration', 'notifications', 'ready'];
const minutes = (value: number): string => value < 60 ? `${value}m` : `${Math.floor(value / 60)}h ${value % 60}m`;
const formatDate = (value: string): string => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function renderApp(view: ViewState): string {
  const {
    model,
    cameraDevices,
    selectedCameraId,
    storedHistory,
    currentBucket,
    storageWarning,
    trayAvailable,
    hasPreviewStream,
    diagnosticsPreview,
    calibrationCountdownSeconds,
  } = view;
  const isSetup = (screen: Screen): boolean => setupScreens.includes(screen) && !model.setupComplete;

  function setupProgress(): string {
    const steps = ['Privacy', 'Camera', 'Position', 'Calibrate', 'Notifications', 'Ready'];
    const active = Math.max(0, setupScreens.indexOf(model.screen));
    return `<p class="stepper-text">Step ${active + 1} of ${steps.length} · ${steps[active]}</p>
      <ol class="stepper" aria-label="Setup progress">${steps.map((step, index) => `<li class="${index < active ? 'done' : index === active ? 'current' : ''}"><span class="sr-only">${step}${index === active ? ', current step' : index < active ? ', complete' : ''}</span></li>`).join('')}</ol>`;
  }

  function nav(): string {
    const item = (screen: Screen, label: string, iconName: 'home' | 'history' | 'settings') => `<button type="button" data-action="go" data-screen="${screen}" ${model.screen === screen ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></button>`;
    return `<aside class="sidebar" aria-label="Application navigation">
      <nav class="nav">${item('dashboard', 'Monitor', 'home')}${item('history', 'History', 'history')}${item('settings', 'Settings', 'settings')}</nav>
      <div class="side-note"><strong>${icon('shield')} Local by design</strong>Camera frames stay in memory and are never recorded.</div>
    </aside>`;
  }

  function shell(content: string): string {
    const dashboard = model.screen === 'dashboard';
    const top = `<header class="topbar">
      <button type="button" class="brand button ghost" data-action="go" data-screen="${model.setupComplete ? 'dashboard' : 'welcome'}" aria-label="Open Posture home">${logo()}<span>Open Posture</span></button>
      <span class="local-chip">${icon('shield')} Runs locally · no recording</span>
    </header>`;
    const warning = storageWarning ? `<div class="storage-warning" role="status">${icon('alert')}<span>${escapeHtml(storageWarning)}</span></div>` : '';
    if (isSetup(model.screen)) return `<div class="shell">${top}<main id="main" class="main setup-main" tabindex="-1">${warning}${setupProgress()}${content}</main></div>`;
    return `<div class="shell${dashboard ? ' dashboard-shell' : ''}">${top}<div class="app-layout">${nav()}<main id="main" class="main${model.screen === 'settings' ? ' settings-main' : dashboard ? ' dashboard-main' : ''}" tabindex="-1">${warning}${content}</main></div></div>`;
  }

  function heading(eyebrow: string, title: string, lede: string): string {
    return `<p class="eyebrow">${eyebrow}</p><h1 tabindex="-1">${title}</h1><p class="lede">${lede}</p>`;
  }

  function personArt(): string {
    return `<svg viewBox="0 0 180 180" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true">
      <circle cx="90" cy="42" r="17"/><path d="M90 59v48m-39-27c11-8 24-13 39-13s28 5 39 13M62 91l-9 48m65-48 9 48M90 107l-23 36m23-36 23 36"/>
      <path d="M42 146h96" stroke-dasharray="3 7"/>
    </svg>`;
  }

  function welcome(): string {
    return `<div class="hero-grid"><section>${heading('Private posture awareness', 'A gentle cue, based on your reference.', 'Open Posture compares your current position with a comfortable position you choose. It is a wellness awareness tool—not medical advice.')}
      <ul class="fact-list">
        <li>${icon('camera')}<span><strong>Processed on this computer.</strong><br><span class="fine">Camera frames are used in memory and are never recorded or stored.</span></span></li>
        <li>${icon('shield')}<span><strong>No runtime connection.</strong><br><span class="fine">There are no accounts, analytics, uploads, or cloud services.</span></span></li>
        <li>${icon('history')}<span><strong>Small, local summaries.</strong><br><span class="fine">Only your settings, calibration measurements, and aggregate history are stored. You can delete them at any time.</span></span></li>
      </ul>
      <div class="actions"><button class="button" type="button" data-action="go" data-screen="camera">Continue</button><button class="button secondary" type="button" data-action="go" data-screen="settings">Review privacy details</button></div>
    </section><div class="promise-art">${personArt()}</div></div>`;
  }

  function cameraPermission(): string {
    return `<div class="split"><section>${heading('Camera', 'Allow camera access when you’re ready.', 'Video is needed to compare your position with your calibration. Audio is never requested.')}
      <div class="card soft"><h2>Before the system prompt</h2><p>The app will ask only for this computer’s camera. Choosing “Not now” keeps the camera off and lets you review Settings, Privacy, and About.</p></div>
      ${!model.cameraAllowed && model.announcement === 'Camera access is off.' ? `<div class="card warning" role="status"><h2>Camera access is off</h2><p>Monitoring cannot start yet. You can check the operating system’s camera privacy settings, then choose Check again.</p></div>` : ''}
      <div class="actions"><button class="button" type="button" data-action="allow-camera" ${model.busy ? 'disabled' : ''}>${model.busy ? 'Checking…' : 'Allow camera'}</button><button class="button secondary" type="button" data-action="camera-not-now">Not now</button></div>
    </section><div class="promise-art">${icon('camera')}</div></div>`;
  }

  function postureDashboard(): string {
    const unavailable = ['ready', 'finding', 'cannot-assess', 'paused', 'snoozed', 'error'].includes(model.monitorStatus) || model.score === null;
    const changed = !unavailable && model.score! < settingsForPreset(model.settings.sensitivity).alertBelow;
    const cueRegion = model.correction?.startsWith('head-') ? 'Head'
      : model.correction === 'shoulder-tilt' ? 'Shoulders'
        : model.correction?.startsWith('torso-') ? 'Torso'
          : null;
    const tone = (region: string): 'good' | 'warning' | 'neutral' => unavailable ? 'neutral' : changed ? (region === cueRegion ? 'warning' : 'neutral') : 'good';
    const metrics = [
      ['Head', tone('Head')],
      ['Shoulders', tone('Shoulders')],
      ['Torso', tone('Torso')],
      ['Framing', Object.values(model.cameraQuality).every(Boolean) && !['ready', 'paused', 'snoozed', 'error'].includes(model.monitorStatus) ? 'good' : 'neutral'],
    ] as const;
    return `<div class="posture-mini-dashboard" aria-hidden="true"><strong>Live posture</strong><div class="posture-mini-grid">${metrics.map(([label, metricTone]) => `<span class="posture-mini-metric ${metricTone}"><b>${label}</b><i>${metricTone === 'good' ? '✓' : metricTone === 'warning' ? '!' : '–'}</i></span>`).join('')}</div><span class="posture-mini-score"><b>Similarity</b><strong>${model.score ?? '—'}</strong></span></div>`;
  }

  function preview(showGuide = true, hudLabel = '', hudProgress = 0, hudTone: 'good' | 'warning' | 'paused' | 'neutral' = 'neutral', showPostureDashboard = false): string {
    if (!model.settings.preview) return `<div class="preview preview-off"><div><p><strong>Preview hidden</strong></p><p class="fine">Monitoring can continue. Hiding preview does not turn off the camera.</p></div></div>`;
    const progress = Math.max(0, Math.min(100, hudProgress));
    const hud = hudLabel ? `<div class="camera-hud ${hudTone}" aria-hidden="true"><strong>${escapeHtml(hudLabel)}</strong><span><i style="--hud-progress:${progress}%"></i></span></div>` : '';
    return `<div class="preview${showPostureDashboard ? ' has-posture-dashboard' : ''}" aria-label="Local camera preview area"><video id="camera-preview" autoplay muted playsinline aria-label="Mirrored local camera preview"></video>${hasPreviewStream ? '' : personArt()}<span class="preview-grid" aria-hidden="true"></span><span class="preview-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${hud}${showPostureDashboard ? postureDashboard() : ''}${showGuide ? '<span class="preview-label"><span class="dot"></span>Camera on · local preview</span>' : ''}</div>`;
  }

  function positioning(): string {
    const checks: [keyof Model['cameraQuality'], string][] = [
      ['onePerson', 'One person in frame'], ['landmarksVisible', 'Head and both shoulders visible'], ['scale', 'Comfortable distance'], ['light', 'Enough light and contrast'], ['stable', 'Ready to hold still'],
    ];
    const framingScore = Math.round(Object.values(model.cameraQuality).filter(Boolean).length / Object.keys(model.cameraQuality).length * 100);
    return `${heading('Position', 'Set a clear, comfortable view.', 'Sit naturally in a front or three-quarter view. You do not need to show your full body.')}
      <div class="split"><section>${preview(true, framingGuidance(model.cameraGuidance), framingScore, positioningReady(model) ? 'good' : 'neutral')}<div class="form-row"><label for="camera-device">Camera</label><select class="select" id="camera-device" data-camera-device>${cameraOptions()}</select></div></section>
      <aside class="card"><h2>Framing check</h2><p class="framing-guidance" role="status">${escapeHtml(framingGuidance(model.cameraGuidance))}</p><div class="quality-list">${checks.map(([key, label]) => `<div class="quality-row ${model.cameraQuality[key] ? 'pass' : ''}">${model.cameraQuality[key] ? icon('check') : icon('info')}<span>${label}</span></div>`).join('')}</div>
      <p class="fine">Only one person should be in frame. The app never identifies anyone.</p></aside></div>
      <div class="actions between"><button class="button ghost" type="button" data-action="go" data-screen="camera">Back</button><button class="button" type="button" data-action="go" data-screen="calibration" ${positioningReady(model) ? '' : 'disabled'}>Continue</button></div>`;
  }

  function cameraOptions(): string {
    if (cameraDevices.length === 0) return `<option value="">${escapeHtml(model.cameraName)}</option>`;
    return cameraDevices.map((device, index) => {
      const label = device.label || `Camera ${index + 1}`;
      return `<option value="${escapeHtml(device.deviceId)}" ${device.deviceId === selectedCameraId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  }

  function framingGuidance(guidance: CameraGuidance): string {
    return {
      ready: 'Framing is ready. Hold this comfortable view to continue.',
      'move-closer': 'Move a little closer so your head and shoulders are large enough to assess.',
      'move-farther': 'Move a little farther from the camera so your head and shoulders fit comfortably.',
      'move-center': 'Move toward the center of the preview.',
      'one-person': 'Keep only one person in the camera view.',
      'show-head-shoulders': 'Keep your head and both shoulders visible.',
      'face-camera': 'Turn toward a front or three-quarter view.',
      'improve-light': 'Add gentle front lighting or improve contrast.',
      'hold-still': 'Hold still briefly so the view can be checked.',
      'move-into-view': 'Move into view with your head and both shoulders visible.',
    }[guidance];
  }

  function calibration(): string {
    const saved = model.calibrationReady && !model.calibrationReplacing && !model.calibrationCandidateReady;
    const active = calibrationCountdownSeconds > 0 || (model.calibrationProgress > 0 && model.calibrationProgress < 100);
    const hudLabel = model.calibrationCandidateReady || saved ? 'Reference ready' : calibrationCountdownSeconds > 0 ? `Starting in ${calibrationCountdownSeconds}…` : active ? 'Hold comfortably' : 'Ready to calibrate';
    return `${heading('Calibrate', model.calibrationCandidateReady ? 'A replacement is ready.' : saved ? 'Calibration ready' : 'Set your comfortable reference.', model.calibrationCandidateReady ? 'Review the validated result before replacing your saved reference.' : saved ? 'Your validated reference is stored as derived measurements only.' : 'Sit in a comfortable posture you want to use as your reference. This is a personal comparison, not a medical standard.')}
      <div class="split"><section>${preview(false, hudLabel, model.calibrationProgress, saved || model.calibrationCandidateReady ? 'good' : 'neutral')}</section><aside class="card ${saved || model.calibrationCandidateReady ? 'soft' : ''}">
        <h2>${model.calibrationCandidateReady ? `${icon('check')} Keep or replace` : saved ? `${icon('check')} Reference saved` : calibrationCountdownSeconds > 0 ? `Starting in ${calibrationCountdownSeconds}…` : active ? 'Hold comfortably…' : 'About 10 seconds'}</h2>
        <p>${model.calibrationCandidateReady ? 'Your previous reference is still active. Replace it only if this new comfortable position is the one you want.' : saved ? `Saved for ${escapeHtml(model.cameraName)}. You can recalibrate whenever your desk or camera changes.` : 'A cancelable three-second countdown comes first. The app then waits for a stable, clear view and discards partial attempts.'}</p>
        <div class="progress" role="progressbar" aria-label="Calibration progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${model.calibrationProgress}"><span style="--progress:${model.calibrationProgress}%"></span></div>
        <p class="fine">${model.calibrationProgress}% complete · no image is saved</p>
        <div class="actions">${model.calibrationCandidateReady ? '<button class="button" type="button" data-action="confirm-calibration">Replace saved reference</button><button class="button secondary" type="button" data-action="keep-calibration">Keep existing</button>' : saved ? '<button class="button" type="button" data-action="go" data-screen="notifications">Continue</button><button class="button secondary" type="button" data-action="restart-calibration">Recalibrate</button>' : active ? '<button class="button secondary" type="button" data-action="cancel-calibration" data-focus="calibration-control">Cancel</button>' : '<button class="button" type="button" data-action="start-calibration" data-focus="calibration-control">Start calibration</button>'}</div>
      </aside></div>`;
  }

  function notifications(): string {
    const unavailable = model.notificationCapability === 'unavailable';
    return `<div class="split"><section>${heading('Notifications', 'Choose how you’ll notice a posture check.', 'A desktop alert and system sound appear at the top-right even when the main window is hidden. Native notifications are also attempted when available.')}
      ${unavailable ? `<div class="card warning"><h2>Native notifications are unavailable</h2><p>The top-right desktop alert and tray status will still work.</p></div>` : `<div class="card soft"><h2>Posture check</h2><p>Send a test. The top-right desktop alert will always appear; operating-system notification delivery remains best effort.</p></div>`}
      <div class="actions"><button class="button" type="button" data-action="test-notification">Send test</button><button class="button secondary" type="button" data-action="finish-setup">${unavailable ? 'Continue with desktop alerts' : 'Continue'}</button><button class="button ghost" type="button" data-action="finish-setup">Skip</button></div>
    </section><div class="promise-art">${icon('bell')}</div></div>`;
  }

  function ready(): string {
    const preset = settingsForPreset(model.settings.sensitivity);
    const sensitivity = model.settings.sensitivity[0].toUpperCase() + model.settings.sensitivity.slice(1);
    return `${heading('Ready', 'Your private posture check is ready.', 'Review your setup, then start when you want the camera to turn on.')}
      <div class="settings-grid"><div class="card soft"><h2>${icon('camera')} ${escapeHtml(model.cameraName)}</h2><p>Camera remains off until you choose Start monitoring.</p></div>
      <div class="card"><h2>${icon('check')} Personal reference</h2><p>${model.calibratedAt ? `Calibrated ${formatDate(model.calibratedAt)}.` : 'Calibration is required before monitoring.'}</p></div>
      <div class="card"><h2>${sensitivity} sensitivity</h2><p>Alerts after similarity stays below ${preset.alertBelow} for ${preset.dwellMs / 1_000} assessed seconds, with a ${preset.cooldownMs / 60_000}-minute cooldown.</p></div>
      <div class="card"><h2>${icon('bell')} Desktop alerts</h2><p>${model.notificationCapability === 'available' ? 'The top-right alert plays one system sound; native notification delivery is best effort.' : model.notificationCapability === 'unavailable' ? 'Native notifications are unavailable. Top-right alerts and their system sound remain active.' : 'Top-right alerts and their system sound are active; native notification capability has not been tested.'}</p></div>
      <div class="card"><h2>${icon('shield')} Local and offline</h2><p>No recording, account, analytics, upload, or runtime network connection.</p></div></div>
      <div class="notice">${icon('info')}<span>${trayAvailable ? 'Minimizing or closing hides the window while active monitoring continues from the menu-bar icon. Pause, Snooze, or Quit stops the camera as described.' : 'A system tray is unavailable here, so closing the window quits Open Posture and releases the camera.'}</span></div>
      <div class="actions"><button class="button" type="button" data-action="start-monitoring" ${model.calibrationReady ? '' : 'disabled'}>Start monitoring</button><button class="button secondary" type="button" data-action="go" data-screen="settings">Review settings</button></div>`;
  }

  function statusTone(status: MonitorStatus): '' | 'warning' | 'paused' | 'neutral' {
    if (status === 'changing' || status === 'alert') return 'warning';
    if (status === 'paused' || status === 'snoozed') return 'paused';
    if (status === 'finding' || status === 'cannot-assess' || status === 'cooldown') return 'neutral';
    return '';
  }

  function monitorHelp(status: MonitorStatus): string {
    return {
      ready: 'The camera is off. Start when you are ready.',
      finding: 'Move into a comfortable front or three-quarter camera view.',
      good: 'Your current position is close to the comfortable reference you calibrated.',
      changing: 'The comparison is changing. A brief movement will not trigger an alert.',
      alert: 'A sustained change was detected relative to your calibration.',
      'cannot-assess': 'We cannot compare right now. This is neutral and does not lower your history.',
      cooldown: `Monitoring continues. Another alert is eligible in about ${model.cooldownMinutes} minutes.`,
      paused: 'The camera and posture processing are off.',
      snoozed: `The camera is off. Monitoring is snoozed for ${model.snoozeMinutes} minutes.`,
      error: 'Monitoring stopped safely. Follow the recovery step below.',
    }[status];
  }

  function dashboard(): string {
    const active = !['ready', 'paused', 'snoozed', 'error'].includes(model.monitorStatus);
    const score = model.score === null ? '—' : String(model.score);
    return `${heading('Monitor', monitorLabel(model.monitorStatus), monitorHelp(model.monitorStatus))}
      <p class="camera-state">${active ? '<span class="dot"></span> Camera and local pose processing are on' : `${icon('pause')} Camera and pose processing are off`}</p>
      <div class="dashboard-grid"><section>
        <div class="status-panel ${model.settings.largeStatus ? 'large-status' : ''}"><div class="status-orb ${statusTone(model.monitorStatus)}"><span class="status-score">${score}</span><span class="sr-only">${model.score === null ? 'No similarity score' : `Similarity score ${model.score} out of 100`}</span></div><h2>${monitorLabel(model.monitorStatus)}</h2><p class="fine">Similarity is relative to your calibration—not a health score.</p></div>
        <div class="actions"><button class="button" type="button" data-action="${active ? 'pause-monitoring' : 'resume-monitoring'}">${active ? `${icon('pause')} Pause` : 'Resume monitoring'}</button><button class="button secondary" type="button" data-action="snooze-menu">Snooze</button><button class="button ghost" type="button" data-action="recalibrate">Recalibrate</button></div>
        <div class="button-row" id="snooze-options" hidden aria-label="Snooze duration">${[5,15,30,60].map(minutes => `<button type="button" class="button secondary small" data-action="snooze" data-minutes="${minutes}">${minutes} min</button>`).join('')}</div>
      </section><aside>
        ${preview(false, monitorLabel(model.monitorStatus), model.score ?? 0, statusTone(model.monitorStatus) || 'good', true)}
        <div class="card"><h2>Today</h2><div class="metric-grid"><div class="metric"><span>Monitored</span><strong>${minutes(model.history.monitoredMinutes)}</strong></div><div class="metric"><span>Assessed</span><strong>${minutes(model.history.assessedMinutes)}</strong></div><div class="metric"><span>Average similarity</span><strong>${model.history.averageSimilarity ?? '—'}</strong></div><div class="metric"><span>Notified episodes</span><strong>${model.history.notifiedEpisodes}</strong></div></div><div class="actions"><button class="button ghost small" type="button" data-action="go" data-screen="history">View history</button></div></div>
      </aside></div>`;
  }

  function correction(): string {
    const recovered = model.resetDetected;
    const liveScore = model.score === null ? 'Assessing…' : `${model.score} similarity`;
    return `${heading('Posture check', recovered ? 'Reset detected' : 'Let’s reset', recovered ? 'You’re back near your personal reference.' : 'Return to the comfortable position you calibrated.')}
      <div class="split"><section>${preview(false, recovered ? 'Reset detected' : 'Ease toward your reference', recovered ? 100 : model.recoveryProgress, recovered ? 'good' : 'warning', true)}</section><aside class="card ${recovered ? 'soft' : 'warning'}"><h2>${recovered ? `${icon('check')} Back near your reference` : 'A gentle suggestion'}</h2><p>${recovered ? 'Monitoring continues using the same calibration.' : correctionText(model.correction)}</p>${recovered ? '' : `<div class="recovery-state" role="status"><strong>${liveScore}</strong><span>Reset progress: ${model.recoveryProgress}%</span><div class="progress" role="progressbar" aria-label="Reset detection progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${model.recoveryProgress}"><span style="--progress:${model.recoveryProgress}%"></span></div><p class="fine">Reset is detected after similarity stays at 75 or higher for 3 assessed seconds.</p></div>`}<p class="fine">Stop if uncomfortable and seek qualified professional advice for pain or health concerns.</p>
      <div class="actions"><button class="button" type="button" data-action="adjusted">I’ve adjusted</button><button class="button secondary" type="button" data-action="snooze" data-minutes="15">Snooze 15 min</button><button class="button secondary" type="button" data-action="pause-monitoring">Pause monitoring</button><button class="button ghost" type="button" data-action="recalibrate">Recalibrate</button><button class="button ghost" type="button" data-action="go" data-screen="dashboard">Back to dashboard</button></div></aside></div>`;
  }

  function history(): string {
    const empty = !recentHistoryBuckets().some((bucket) => bucket.scoreSampleCount > 0);
    return `${heading('History', 'Today, at a glance.', 'History is stored locally as minute-level summaries. Time we could not assess is excluded.')}
      ${storedHistory.retentionDays === 0 ? `<div class="card soft"><h2>History is off</h2><p>Monitoring can still run, but no minute summaries are created. Turn history on in Settings if you want local aggregates.</p><button class="button secondary" type="button" data-action="go" data-screen="settings">Open history settings</button></div>` : empty ? `<div class="card soft"><h2>No assessed history yet</h2><p>Start monitoring to create local aggregate summaries. No video or frame-level pose history is stored.</p><button class="button" type="button" data-action="go" data-screen="dashboard">Go to monitor</button></div>` : `<div class="metric-grid"><div class="metric"><span>Monitored</span><strong>${minutes(model.history.monitoredMinutes)}</strong></div><div class="metric"><span>Confidently assessed</span><strong>${minutes(model.history.assessedMinutes)}</strong></div><div class="metric"><span>Average similarity</span><strong>${model.history.averageSimilarity ?? '—'}</strong></div><div class="metric"><span>Notified episodes</span><strong>${model.history.notifiedEpisodes}</strong></div></div>
        <div class="card"><h2>Assessed similarity by recent minute</h2><div class="timeline" role="img" aria-label="Local aggregate similarity timeline">${historyBars()}</div><p class="fine">Striped blocks mean Cannot assess and are not included in averages.</p>${historyTable()}</div>`}
      <div class="notice">${icon('info')}<span>A score of 100 means closest to your saved calibration. It does not mean healthiest, perfect, or medically correct.</span></div>`;
  }

  function recentHistoryBuckets(): MinuteAggregate[] {
    const buckets = currentBucket
      ? [...storedHistory.buckets.filter((bucket) => bucket.bucketStartUtc !== currentBucket?.bucketStartUtc), currentBucket]
      : storedHistory.buckets;
    return buckets.slice(-12);
  }

  function historyBars(): string {
    return recentHistoryBuckets().map((bucket) => {
      const assessed = bucket.scoreSampleCount > 0;
      const value = assessed ? Math.round(bucket.scoreSum / bucket.scoreSampleCount) : 0;
      const title = assessed ? `${value} similarity` : 'Cannot assess';
      return `<span class="bar ${assessed ? '' : 'missing'}" style="--height:${assessed ? Math.max(4, value) : 18}%" title="${title}" aria-hidden="true"></span>`;
    }).join('');
  }

  function historyTable(): string {
    const rows = recentHistoryBuckets().map((bucket) => {
      const assessed = bucket.scoreSampleCount > 0;
      const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(bucket.bucketStartUtc));
      return `<tr><th scope="row">${escapeHtml(time)}</th><td>${assessed ? `${Math.round(bucket.scoreSum / bucket.scoreSampleCount)} similarity` : 'Cannot assess'}</td><td>${Math.round(bucket.validSeconds)} assessed seconds</td></tr>`;
    }).join('');
    return `<details class="history-details"><summary>Minute-by-minute text</summary><table><caption>Recent local minute summaries</caption><thead><tr><th scope="col">Minute</th><th scope="col">Result</th><th scope="col">Coverage</th></tr></thead><tbody>${rows}</tbody></table></details>`;
  }

  function settings(): string {
    return `${heading('Settings', 'Settings', 'Everything stays on this computer. Camera changes pause monitoring first.')}
      <div class="settings-grid">
        <section class="card"><h2>Monitoring</h2><div class="form-row"><label for="sensitivity">Sensitivity</label><select id="sensitivity" class="select" data-setting="sensitivity"><option value="gentle" ${model.settings.sensitivity === 'gentle' ? 'selected' : ''}>Gentle · below 55 for 30 sec · 15 min cooldown</option><option value="balanced" ${model.settings.sensitivity === 'balanced' ? 'selected' : ''}>Balanced · below 65 for 15 sec · 10 min cooldown</option><option value="strict" ${model.settings.sensitivity === 'strict' ? 'selected' : ''}>Strict · below 75 for 8 sec · 5 min cooldown</option></select><p class="fine">These are transparent wellness defaults, not medical thresholds.</p></div>
        <div class="switch-row"><span><strong>Show preview</strong><br><span class="fine">Hiding it does not turn off an active camera.</span></span><input type="checkbox" aria-label="Show camera preview" data-setting="preview" ${model.settings.preview ? 'checked' : ''}></div><div class="actions"><button class="button ghost small" type="button" data-action="restore-monitoring-defaults">Restore defaults</button></div></section>
        <section class="card"><h2>Alerts & display</h2><p class="fine">Top-right alert + system sound: <strong>active</strong> · Native notification: <strong>${model.notificationCapability === 'available' ? 'supported · best effort' : model.notificationCapability === 'unavailable' ? 'unavailable' : 'not tested'}</strong></p><div class="switch-row"><span><strong>Reduce motion</strong><br><span class="fine">Turns off decorative movement.</span></span><input type="checkbox" aria-label="Reduce motion" data-setting="reducedMotion" ${model.settings.reducedMotion ? 'checked' : ''}></div><div class="switch-row"><span><strong>Larger status score</strong><br><span class="fine">Increases the dashboard score.</span></span><input type="checkbox" aria-label="Use larger status score" data-setting="largeStatus" ${model.settings.largeStatus ? 'checked' : ''}></div><div class="actions"><button class="button secondary small" type="button" data-action="test-notification">Test notification</button><button class="button ghost small" type="button" data-action="restore-accessibility-defaults">Restore defaults</button></div></section>
        <section class="card"><h2>Camera & calibration</h2><p><strong>${escapeHtml(model.cameraName)}</strong><br><span class="fine">${model.calibrationReady && model.calibratedAt ? `Calibrated ${formatDate(model.calibratedAt)}` : 'No valid calibration'}</span></p><div class="actions"><button class="button secondary small" type="button" data-action="go" data-screen="positioning">Check framing</button><button class="button ghost small" type="button" data-action="recalibrate">Recalibrate</button></div><p class="fine settings-note">${trayAvailable ? 'Minimizing or closing keeps active monitoring in the menu bar.' : 'Closing quits because a system tray is unavailable.'} Camera never starts automatically. Open Posture does not diagnose, treat, prevent, or cure any condition.</p></section>
        <section class="card"><h2>Privacy & local data</h2><div class="form-row"><label for="history-days">History retention</label><select id="history-days" class="select" data-setting="historyDays"><option value="0" ${model.settings.historyDays === 0 ? 'selected' : ''}>Off</option><option value="7" ${model.settings.historyDays === 7 ? 'selected' : ''}>7 days</option><option value="30" ${model.settings.historyDays === 30 ? 'selected' : ''}>30 days</option><option value="90" ${model.settings.historyDays === 90 ? 'selected' : ''}>90 days</option></select></div><div class="actions"><button class="button ghost small" type="button" data-action="restore-history-defaults">Restore 30 days</button><button class="button ghost small" type="button" data-action="reveal-data-folder">Reveal data</button><button class="button ghost small" type="button" data-action="open-source">License & source</button></div><div class="actions"><button class="button secondary small" type="button" data-action="confirm-delete" data-scope="history">Delete history</button><button class="button secondary small" type="button" data-action="confirm-delete" data-scope="calibration">Delete calibration</button><button class="button danger small" type="button" data-action="confirm-delete" data-scope="all">Reset all</button></div></section>
      </div>`;
  }

  function errorScreen(): string {
    const error = model.error ?? { title: 'Monitoring needs attention', message: 'The current operation could not continue safely.', action: 'Return to ready' };
    return `<div class="split"><section>${heading('Recoverable error', error.title, error.message)}${error.code ? `<span class="error-code">${error.code}</span>` : ''}<div class="actions"><button class="button" type="button" data-action="retry-error">${error.action}</button><button class="button secondary" type="button" data-action="clear-error">Stop session safely</button><button class="button ghost" type="button" data-action="copy-diagnostics">Copy sanitized diagnostics</button></div><p class="fine">Diagnostics contain lifecycle states and error codes only—never frames, landmarks, camera names, usernames, or home paths.</p></section><div class="promise-art">${icon('alert')}</div></div>`;
  }

  function deleteDialog(): string {
    if (!model.deleteScope) return '';
    const scope = model.deleteScope;
    const consequence = scope === 'history' ? 'Your settings and calibration will remain.' : scope === 'calibration' ? 'Monitoring will stop and setup will be required again. History and settings will remain.' : 'Settings, calibration, history, and local diagnostics will be removed. The app will return to first-run setup.';
    return `<dialog id="delete-dialog" aria-labelledby="delete-title"><div class="dialog-body"><p class="eyebrow">Local data</p><h2 id="delete-title">Delete ${deleteLabel(scope).toLowerCase()}?</h2><p>${consequence}</p><p>This action happens only on this computer and cannot be undone.</p><div class="actions"><button class="button danger" type="button" data-action="delete-now" data-scope="${scope}">Delete</button><button class="button secondary" type="button" data-action="cancel-delete">Cancel</button></div></div></dialog>`;
  }

  function diagnosticsDialog(): string {
    if (diagnosticsPreview === null) return '';
    return `<dialog id="diagnostics-dialog" aria-labelledby="diagnostics-title"><div class="dialog-body"><p class="eyebrow">Sanitized diagnostics</p><h2 id="diagnostics-title">Review before copying</h2><p>Only the exact text below will be copied. It should contain fixed lifecycle/error codes and aggregate timings—never camera content, landmarks, names, or paths.</p><pre class="diagnostics-preview">${escapeHtml(diagnosticsPreview)}</pre><div class="actions"><button class="button" type="button" data-action="copy-diagnostics-now">Copy this text</button><button class="button secondary" type="button" data-action="cancel-diagnostics">Cancel</button></div></div></dialog>`;
  }

  function screen(): string {
    switch (model.screen) {
      case 'welcome': return welcome();
      case 'camera': return cameraPermission();
      case 'positioning': return positioning();
      case 'calibration': return calibration();
      case 'notifications': return notifications();
      case 'ready': return ready();
      case 'dashboard': return dashboard();
      case 'correction': return correction();
      case 'history': return history();
      case 'settings': return settings();
      case 'error': return errorScreen();
    }
  }


  return `${shell(screen())}${deleteDialog()}${diagnosticsDialog()}`;
}
