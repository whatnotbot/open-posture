import './styles.css';
import type {
  ConfigInput,
  DesktopEvent,
  DesktopPlatform,
  LifecycleLogEntry,
  MinuteAggregate,
  MonitoringState,
  StoredHistory,
} from '../preload/api-types';
import {
  settingsForPreset,
  type CalibrationProfile,
  type CueKey,
  type SensitivityName,
} from '../shared/posture/index.ts';
import {
  LocalCameraPoseController,
  type CameraErrorCode,
  type CameraPipelineEvent,
  type PoseAnalysisEvent,
} from './camera/index.ts';
import {
  correctionText,
  deleteLabel,
  initialModel,
  monitorLabel,
  positioningReady,
  reduce,
  screenTitle,
  type Action,
  type CameraGuidance,
  type DeleteScope,
  type Model,
  type MonitorStatus,
  type Screen,
} from './state';
import {
  HistoryWriteCoordinator,
  isActiveAlertEpisode,
  monitoringUpdateDecision,
  recoveryPercent,
  requestAlertAndShowFallback,
  resolveCurrentCalibrationBinding,
  shouldCancelCalibrationOnNavigation,
} from './history-write-coordinator';
import { attachCameraPreview } from './camera-preview';

const app = document.querySelector<HTMLDivElement>('#app')!;
const announcer = document.querySelector<HTMLDivElement>('#announcer')!;
if (!app || !announcer) throw new Error('Renderer root is missing');

let model: Model = reduce(initialModel, { type: 'bridge', available: Boolean(window.openPosture) });
let previousRenderedScreen: Screen | null = null;
let previewStream: MediaStream | null = null;
let unsubscribeDesktop: (() => void) | null = null;
let unsubscribeCamera: (() => void) | null = null;
let cameraController: LocalCameraPoseController | null = null;
let calibrationProfile: CalibrationProfile | null = null;
let calibrationCandidate: CalibrationProfile | null = null;
let selectedCameraId: string | null = null;
let cameraDevices: readonly { deviceId: string; label: string }[] = [];
let snoozeTimer: number | undefined;
let snoozeTickTimer: number | undefined;
let historyFlushTimer: number | undefined;
const historyWrites = new HistoryWriteCoordinator();
let currentBucket: MinuteAggregate | null = null;
let storedHistory: StoredHistory = { schemaVersion: 1, retentionDays: 30, buckets: [] };
let lastAnalysisTimestampMs: number | undefined;
let lastAssessmentValid = false;
let lastMonitoringScore: number | undefined;
let alertCooldownUntilWallMs = 0;
let inferenceTimings: number[] = [];
let storageWarning: string | null = null;
let desktopPlatform: DesktopPlatform | null = null;
let appVersion = '0.1.0';
let buildCommit = 'uncommitted';
let packagedDistribution = false;
let trayAvailable = false;
let cameraConsentGiven = false;
let monitoringSessionActive = false;
let activeAlertEpisodeId: string | null = null;
let diagnosticsPreview: string | null = null;
let notificationTestResult: 'requested' | 'unavailable' | null = null;
let calibrationCountdownSeconds = 0;
let calibrationCountdownGeneration = 0;
let preparingToQuit = false;

const MODEL_IDENTITY = {
  id: 'mediapipe-pose-landmarker-lite',
  version: 'float16-lite-2026-07-18',
  sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
} as const;

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
const isSetup = (screen: Screen): boolean => setupScreens.includes(screen) && !model.setupComplete;

function dispatch(action: Action): void {
  model = reduce(model, action);
  render();
}

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
  return `<div class="preview${showPostureDashboard ? ' has-posture-dashboard' : ''}" aria-label="Local camera preview area"><video id="camera-preview" autoplay muted playsinline aria-label="Mirrored local camera preview"></video>${previewStream ? '' : personArt()}<span class="preview-grid" aria-hidden="true"></span><span class="preview-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${hud}${showPostureDashboard ? postureDashboard() : ''}${showGuide ? '<span class="preview-label"><span class="dot"></span>Camera on · local preview</span>' : ''}</div>`;
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
  return `<div class="split"><section>${heading('Notifications', 'Choose how you’ll notice a posture check.', 'Native notifications are best effort. A quiet in-app alert is always available and never steals keyboard focus.')}
    ${unavailable ? `<div class="card warning"><h2>Native notifications are unavailable</h2><p>The in-app alert and tray/window status will still work. Your operating system may suppress alerts while another app is full-screen.</p></div>` : `<div class="card soft"><h2>Posture check</h2><p>Native notification support is detected, but your operating system controls delivery. Send a test; an in-app confirmation will always appear.</p></div>`}
    <div class="actions"><button class="button" type="button" data-action="test-notification">Send test</button><button class="button secondary" type="button" data-action="finish-setup">${unavailable ? 'Continue with in-app alerts' : 'Continue'}</button><button class="button ghost" type="button" data-action="finish-setup">Skip</button></div>
  </section><div class="promise-art">${icon('bell')}</div></div>`;
}

function ready(): string {
  const preset = settingsForPreset(model.settings.sensitivity);
  const sensitivity = model.settings.sensitivity[0].toUpperCase() + model.settings.sensitivity.slice(1);
  return `${heading('Ready', 'Your private posture check is ready.', 'Review your setup, then start when you want the camera to turn on.')}
    <div class="settings-grid"><div class="card soft"><h2>${icon('camera')} ${escapeHtml(model.cameraName)}</h2><p>Camera remains off until you choose Start monitoring.</p></div>
    <div class="card"><h2>${icon('check')} Personal reference</h2><p>${model.calibratedAt ? `Calibrated ${formatDate(model.calibratedAt)}.` : 'Calibration is required before monitoring.'}</p></div>
    <div class="card"><h2>${sensitivity} sensitivity</h2><p>Alerts after similarity stays below ${preset.alertBelow} for ${preset.dwellMs / 1_000} assessed seconds, with a ${preset.cooldownMs / 60_000}-minute cooldown.</p></div>
    <div class="card"><h2>${icon('bell')} Alert fallback</h2><p>${model.notificationCapability === 'available' ? 'Native notification API supported; delivery is best effort. The in-app posture check is always available.' : model.notificationCapability === 'unavailable' ? 'Native notifications are unavailable. In-app posture checks remain active.' : 'Native notification capability has not been tested. In-app posture checks remain active.'}</p></div>
    <div class="card"><h2>${icon('shield')} Local and offline</h2><p>No recording, account, analytics, upload, or runtime network connection.</p></div></div>
    <div class="notice">${icon('info')}<span>${trayAvailable ? 'Closing the window hides it while active monitoring continues in the tray. Pause, Snooze, or Quit stops the camera as described.' : 'A system tray is unavailable here, so closing the window quits Open Posture and releases the camera.'}</span></div>
    <div class="actions"><button class="button" type="button" data-action="start-monitoring" ${model.calibrationReady ? '' : 'disabled'}>Start monitoring</button><button class="button secondary" type="button" data-action="go" data-screen="settings">Review settings</button></div>`;
}

function statusTone(status: MonitorStatus): '' | 'warning' | 'paused' | 'neutral' {
  if (status === 'changing' || status === 'alert') return 'warning';
  if (status === 'paused' || status === 'snoozed') return 'paused';
  if (status === 'finding' || status === 'cannot-assess' || status === 'cooldown') return 'neutral';
  return '';
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
      <section class="card"><h2>Alerts & display</h2><p class="fine">Notifications: <strong>${model.notificationCapability === 'available' ? 'supported · best effort' : model.notificationCapability === 'unavailable' ? 'unavailable · in-app fallback active' : 'not tested'}</strong></p><div class="switch-row"><span><strong>Reduce motion</strong><br><span class="fine">Turns off decorative movement.</span></span><input type="checkbox" aria-label="Reduce motion" data-setting="reducedMotion" ${model.settings.reducedMotion ? 'checked' : ''}></div><div class="switch-row"><span><strong>Larger status score</strong><br><span class="fine">Increases the dashboard score.</span></span><input type="checkbox" aria-label="Use larger status score" data-setting="largeStatus" ${model.settings.largeStatus ? 'checked' : ''}></div><div class="actions"><button class="button secondary small" type="button" data-action="test-notification">Test notification</button><button class="button ghost small" type="button" data-action="restore-accessibility-defaults">Restore defaults</button></div></section>
      <section class="card"><h2>Camera & calibration</h2><p><strong>${escapeHtml(model.cameraName)}</strong><br><span class="fine">${model.calibrationReady && model.calibratedAt ? `Calibrated ${formatDate(model.calibratedAt)}` : 'No valid calibration'}</span></p><div class="actions"><button class="button secondary small" type="button" data-action="go" data-screen="positioning">Check framing</button><button class="button ghost small" type="button" data-action="recalibrate">Recalibrate</button></div><p class="fine settings-note">${trayAvailable ? 'Closing keeps active monitoring in the tray.' : 'Closing quits because a system tray is unavailable.'} Camera never starts automatically. Open Posture does not diagnose, treat, prevent, or cure any condition.</p></section>
      <section class="card"><h2>Privacy & local data</h2><div class="form-row"><label for="history-days">History retention</label><select id="history-days" class="select" data-setting="historyDays"><option value="0" ${model.settings.historyDays === 0 ? 'selected' : ''}>Off</option><option value="7" ${model.settings.historyDays === 7 ? 'selected' : ''}>7 days</option><option value="30" ${model.settings.historyDays === 30 ? 'selected' : ''}>30 days</option><option value="90" ${model.settings.historyDays === 90 ? 'selected' : ''}>90 days</option></select></div><div class="actions"><button class="button ghost small" type="button" data-action="restore-history-defaults">Restore 30 days</button><button class="button ghost small" type="button" data-action="reveal-data-folder">Reveal data</button><button class="button ghost small" type="button" data-action="open-source">License & source</button></div><div class="actions"><button class="button secondary small" type="button" data-action="confirm-delete" data-scope="history">Delete history</button><button class="button secondary small" type="button" data-action="confirm-delete" data-scope="calibration">Delete calibration</button><button class="button danger small" type="button" data-action="confirm-delete" data-scope="all">Reset all</button></div></section>
    </div>`;
}

function errorScreen(): string {
  const error = model.error ?? { title: 'Monitoring needs attention', message: 'The current operation could not continue safely.', action: 'Return to ready' };
  return `<div class="split"><section>${heading('Recoverable error', error.title, error.message)}${error.code ? `<span class="error-code">${error.code}</span>` : ''}<div class="actions"><button class="button" type="button" data-action="retry-error">${error.action}</button><button class="button secondary" type="button" data-action="clear-error">Stop session safely</button><button class="button ghost" type="button" data-action="copy-diagnostics">Copy sanitized diagnostics</button></div><p class="fine">Diagnostics contain lifecycle states and error codes only—never frames, landmarks, camera names, usernames, or home paths.</p></section><div class="promise-art">${icon('alert')}</div></div>`;
}

function passiveAlert(): string {
  if (!model.alertVisible) return '';
  return `<aside class="alert-card" role="status" aria-label="Posture check"><header>${icon('bell')}<h2>Posture check</h2></header><p>You’ve moved away from your calibrated posture. Take a moment to reset.</p><div class="actions"><button class="button small" type="button" data-action="open-correction">Open reset</button><button class="button secondary small" type="button" data-action="dismiss-alert">Dismiss</button></div></aside>`;
}

function notificationTestAlert(): string {
  if (!notificationTestResult || model.alertVisible) return '';
  const message = notificationTestResult === 'requested'
    ? 'This in-app alert is working. Your operating system was also asked to show a native notification; Focus or notification settings may suppress it.'
    : 'This in-app alert is working. Native notifications are unavailable, so posture checks will use the in-app alert.';
  return `<aside class="alert-card" role="status" aria-label="Notification test"><header>${icon('bell')}<h2>Test alert received</h2></header><p>${message}</p><div class="actions"><button class="button secondary small" type="button" data-action="dismiss-test-notification">Dismiss</button></div></aside>`;
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

function render(): void {
  const previousVideo = document.querySelector<HTMLVideoElement>('#camera-preview');
  const activeElement = document.activeElement instanceof HTMLElement && app.contains(document.activeElement)
    ? focusIdentity(document.activeElement)
    : null;
  const priorSnoozeOptions = document.querySelector<HTMLElement>('#snooze-options');
  const snoozeWasOpen = Boolean(priorSnoozeOptions && !priorSnoozeOptions.hasAttribute('hidden'));
  const sameScreen = previousRenderedScreen === model.screen;
  document.body.classList.toggle('force-reduced-motion', model.settings.reducedMotion);
  app.innerHTML = `${shell(screen())}${passiveAlert()}${notificationTestAlert()}${deleteDialog()}${diagnosticsDialog()}`;
  announcer.textContent = model.announcement;

  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog')) {
    if (!dialog.open) dialog.showModal();
  }

  if (sameScreen && snoozeWasOpen) document.querySelector<HTMLElement>('#snooze-options')?.removeAttribute('hidden');

  if (previousRenderedScreen !== model.screen) {
    previousRenderedScreen = model.screen;
    requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
  } else if (activeElement) {
    requestAnimationFrame(() => {
      const replacement = [...app.querySelectorAll<HTMLElement>('button, input, select, a[href], [tabindex]')]
        .find((element) => focusIdentity(element) === activeElement);
      replacement?.focus({ preventScroll: true });
    });
  }
  const video = document.querySelector<HTMLVideoElement>('#camera-preview');
  attachCameraPreview(previousVideo, video, previewStream);
}

function focusIdentity(element: HTMLElement): string {
  if (element.matches('main h1')) return 'main-heading';
  if (element.id) return `id:${element.id}`;
  if (element.dataset.focus) return `focus:${element.dataset.focus}`;
  return JSON.stringify({
    action: element.dataset.action ?? '',
    screen: element.dataset.screen ?? '',
    scope: element.dataset.scope ?? '',
    minutes: element.dataset.minutes ?? '',
    setting: element.dataset.setting ?? '',
  });
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

const minutes = (value: number): string => value < 60 ? `${value}m` : `${Math.floor(value / 60)}h ${value % 60}m`;
const formatDate = (value: string): string => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

function ensureCameraController(): LocalCameraPoseController | null {
  if (cameraController) return cameraController;
  if (!navigator.mediaDevices?.getUserMedia) {
    showRecoverableError({ title: 'No camera API is available', message: 'This environment cannot open a local video camera.', action: 'Return to setup', code: 'camera-unavailable' });
    return null;
  }
  try {
    cameraController = new LocalCameraPoseController();
    unsubscribeCamera = cameraController.subscribe(handleCameraEvent);
    return cameraController;
  } catch {
    showRecoverableError({ title: 'No camera API is available', message: 'This environment cannot open a local video camera.', action: 'Return to setup', code: 'camera-unavailable' });
    return null;
  }
}

async function startCamera(forSetup = false, explicitPermissionAction = false): Promise<boolean> {
  if (!cameraConsentGiven && !explicitPermissionAction) {
    dispatch({ type: 'navigate', screen: 'camera' });
    dispatch({ type: 'announce', message: 'Review the camera explanation and choose Allow camera before capture can start.' });
    return false;
  }
  const controller = ensureCameraController();
  if (!controller) return false;
  if (controller.state !== 'running' && selectedCameraId) {
    const availableBeforeStart = await controller.devices().catch(() => []);
    if (availableBeforeStart.length > 0 && !availableBeforeStart.some((device) => device.deviceId === selectedCameraId)) {
      selectedCameraId = null;
    }
  }
  if (controller.state !== 'running') await controller.start(selectedCameraId ?? undefined);
  if (controller.state !== 'running') return false;
  cameraConsentGiven = true;
  cameraDevices = await controller.devices().catch(() => []);
  const actualDeviceId = controller.activeDeviceId;
  if (actualDeviceId) selectedCameraId = actualDeviceId;
  else if (selectedCameraId && !cameraDevices.some((device) => device.deviceId === selectedCameraId)) selectedCameraId = null;
  const selected = cameraDevices.find((device) => device.deviceId === selectedCameraId);
  const name = selected?.label || 'Default camera';
  if (calibrationProfile) {
    const compatible = await calibrationMatchesActiveCamera(calibrationProfile);
    if (model.calibrationReady !== compatible) model = { ...model, calibrationReady: compatible };
  }
  if (forSetup) dispatch({ type: 'camera-granted', name });
  else {
    model = { ...model, cameraAllowed: true, cameraName: name };
    render();
  }
  void desktopCommand('allow-camera');
  void persistConfig();
  return true;
}

async function stopCamera(reason: 'pause' | 'snooze' | 'quit' | 'reset' | 'error' | 'manual' = 'manual'): Promise<void> {
  monitoringSessionActive = false;
  activeAlertEpisodeId = null;
  previewStream = null;
  lastAnalysisTimestampMs = undefined;
  lastAssessmentValid = false;
  lastMonitoringScore = undefined;
  await cameraController?.stop(reason);
}

function handleCameraEvent(event: CameraPipelineEvent): void {
  if (event.type === 'stream') {
    previewStream = event.stream;
    render();
    return;
  }
  if (event.type === 'error') {
    void stopCamera('error');
    showRecoverableError(cameraError(event.code));
    void logLifecycle(cameraErrorLog(event.code));
    return;
  }
  if (event.type === 'worker_restarted') {
    dispatch({ type: 'announce', message: 'Local pose processing restarted safely.' });
    void logLifecycle({ kind: 'error', code: 'worker-crash' });
    return;
  }
  if (event.type !== 'analysis') return;
  inferenceTimings.push(event.inferenceMs);
  if (inferenceTimings.length >= 300) {
    const ordered = [...inferenceTimings].sort((left, right) => left - right);
    const averageMs = ordered.reduce((total, value) => total + value, 0) / ordered.length;
    const p95Ms = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))];
    void logLifecycle({ kind: 'inference-summary', sampleCount: ordered.length, averageMs, p95Ms: Math.max(averageMs, p95Ms) });
    inferenceTimings = [];
  }
  recordMonitoringInterval(event.timestampMs);
  for (const analysisEvent of event.events) handleAnalysisEvent(analysisEvent);
}

function handleAnalysisEvent(event: PoseAnalysisEvent): void {
  if (event.type === 'quality') {
    lastAssessmentValid = event.status === 'assessable';
    applyCameraQuality(qualityFrom(event), guidanceFrom(event));
    if (monitoringSessionActive && ['away', 'multiple_people', 'quality_blocked'].includes(event.status) && model.monitorStatus !== 'cannot-assess') {
      activeAlertEpisodeId = null;
      applyMonitoringUpdate('cannot-assess', null);
      if (model.screen === 'correction') {
        dispatch({ type: 'navigate', screen: 'dashboard' });
        dispatch({ type: 'announce', message: 'The comparison is unavailable, so the prior posture cue was cleared. Restore a clear camera view.' });
      }
      void desktopCommand('cannot-assess');
    }
    return;
  }
  if (event.type === 'calibration_progress') {
    const sampleProgress = Math.min(1, event.validSamples / 35);
    const timeProgress = Math.min(1, event.elapsedMs / 9_000);
    dispatch({ type: 'calibration-progress', progress: Math.floor(100 * Math.min(sampleProgress, timeProgress)) });
    return;
  }
  if (event.type === 'calibration_ready') {
    ensureCameraController()?.stopAnalysis();
    if (calibrationProfile) {
      calibrationCandidate = event.profile;
      dispatch({ type: 'calibration-candidate' });
    } else {
      void acceptCalibration(event.profile);
    }
    return;
  }
  if (event.type === 'calibration_failed') {
    dispatch({ type: 'calibration-cancel', hasExisting: calibrationProfile !== null });
    showRecoverableError({
      title: 'Calibration needs another try',
      message: calibrationFailureMessage(event.reason),
      action: 'Return to positioning',
      code: `calibration-${event.reason}`,
    });
    return;
  }
  if (event.type === 'monitoring') {
    if (event.score === undefined) {
      if (model.monitorStatus !== 'cannot-assess') applyMonitoringUpdate('finding', null);
      return;
    }
    lastMonitoringScore = event.score;
    const score = Math.round(event.score);
    const inCooldown = Date.now() < alertCooldownUntilWallMs;
    const status: MonitorStatus = activeAlertEpisodeId
      ? 'alert'
      : inCooldown
        ? 'cooldown'
        : score < settingsForPreset(model.settings.sensitivity).alertBelow ? 'changing' : 'good';
    if (inCooldown) model = { ...model, cooldownMinutes: Math.max(1, Math.ceil((alertCooldownUntilWallMs - Date.now()) / 60_000)) };
    const correction = event.primaryCue ? cueToCorrection(event.primaryCue) : model.correction;
    const recoveryProgress = recoveryPercent(
      event.recoveryDwellMs ?? 0,
      settingsForPreset(model.settings.sensitivity).recoveryMs,
      activeAlertEpisodeId,
    );
    const update = monitoringUpdateDecision(
      { score: model.score, status: model.monitorStatus, correction: model.correction, recoveryProgress: model.recoveryProgress },
      { score, status, correction, recoveryProgress },
    );
    if (update.apply) {
      applyMonitoringUpdate(status, score, correction, recoveryProgress);
      if (update.semanticChange) void desktopCommand(status === 'changing' || status === 'alert' ? 'pending-alert' : 'assessing');
    }
    return;
  }
  if (event.triggered) {
    if (Date.now() < alertCooldownUntilWallMs) {
      applyMonitoringUpdate('cooldown', Math.round(lastMonitoringScore ?? 0), event.cue ? cueToCorrection(event.cue) : model.correction);
      return;
    }
    alertCooldownUntilWallMs = Date.now() + settingsForPreset(model.settings.sensitivity).cooldownMs;
    model = { ...model, cooldownMinutes: Math.ceil(settingsForPreset(model.settings.sensitivity).cooldownMs / 60_000) };
    const correction = event.cue ? cueToCorrection(event.cue) : model.correction;
    incrementNotificationCount();
    void reportPostureAlert(`episode-${Date.now()}`, correction);
  }
  if (event.recovered) {
    activeAlertEpisodeId = null;
    dispatch({ type: 'recovery-detected', score: Math.round(lastMonitoringScore ?? 75), correction: event.cue ? cueToCorrection(event.cue) : null });
  }
}

async function acceptCalibration(profile: CalibrationProfile): Promise<void> {
  const priorProfile = calibrationProfile;
  calibrationProfile = profile;
  const saved = await persistConfig();
  if (!saved) {
    calibrationProfile = priorProfile;
    calibrationCandidate = null;
    dispatch({ type: 'calibration-cancel', hasExisting: priorProfile !== null });
    ensureCameraController()?.setPositioning();
    showRecoverableError({ title: 'Calibration could not be saved', message: 'Your previous calibration was preserved. Check local storage access, then try again.', action: 'Return to positioning', code: 'storage-calibration' });
    return;
  }
  calibrationCandidate = null;
  dispatch({ type: 'calibration-complete', at: profile.createdAt });
  void logLifecycle({ kind: 'lifecycle', code: 'calibration-completed' });
}

function qualityFrom(event: Extract<PoseAnalysisEvent, { type: 'quality' }>): Partial<Model['cameraQuality']> {
  if (event.status === 'assessable') return { onePerson: true, landmarksVisible: true, scale: true, light: true, stable: true };
  const reason = event.reason ?? '';
  const personPresent = event.status !== 'away' && reason !== 'no_pose';
  return {
    onePerson: personPresent && event.status !== 'multiple_people',
    landmarksVisible: personPresent && !['head_missing', 'shoulders_missing', 'world_missing', 'unsupported_view'].includes(reason),
    scale: !['too_far', 'too_close', 'off_center'].includes(reason),
    light: reason !== 'poor_confidence',
    stable: false,
  };
}

function guidanceFrom(event: Extract<PoseAnalysisEvent, { type: 'quality' }>): CameraGuidance {
  if (event.status === 'assessable') return 'ready';
  return ({
    too_far: 'move-closer',
    too_close: 'move-farther',
    off_center: 'move-center',
    multiple_people: 'one-person',
    head_missing: 'show-head-shoulders',
    shoulders_missing: 'show-head-shoulders',
    world_missing: 'show-head-shoulders',
    unsupported_view: 'face-camera',
    poor_confidence: 'improve-light',
    unstable: 'hold-still',
    no_pose: 'move-into-view',
  } as const)[event.reason ?? 'no_pose'] ?? 'move-into-view';
}

function cueToCorrection(cue: CueKey): Model['correction'] {
  return ({
    headHeight: 'head-height', headForward: 'head-forward', headLateral: 'head-lateral',
    shoulderTilt: 'shoulder-tilt', torsoHeight: 'torso-height', torsoForward: 'torso-forward',
  } as const)[cue];
}

function cameraError(code: CameraErrorCode): NonNullable<Model['error']> {
  const errors: Record<CameraErrorCode, NonNullable<Model['error']>> = {
    permission_denied: { title: 'Camera access is off', message: cameraPermissionRecovery(), action: 'Check again', code: 'camera-permission-denied' },
    no_device: { title: 'No camera was found', message: 'Connect a camera and confirm another local camera app can see it.', action: 'Check again', code: 'camera-no-device' },
    busy: { title: 'Camera is busy', message: 'Close other camera apps, reconnect the camera if needed, then check again.', action: 'Check again', code: 'camera-busy' },
    disconnected: { title: 'Camera disconnected', message: 'Monitoring stopped and the pending alert was cleared. Reconnect the camera to continue.', action: 'Reconnect', code: 'camera-disconnected' },
    unsupported_constraints: { title: 'Camera format is unavailable', message: 'Choose another camera or update its local driver, then try again.', action: 'Choose camera', code: 'camera-constraints' },
    model_failed: { title: 'Local pose model could not start', message: packagedDistribution ? 'Quit and reopen Open Posture, then review local diagnostics if this continues.' : 'Run npm run model:verify, restart the source app, and review local diagnostics if this continues.', action: 'Try model again', code: 'model-load' },
    unknown: { title: 'Camera could not start', message: 'The camera may be unavailable. Close other camera apps and try again.', action: 'Check again', code: 'camera-unknown' },
  };
  return errors[code];
}

function cameraPermissionRecovery(): string {
  if (desktopPlatform === 'darwin') return `Open System Settings → Privacy & Security → Camera, allow ${packagedDistribution ? 'Open Posture' : 'the current development host'}, reopen the app if needed, then check again.`;
  if (desktopPlatform === 'win32') return 'Open Settings → Privacy & security → Camera, enable camera and desktop-app access, then check again.';
  if (desktopPlatform === 'linux') return 'Check the desktop camera portal and /dev/video* access, confirm another local camera app works, then check again.';
  return 'Allow camera access in your operating system privacy settings, reopen the app if needed, then check again.';
}

function cameraErrorLog(code: CameraErrorCode): LifecycleLogEntry {
  if (code === 'permission_denied') return { kind: 'error', code: 'camera-permission' };
  if (code === 'disconnected') return { kind: 'error', code: 'camera-disconnected' };
  if (code === 'model_failed') return { kind: 'error', code: 'model-load' };
  return { kind: 'error', code: 'camera-unavailable' };
}

function calibrationFailureMessage(reason: string): string {
  if (reason === 'not_enough_samples' || reason === 'duration_too_short') return 'Hold a clear, comfortable position a little longer. No partial calibration was saved.';
  if (reason === 'unstable') return 'The reference moved too much to summarize safely. Settle comfortably and try again.';
  if (reason === 'mixed_anchor' || reason === 'missing_core') return 'Keep your head and both shoulders visible in a steady front or three-quarter view.';
  return 'The reference could not be validated. No partial calibration was saved.';
}

async function deviceBindingHash(deviceId: string | null): Promise<string> {
  const source = deviceId || 'default-camera';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function activeCameraBindingId(): string | null {
  return cameraController?.activeDeviceId ?? selectedCameraId;
}

async function calibrationMatchesActiveCamera(profile: CalibrationProfile): Promise<boolean> {
  return profile.deviceIdHash === await deviceBindingHash(activeCameraBindingId());
}

function configInput(): ConfigInput {
  return {
    setup: { onboardingComplete: model.setupComplete && calibrationProfile !== null },
    settings: {
      sensitivity: model.settings.sensitivity,
      previewEnabled: model.settings.preview,
      reducedMotion: model.settings.reducedMotion,
      largeStatus: model.settings.largeStatus,
    },
    selectedCameraId,
    calibration: calibrationProfile,
  };
}

async function persistConfig(): Promise<boolean> {
  const result = await window.openPosture?.saveConfig(configInput());
  if (!result || result.ok) return true;
  storageWarning = 'Local settings could not be saved. Monitoring can continue for this session.';
  dispatch({ type: 'announce', message: 'This change is active for now but could not be saved locally.' });
  void logLifecycle({ kind: 'error', code: 'storage-write' });
  return false;
}

async function logLifecycle(entry: LifecycleLogEntry): Promise<void> {
  await window.openPosture?.appendLifecycleLog(entry).catch(() => undefined);
}

async function deleteStoredData(scope: DeleteScope): Promise<boolean> {
  const bridge = window.openPosture;
  if (!bridge) return false;
  if (scope !== 'history') await stopCamera('reset');
  const deletesHistory = scope === 'history' || scope === 'all';
  const bucketBeforeDelete = currentBucket ? { ...currentBucket } : null;
  if (deletesHistory) {
    window.clearTimeout(historyFlushTimer);
    historyFlushTimer = undefined;
    currentBucket = null;
    await historyWrites.suspendAndDrain();
  }
  const result = scope === 'history'
    ? await bridge.deleteHistory().catch(() => ({ ok: false, error: 'io' } as const))
    : scope === 'calibration'
      ? await bridge.deleteCalibration().catch(() => ({ ok: false, error: 'io' } as const))
      : await bridge.deleteAllData().catch(() => ({ ok: false, error: 'io' } as const));
  if (!result.ok) {
    if (deletesHistory) {
      currentBucket = bucketBeforeDelete;
      historyWrites.resume();
      if (currentBucket) scheduleHistoryFlush();
    }
    storageWarning = 'Local data could not be deleted. No deletion was reported as complete.';
    dispatch({ type: 'cancel-delete' });
    dispatch({ type: 'announce', message: 'Local data could not be deleted. Nothing was reported as removed.' });
    await logLifecycle({ kind: 'error', code: 'storage-delete' });
    return false;
  }
  if (scope === 'history') {
    const retention = await bridge.setHistoryRetention(model.settings.historyDays);
    if (!retention.ok) dispatch({ type: 'announce', message: 'History was deleted, but its retention preference could not be restored.' });
  }
  if (scope === 'history' || scope === 'all') {
    storedHistory = { schemaVersion: 1, retentionDays: scope === 'all' ? 30 : model.settings.historyDays, buckets: [] };
    currentBucket = null;
    refreshHistorySummary();
    historyWrites.resume();
  }
  if (scope === 'calibration' || scope === 'all') calibrationProfile = null;
  if (scope === 'all') selectedCameraId = null;
  return true;
}

async function copyDiagnostics(): Promise<void> {
  try {
    const diagnostics = await window.openPosture?.getDiagnosticsText();
    if (!diagnostics) throw new Error('Diagnostics unavailable');
    diagnosticsPreview = diagnostics.text;
    dispatch({ type: 'announce', message: 'Sanitized diagnostics are ready to review before copying.' });
  } catch {
    dispatch({ type: 'announce', message: 'Sanitized diagnostics could not be copied. No private camera data was accessed.' });
  }
}

async function confirmDiagnosticsCopy(): Promise<void> {
  if (diagnosticsPreview === null) return;
  try {
    await navigator.clipboard.writeText(diagnosticsPreview);
    diagnosticsPreview = null;
    dispatch({ type: 'announce', message: 'The reviewed sanitized diagnostics were copied.' });
  } catch {
    dispatch({ type: 'announce', message: 'Sanitized diagnostics could not be copied. No private camera data was accessed.' });
  }
}

function recordMonitoringInterval(timestampMs: number): void {
  if (!monitoringSessionActive) {
    lastAnalysisTimestampMs = undefined;
    return;
  }
  if (historyWrites.suspended) {
    lastAnalysisTimestampMs = timestampMs;
    return;
  }
  if (lastAnalysisTimestampMs === undefined || timestampMs <= lastAnalysisTimestampMs) {
    lastAnalysisTimestampMs = timestampMs;
    return;
  }
  const elapsedSeconds = Math.min(1, (timestampMs - lastAnalysisTimestampMs) / 1_000);
  lastAnalysisTimestampMs = timestampMs;
  if (storedHistory.retentionDays === 0 || elapsedSeconds <= 0) return;
  const now = new Date();
  const bucketStartUtc = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
  if (!currentBucket || currentBucket.bucketStartUtc !== bucketStartUtc) {
    if (currentBucket) void flushHistory();
    currentBucket = storedHistory.buckets.find((bucket) => bucket.bucketStartUtc === bucketStartUtc) ?? {
      bucketStartUtc,
      localOffsetMinutes: -now.getTimezoneOffset(),
      monitoredSeconds: 0,
      validSeconds: 0,
      scoreSum: 0,
      scoreSampleCount: 0,
      belowThresholdSeconds: 0,
      notificationCount: 0,
    };
  }
  currentBucket.monitoredSeconds = Math.min(60, currentBucket.monitoredSeconds + elapsedSeconds);
  if (lastAssessmentValid && lastMonitoringScore !== undefined) {
    currentBucket.validSeconds = Math.min(currentBucket.monitoredSeconds, currentBucket.validSeconds + elapsedSeconds);
    currentBucket.scoreSum += lastMonitoringScore;
    currentBucket.scoreSampleCount += 1;
    if (lastMonitoringScore < settingsForPreset(model.settings.sensitivity).alertBelow) {
      currentBucket.belowThresholdSeconds = Math.min(currentBucket.validSeconds, currentBucket.belowThresholdSeconds + elapsedSeconds);
    }
  }
  scheduleHistoryFlush();
}

function incrementNotificationCount(): void {
  if (!currentBucket) return;
  currentBucket.notificationCount += 1;
  refreshHistorySummary();
  scheduleHistoryFlush();
}

function scheduleHistoryFlush(): void {
  if (historyWrites.suspended) return;
  if (historyFlushTimer !== undefined) return;
  historyFlushTimer = window.setTimeout(() => {
    historyFlushTimer = undefined;
    void flushHistory();
  }, 5_000);
}

async function flushHistory(): Promise<void> {
  window.clearTimeout(historyFlushTimer);
  historyFlushTimer = undefined;
  if (!currentBucket || storedHistory.retentionDays === 0 || historyWrites.suspended) return historyWrites.drain();
  const snapshot = { ...currentBucket };
  return historyWrites.enqueue(() => writeHistorySnapshot(snapshot));
}

async function writeHistorySnapshot(snapshot: MinuteAggregate): Promise<void> {
  const result = await window.openPosture?.upsertHistory(snapshot).catch(() => undefined);
  if (!result || !result.ok) {
    storageWarning = 'Local history could not be saved. Monitoring remains active without claiming that history was stored.';
    dispatch({ type: 'announce', message: 'Monitoring continues, but local history could not be saved.' });
    void logLifecycle({ kind: 'error', code: 'storage-write' });
    return;
  }
  storedHistory = {
    ...storedHistory,
    buckets: [...storedHistory.buckets.filter((bucket) => bucket.bucketStartUtc !== snapshot.bucketStartUtc), snapshot]
      .sort((left, right) => left.bucketStartUtc.localeCompare(right.bucketStartUtc)),
  };
  refreshHistorySummary();
}

function refreshHistorySummary(): void {
  const buckets = currentBucket
    ? [...storedHistory.buckets.filter((bucket) => bucket.bucketStartUtc !== currentBucket?.bucketStartUtc), currentBucket]
    : storedHistory.buckets;
  const todayKey = localDateKey(Date.now(), -new Date().getTimezoneOffset());
  const today = buckets.filter((bucket) => localDateKey(Date.parse(bucket.bucketStartUtc), bucket.localOffsetMinutes) === todayKey);
  const monitoredSeconds = today.reduce((total, bucket) => total + bucket.monitoredSeconds, 0);
  const validSeconds = today.reduce((total, bucket) => total + bucket.validSeconds, 0);
  const scoreSum = today.reduce((total, bucket) => total + bucket.scoreSum, 0);
  const scoreSamples = today.reduce((total, bucket) => total + bucket.scoreSampleCount, 0);
  dispatch({
    type: 'history',
    history: {
      monitoredMinutes: Math.round(monitoredSeconds / 60),
      assessedMinutes: Math.round(validSeconds / 60),
      averageSimilarity: scoreSamples ? Math.round(scoreSum / scoreSamples) : null,
      notifiedEpisodes: today.reduce((total, bucket) => total + bucket.notificationCount, 0),
    },
  });
}

function localDateKey(timestampMs: number, offsetMinutes: number): string {
  return new Date(timestampMs + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function scheduleSnoozeResume(minutesToSnooze: number): void {
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  const snoozeUntilWallMs = Date.now() + minutesToSnooze * 60_000;
  snoozeTimer = window.setTimeout(() => {
    if (model.monitorStatus !== 'snoozed' || !calibrationProfile) return;
    void resumeAfterSnooze();
  }, minutesToSnooze * 60_000);
  const updateRemaining = (): void => {
    if (model.monitorStatus !== 'snoozed') return;
    const remaining = Math.max(1, Math.ceil((snoozeUntilWallMs - Date.now()) / 60_000));
    if (model.snoozeMinutes !== remaining) {
      model = { ...model, snoozeMinutes: remaining };
      render();
    }
    snoozeTickTimer = window.setTimeout(updateRemaining, 30_000);
  };
  snoozeTickTimer = window.setTimeout(updateRemaining, 30_000);
}

async function resumeAfterSnooze(): Promise<void> {
  await startMonitoringSession('Snooze ended. Monitoring resumed and is finding you.');
}

async function startMonitoringSession(announcement?: string): Promise<boolean> {
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  if (!calibrationProfile) {
    dispatch({ type: 'navigate', screen: model.cameraAllowed ? 'calibration' : 'camera' });
    dispatch({ type: 'announce', message: 'A valid calibration is required before monitoring.' });
    await desktopCommand('ready');
    return false;
  }
  const controller = ensureCameraController();
  if (!controller) return false;
  controller.setPositioning();
  if (!(await startCamera())) return false;
  if (!(await calibrationMatchesActiveCamera(calibrationProfile))) {
    monitoringSessionActive = false;
    activeAlertEpisodeId = null;
    controller.setPositioning();
    model = { ...model, calibrationReady: false };
    dispatch({ type: 'navigate', screen: 'positioning' });
    dispatch({ type: 'announce', message: 'This camera does not match the saved reference. Check framing, then calibrate this camera before monitoring.' });
    await desktopCommand('allow-camera');
    return false;
  }
  controller.startMonitoring(calibrationProfile, settingsForPreset(model.settings.sensitivity));
  monitoringSessionActive = true;
  lastAnalysisTimestampMs = undefined;
  model = { ...model, setupComplete: true, calibrationReady: true };
  dispatch({ type: 'monitor', status: 'finding', score: null });
  dispatch({ type: 'navigate', screen: 'dashboard' });
  if (announcement) dispatch({ type: 'announce', message: announcement });
  await logLifecycle({ kind: 'lifecycle', code: 'monitoring-started' });
  await desktopCommand('monitoring');
  return true;
}

async function pauseMonitoring(announcement?: string): Promise<void> {
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  calibrationCountdownGeneration++;
  calibrationCountdownSeconds = 0;
  await stopCamera('pause');
  await flushHistory();
  dispatch({ type: 'monitor', status: 'paused', score: null });
  dispatch({ type: 'navigate', screen: model.setupComplete ? 'dashboard' : 'camera' });
  if (announcement) dispatch({ type: 'announce', message: announcement });
  await logLifecycle({ kind: 'lifecycle', code: 'monitoring-paused' });
  await desktopCommand('paused');
}

async function snoozeMonitoring(minutesToSnooze: number): Promise<void> {
  if (!calibrationProfile || !monitoringSessionActive) {
    dispatch({ type: 'announce', message: 'Snooze is available while monitoring is active.' });
    await desktopCommand(model.monitorStatus === 'paused' ? 'paused' : 'ready');
    return;
  }
  calibrationCountdownGeneration++;
  calibrationCountdownSeconds = 0;
  await stopCamera('snooze');
  await flushHistory();
  dispatch({ type: 'snooze', minutes: minutesToSnooze });
  dispatch({ type: 'navigate', screen: 'dashboard' });
  await logLifecycle({ kind: 'lifecycle', code: 'monitoring-snoozed' });
  await desktopCommand('snoozed');
  scheduleSnoozeResume(minutesToSnooze);
}

async function preparePositioningCapture(): Promise<boolean> {
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  calibrationCountdownGeneration++;
  calibrationCountdownSeconds = 0;
  await stopCamera('pause');
  await flushHistory();
  dispatch({ type: 'monitor', status: 'paused', score: null });
  await desktopCommand('paused');
  const controller = ensureCameraController();
  controller?.setPositioning();
  return startCamera();
}

async function beginRecalibration(): Promise<void> {
  calibrationCandidate = null;
  if (!(await preparePositioningCapture())) return;
  dispatch({ type: 'calibration-restart' });
  dispatch({ type: 'navigate', screen: 'calibration' });
  await desktopCommand('calibrating');
}

async function startCalibrationCountdown(): Promise<void> {
  if (calibrationCountdownSeconds > 0 || !positioningReady(model)) return;
  if (!(await startCamera())) return;
  const generation = ++calibrationCountdownGeneration;
  for (let seconds = 3; seconds > 0; seconds--) {
    calibrationCountdownSeconds = seconds;
    dispatch({ type: 'announce', message: `Calibration begins in ${seconds}. Choose Cancel to stop.` });
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    if (generation !== calibrationCountdownGeneration) return;
  }
  calibrationCountdownSeconds = 0;
  if (!positioningReady(model)) {
    dispatch({ type: 'announce', message: 'Framing changed during the countdown. Restore every positioning check, then try again.' });
    return;
  }
  const controller = ensureCameraController();
  if (!controller) return;
  const deviceIdHash = await resolveCurrentCalibrationBinding(
    () => deviceBindingHash(activeCameraBindingId()),
    () => generation === calibrationCountdownGeneration && model.screen === 'calibration' && controller.state === 'running',
  );
  if (!deviceIdHash) return;
  controller.beginCalibration({
    model: MODEL_IDENTITY,
    createdAt: new Date().toISOString(),
    deviceIdHash,
  });
  dispatch({ type: 'announce', message: 'Calibration started. Hold your comfortable reference while progress updates.' });
  dispatch({ type: 'calibration-progress', progress: 1 });
  await logLifecycle({ kind: 'lifecycle', code: 'calibration-started' });
  if (generation !== calibrationCountdownGeneration || model.screen !== 'calibration' || controller.state !== 'running') return;
  await desktopCommand('calibrating');
}

async function cancelCalibrationAttempt(): Promise<void> {
  calibrationCountdownGeneration++;
  calibrationCountdownSeconds = 0;
  calibrationCandidate = null;
  ensureCameraController()?.setPositioning();
  dispatch({ type: 'calibration-cancel', hasExisting: calibrationProfile !== null });
  await desktopCommand('allow-camera');
}

app.addEventListener('click', async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;

  switch (action) {
    case 'go': {
      const destination = target.dataset.screen as Screen;
      notificationTestResult = null;
      if (destination === 'positioning') {
        if (!(await preparePositioningCapture())) break;
      } else if (['positioning', 'calibration'].includes(model.screen) && !['positioning', 'calibration'].includes(destination)) {
        const abandoningCalibration = shouldCancelCalibrationOnNavigation({
          currentScreen: model.screen,
          destination,
          countdownSeconds: calibrationCountdownSeconds,
          progress: model.calibrationProgress,
          replacing: model.calibrationReplacing,
          candidateReady: model.calibrationCandidateReady,
        });
        calibrationCountdownGeneration++;
        calibrationCountdownSeconds = 0;
        if (abandoningCalibration) {
          calibrationCandidate = null;
          dispatch({ type: 'calibration-cancel', hasExisting: calibrationProfile !== null });
        }
        await stopCamera('manual');
        await flushHistory();
        await desktopCommand('ready');
      }
      dispatch({ type: 'navigate', screen: destination });
      break;
    }
    case 'allow-camera':
      dispatch({ type: 'busy', value: true });
      ensureCameraController()?.setPositioning();
      if (!(await startCamera(true, true))) {
        dispatch({ type: 'busy', value: false });
        break;
      }
      dispatch({ type: 'busy', value: false });
      break;
    case 'camera-not-now':
      await stopCamera('manual');
      await desktopCommand('ready');
      dispatch({ type: 'camera-denied' });
      dispatch({ type: 'navigate', screen: 'ready' });
      break;
    case 'start-calibration': await startCalibrationCountdown(); break;
    case 'cancel-calibration': await cancelCalibrationAttempt(); break;
    case 'restart-calibration': calibrationCandidate = null; ensureCameraController()?.setPositioning(); dispatch({ type: 'calibration-restart' }); break;
    case 'confirm-calibration': if (calibrationCandidate) await acceptCalibration(calibrationCandidate); break;
    case 'keep-calibration': await cancelCalibrationAttempt(); dispatch({ type: 'announce', message: 'The existing saved reference was kept. Select its camera before monitoring, or try recalibration again.' }); break;
    case 'restore-monitoring-defaults':
      dispatch({ type: 'setting', key: 'sensitivity', value: 'balanced' });
      dispatch({ type: 'setting', key: 'preview', value: true });
      await persistConfig();
      if (calibrationProfile && monitoringSessionActive && cameraController?.state === 'running') {
        cameraController.startMonitoring(calibrationProfile, settingsForPreset('balanced'));
        activeAlertEpisodeId = null;
        applyMonitoringUpdate('finding', null);
        await desktopCommand('monitoring');
      }
      dispatch({ type: 'announce', message: 'Monitoring defaults restored: Balanced sensitivity and preview shown.' });
      break;
    case 'restore-accessibility-defaults':
      dispatch({ type: 'setting', key: 'reducedMotion', value: false });
      dispatch({ type: 'setting', key: 'largeStatus', value: false });
      await persistConfig();
      dispatch({ type: 'announce', message: 'Accessibility defaults restored: system motion preference and standard status size.' });
      break;
    case 'restore-history-defaults': {
      const restored = await window.openPosture?.setHistoryRetention(30);
      if (restored?.ok) {
        storedHistory = { ...storedHistory, retentionDays: 30 };
        dispatch({ type: 'setting', key: 'historyDays', value: 30 });
        refreshHistorySummary();
        dispatch({ type: 'announce', message: 'History retention default restored to 30 days.' });
      } else dispatch({ type: 'announce', message: 'History retention could not be restored.' });
      break;
    }
    case 'reveal-data-folder': {
      const revealed = await window.openPosture?.revealDataFolder();
      dispatch({ type: 'announce', message: revealed ? 'The local Open Posture data folder was opened.' : 'The local data folder could not be opened.' });
      break;
    }
    case 'test-notification': {
      notificationTestResult = 'unavailable';
      try {
        if (window.openPosture) notificationTestResult = (await window.openPosture.sendTestNotification()).status;
      } catch {}
      dispatch({ type: 'notification-capability', capability: notificationTestResult === 'requested' ? 'available' : 'unavailable' });
      dispatch({ type: 'announce', message: notificationTestResult === 'requested' ? 'Test alert shown. Native delivery was requested.' : 'Test alert shown. Native notifications are unavailable.' });
      break;
    }
    case 'dismiss-test-notification': notificationTestResult = null; render(); break;
    case 'finish-setup':
      notificationTestResult = null;
      model = { ...model, setupComplete: model.calibrationReady && calibrationProfile !== null };
      await persistConfig();
      await stopCamera('manual');
      await desktopCommand('ready');
      dispatch({ type: 'navigate', screen: 'ready' });
      break;
    case 'start-monitoring': case 'resume-monitoring':
      window.clearTimeout(snoozeTimer);
      await startMonitoringSession();
      break;
    case 'pause-monitoring':
      await pauseMonitoring();
      break;
    case 'snooze-menu': document.querySelector<HTMLElement>('#snooze-options')?.removeAttribute('hidden'); break;
    case 'snooze': {
      const snoozeMinutes = Number(target.dataset.minutes);
      await snoozeMonitoring(snoozeMinutes);
      break;
    }
    case 'recalibrate': await beginRecalibration(); break;
    case 'open-correction': dispatch({ type: 'dismiss-alert' }); dispatch({ type: 'navigate', screen: 'correction' }); break;
    case 'dismiss-alert': dispatch({ type: 'dismiss-alert' }); break;
    case 'adjusted': dispatch({ type: 'dismiss-alert' }); dispatch({ type: 'navigate', screen: 'dashboard' }); dispatch({ type: 'announce', message: 'Monitoring continues. Recovery is detected from the live comparison.' }); break;
    case 'confirm-delete': dispatch({ type: 'confirm-delete', scope: target.dataset.scope as DeleteScope }); break;
    case 'cancel-delete': dispatch({ type: 'cancel-delete' }); break;
    case 'delete-now': {
      const scope = target.dataset.scope as DeleteScope;
      if (await deleteStoredData(scope)) dispatch({ type: 'deleted', scope });
      break;
    }
    case 'retry-error': dispatch({ type: 'clear-error' }); ensureCameraController()?.setPositioning(); await startCamera(true); await desktopCommand('retry'); break;
    case 'clear-error': await stopCamera('error'); dispatch({ type: 'clear-error' }); await desktopCommand('ready'); break;
    case 'copy-diagnostics': await copyDiagnostics(); break;
    case 'copy-diagnostics-now': await confirmDiagnosticsCopy(); break;
    case 'cancel-diagnostics': diagnosticsPreview = null; dispatch({ type: 'announce', message: 'Diagnostics were not copied.' }); break;
    case 'open-source': await desktopCommand('open-source'); break;
  }
});

app.addEventListener('change', async (event) => {
  const cameraControl = (event.target as HTMLElement).closest<HTMLSelectElement>('[data-camera-device]');
  if (cameraControl) {
    await stopCamera('pause');
    await flushHistory();
    selectedCameraId = cameraControl.value || null;
    const selected = cameraDevices.find((device) => device.deviceId === selectedCameraId);
    model = { ...model, cameraName: selected?.label || 'Default camera' };
    ensureCameraController()?.setPositioning();
    await startCamera();
    const compatible = calibrationProfile ? await calibrationMatchesActiveCamera(calibrationProfile) : false;
    model = { ...model, calibrationReady: compatible };
    dispatch({ type: 'monitor', status: 'paused', score: null });
    await persistConfig();
    await desktopCommand('allow-camera');
    dispatch({ type: 'announce', message: compatible ? 'Camera changed back to the saved reference. Check framing before monitoring.' : 'Camera changed. Check framing and create a calibration for this camera before monitoring.' });
    return;
  }
  const control = (event.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement>('[data-setting]');
  if (!control) return;
  const key = control.dataset.setting as keyof Model['settings'];
  const value = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked : key === 'historyDays' ? Number(control.value) : control.value;
  dispatch({ type: 'setting', key, value: value as never });
  if (key === 'historyDays') {
    const retention = value as 0 | 7 | 30 | 90;
    const result = await window.openPosture?.setHistoryRetention(retention);
    if (result?.ok) {
      storedHistory = { ...storedHistory, retentionDays: retention, buckets: retention === 0 ? [] : storedHistory.buckets };
      if (retention === 0) currentBucket = null;
      refreshHistorySummary();
    } else {
      storageWarning = 'History retention could not be saved.';
      dispatch({ type: 'announce', message: storageWarning });
    }
  } else {
    await persistConfig();
    if (key === 'sensitivity' && calibrationProfile && monitoringSessionActive && cameraController?.state === 'running') {
      cameraController.startMonitoring(calibrationProfile, settingsForPreset(value as SensitivityName));
      activeAlertEpisodeId = null;
      applyMonitoringUpdate('finding', null);
      await desktopCommand('monitoring');
    }
  }
  await desktopCommand('settings-changed');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && model.deleteScope) dispatch({ type: 'cancel-delete' });
  else if (event.key === 'Escape' && diagnosticsPreview !== null) {
    diagnosticsPreview = null;
    dispatch({ type: 'announce', message: 'Diagnostics were not copied.' });
  }
});

type DesktopIntent = 'allow-camera' | 'calibrating' | 'monitoring' | 'assessing' | 'cannot-assess' | 'pending-alert' | 'paused' | 'snoozed' | 'ready' | 'retry' | 'settings-changed' | 'copy-diagnostics' | 'open-source' | `delete-${DeleteScope}`;

async function desktopCommand(intent: DesktopIntent): Promise<void> {
  // The preload bridge deliberately stays narrow. This adapter is the only renderer
  // location that knows its command/event vocabulary.
  const bridge = window.openPosture;
  if (!bridge) return;
  await dispatchToDesktop(bridge, intent);
}

async function dispatchToDesktop(bridge: NonNullable<Window['openPosture']>, intent: DesktopIntent): Promise<void> {
  const monitoringState: Partial<Record<DesktopIntent, MonitoringState>> = {
    'allow-camera': 'assessing',
    calibrating: 'assessing',
    monitoring: 'finding',
    assessing: 'assessing',
    'cannot-assess': 'cannot-assess',
    'pending-alert': 'pending-alert',
    paused: 'paused',
    snoozed: 'snoozed',
    ready: 'ready',
    retry: 'finding',
  };
  const state = monitoringState[intent];
  if (state) await bridge.setMonitoringState(state);
  if (intent === 'open-source') await bridge.openExternalLink('license');
}

function handleDesktopEvent(event: DesktopEvent): void {
  if (event.type === 'prepare-to-quit') {
    if (!preparingToQuit) void prepareToQuit();
    return;
  }
  if (event.type === 'tray-command') {
    if (event.command === 'open') dispatch({ type: 'navigate', screen: model.setupComplete ? 'dashboard' : 'welcome' });
    if (event.command === 'start') {
      void startMonitoringSession();
    }
    if (event.command === 'pause') {
      void pauseMonitoring();
    }
    if (event.command === 'recalibrate') {
      void beginRecalibration();
    }
  }
  if (event.type === 'tray-snooze') {
    void snoozeMonitoring(event.minutes);
  }
  if (event.type === 'system-pause') {
    void pauseMonitoring('Monitoring paused because the computer was locked or suspended. The camera is off.').then(() =>
      logLifecycle({ kind: 'lifecycle', code: event.reason === 'suspend' ? 'suspend' : 'lock' }),
    );
  }
  if (event.type === 'notification-failed') {
    dispatch({ type: 'notification-capability', capability: 'unavailable' });
    if (event.notification === 'posture' && event.episodeId && isActiveAlertEpisode(event.episodeId, activeAlertEpisodeId, monitoringSessionActive, model.monitorStatus)) {
      dispatch({ type: 'announce', message: 'Native delivery failed. The current in-app posture check is available.' });
    }
    else if (event.notification === 'test') {
      notificationTestResult = 'unavailable';
      dispatch({ type: 'announce', message: 'Native notifications are unavailable. The in-app test alert remains available.' });
    }
  }
  if (event.type === 'notification-clicked') {
    if (event.notification === 'test') notificationTestResult = null;
    if (event.notification === 'posture' && event.episodeId === activeAlertEpisodeId && model.monitorStatus === 'alert') dispatch({ type: 'navigate', screen: 'correction' });
    else {
      dispatch({ type: 'navigate', screen: model.setupComplete ? 'dashboard' : 'ready' });
      dispatch({ type: 'announce', message: event.notification === 'posture' ? 'That posture check is no longer active.' : 'Notification test opened.' });
    }
  }
}

async function prepareToQuit(): Promise<void> {
  preparingToQuit = true;
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  calibrationCountdownGeneration++;
  calibrationCountdownSeconds = 0;
  await stopCamera('quit');
  await flushHistory();
  await logLifecycle({ kind: 'lifecycle', code: 'quit' });
  await window.openPosture?.readyToQuit();
}

export function applyMonitoringUpdate(status: MonitorStatus, score: number | null, correction: Model['correction'] = null, recoveryProgress = 0): void {
  const nextRecoveryProgress = status === 'good' ? 100 : status === 'alert' ? recoveryProgress : 0;
  if (model.monitorStatus === status && model.score === score && model.correction === correction && model.recoveryProgress === nextRecoveryProgress && !(status === 'alert' && !model.alertVisible)) return;
  dispatch({ type: 'monitor', status, score, correction, recoveryProgress });
}

export function applyCameraQuality(quality: Partial<Model['cameraQuality']>, guidance: CameraGuidance = model.cameraGuidance): void {
  if (guidance === model.cameraGuidance && Object.entries(quality).every(([key, value]) => model.cameraQuality[key as keyof Model['cameraQuality']] === value)) return;
  dispatch({ type: 'camera-quality', quality, guidance });
}

export function showRecoverableError(error: Model['error']): void {
  if (!error) return;
  void stopCamera('error');
  dispatch({ type: 'error', error });
}

export async function reportPostureAlert(episodeId: string, correction: Model['correction']): Promise<void> {
  activeAlertEpisodeId = episodeId;
  dispatch({ type: 'alert', correction });
  const isCurrent = (): boolean => isActiveAlertEpisode(episodeId, activeAlertEpisodeId, monitoringSessionActive, model.monitorStatus);
  await requestAlertAndShowFallback({
    isCurrent,
    requestNative: async () => {
      await desktopCommand('pending-alert');
      if (!isCurrent() || !window.openPosture) return { status: 'unavailable' };
      return window.openPosture.reportPostureAlert(episodeId);
    },
    showFallback: () => window.openPosture?.showPostureFallback(episodeId) ?? Promise.resolve(),
    markUnavailable: () => dispatch({ type: 'notification-capability', capability: 'unavailable' }),
  });
}

async function initializeDesktop(): Promise<void> {
  const bridge = window.openPosture;
  if (!bridge) return;
  const [capabilities, configResult, historyResult, runtimeInfo] = await Promise.all([
    bridge.getCapabilities(),
    bridge.loadConfig(),
    bridge.loadHistory(),
    bridge.getRuntimeInfo(),
  ]);
  trayAvailable = capabilities.tray;
  const storedCalibration = configResult.value.calibration;
  const calibrationCompatible = storedCalibration !== null &&
    storedCalibration.model.id === MODEL_IDENTITY.id &&
    storedCalibration.model.version === MODEL_IDENTITY.version &&
    storedCalibration.model.sha256 === MODEL_IDENTITY.sha256;
  calibrationProfile = calibrationCompatible ? storedCalibration : null;
  if (storedCalibration && !calibrationCompatible) await bridge.deleteCalibration();
  selectedCameraId = configResult.value.selectedCameraId;
  storedHistory = historyResult.value;
  const setupComplete = configResult.value.setup.onboardingComplete && calibrationProfile !== null;
  cameraConsentGiven = setupComplete;
  model = {
    ...model,
    screen: setupComplete ? 'ready' : 'welcome',
    previousScreen: setupComplete ? 'ready' : 'welcome',
    setupComplete,
    cameraAllowed: setupComplete,
    calibrationReady: calibrationProfile !== null,
    calibratedAt: calibrationProfile?.createdAt ?? null,
    cameraName: selectedCameraId ? 'Saved camera' : 'Default camera',
    settings: {
      sensitivity: configResult.value.settings.sensitivity,
      preview: configResult.value.settings.previewEnabled,
      historyDays: historyResult.value.retentionDays,
      reducedMotion: configResult.value.settings.reducedMotion,
      largeStatus: configResult.value.settings.largeStatus,
    },
  };
  dispatch({ type: 'notification-capability', capability: capabilities.nativeNotifications ? 'available' : 'unavailable' });
  refreshHistorySummary();
  unsubscribeDesktop = bridge.onDesktopEvent(handleDesktopEvent);
  desktopPlatform = runtimeInfo.platform;
  appVersion = runtimeInfo.appVersion;
  buildCommit = runtimeInfo.buildCommit;
  packagedDistribution = runtimeInfo.isPackaged;
  if (configResult.notices.length || historyResult.notices.length) {
    storageWarning = 'Local data needed safe recovery. Review Settings and recalibrate if requested.';
    dispatch({ type: 'announce', message: 'Local data needed safe recovery. Review Settings and recalibrate if requested.' });
  } else if (storedCalibration && !calibrationCompatible) {
    dispatch({ type: 'announce', message: 'The local pose model changed, so a fresh calibration is required.' });
  }
}

render();
window.addEventListener('beforeunload', () => {
  unsubscribeDesktop?.();
  unsubscribeCamera?.();
  window.clearTimeout(snoozeTimer);
  window.clearTimeout(snoozeTickTimer);
  window.clearTimeout(historyFlushTimer);
  void stopCamera('quit');
  void flushHistory();
}, { once: true });
void initializeDesktop().catch(() => {
  dispatch({ type: 'notification-capability', capability: 'unavailable' });
  dispatch({ type: 'announce', message: 'Desktop capabilities could not be read. The local interface remains available.' });
});
