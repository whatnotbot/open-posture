export type Screen =
  | 'welcome'
  | 'camera'
  | 'positioning'
  | 'calibration'
  | 'notifications'
  | 'ready'
  | 'dashboard'
  | 'correction'
  | 'history'
  | 'settings'
  | 'error';

export type MonitorStatus =
  | 'ready'
  | 'finding'
  | 'good'
  | 'changing'
  | 'alert'
  | 'cannot-assess'
  | 'cooldown'
  | 'paused'
  | 'snoozed'
  | 'error';

export type CameraQuality = {
  onePerson: boolean;
  landmarksVisible: boolean;
  scale: boolean;
  light: boolean;
  stable: boolean;
};

export type CameraGuidance =
  | 'ready'
  | 'move-closer'
  | 'move-farther'
  | 'move-center'
  | 'one-person'
  | 'show-head-shoulders'
  | 'face-camera'
  | 'improve-light'
  | 'hold-still'
  | 'move-into-view';

export type Settings = {
  sensitivity: 'gentle' | 'balanced' | 'strict';
  preview: boolean;
  historyDays: 0 | 7 | 30 | 90;
  reducedMotion: boolean;
  largeStatus: boolean;
};

export type HistorySummary = {
  monitoredMinutes: number;
  assessedMinutes: number;
  averageSimilarity: number | null;
  notifiedEpisodes: number;
};

export type AppError = {
  title: string;
  message: string;
  action: string;
  code?: string;
};

export type DeleteScope = 'history' | 'calibration' | 'all';

export type Model = {
  screen: Screen;
  previousScreen: Screen;
  bridgeAvailable: boolean;
  busy: boolean;
  setupComplete: boolean;
  cameraAllowed: boolean;
  cameraName: string;
  cameraQuality: CameraQuality;
  cameraGuidance: CameraGuidance;
  calibrationProgress: number;
  calibrationReady: boolean;
  calibrationReplacing: boolean;
  calibrationCandidateReady: boolean;
  calibratedAt: string | null;
  notificationCapability: 'unknown' | 'available' | 'unavailable';
  monitorStatus: MonitorStatus;
  score: number | null;
  correction: 'head-forward' | 'head-height' | 'head-lateral' | 'shoulder-tilt' | 'torso-forward' | 'torso-height' | null;
  alertVisible: boolean;
  recoveryProgress: number;
  resetDetected: boolean;
  cooldownMinutes: number;
  snoozeMinutes: number;
  history: HistorySummary;
  settings: Settings;
  deleteScope: DeleteScope | null;
  error: AppError | null;
  announcement: string;
};

export type Action =
  | { type: 'navigate'; screen: Screen }
  | { type: 'bridge'; available: boolean }
  | { type: 'busy'; value: boolean }
  | { type: 'camera-granted'; name?: string }
  | { type: 'camera-denied' }
  | { type: 'camera-quality'; quality: Partial<CameraQuality>; guidance?: CameraGuidance }
  | { type: 'calibration-progress'; progress: number }
  | { type: 'calibration-restart' }
  | { type: 'calibration-candidate' }
  | { type: 'calibration-cancel'; hasExisting: boolean }
  | { type: 'calibration-complete'; at?: string }
  | { type: 'notification-capability'; capability: Model['notificationCapability'] }
  | { type: 'monitor'; status: MonitorStatus; score?: number | null; correction?: Model['correction']; recoveryProgress?: number }
  | { type: 'alert'; correction?: Model['correction'] }
  | { type: 'recovery-detected'; score: number; correction?: Model['correction'] }
  | { type: 'dismiss-alert' }
  | { type: 'snooze'; minutes: number }
  | { type: 'history'; history: Partial<HistorySummary> }
  | { type: 'setting'; key: keyof Settings; value: Settings[keyof Settings] }
  | { type: 'confirm-delete'; scope: DeleteScope }
  | { type: 'cancel-delete' }
  | { type: 'deleted'; scope: DeleteScope }
  | { type: 'error'; error: AppError }
  | { type: 'clear-error' }
  | { type: 'announce'; message: string };

export const initialModel: Model = {
  screen: 'welcome',
  previousScreen: 'welcome',
  bridgeAvailable: false,
  busy: false,
  setupComplete: false,
  cameraAllowed: false,
  cameraName: 'Default camera',
  cameraQuality: {
    onePerson: false,
    landmarksVisible: false,
    scale: false,
    light: false,
    stable: false,
  },
  cameraGuidance: 'move-into-view',
  calibrationProgress: 0,
  calibrationReady: false,
  calibrationReplacing: false,
  calibrationCandidateReady: false,
  calibratedAt: null,
  notificationCapability: 'unknown',
  monitorStatus: 'ready',
  score: null,
  correction: null,
  alertVisible: false,
  recoveryProgress: 0,
  resetDetected: false,
  cooldownMinutes: 0,
  snoozeMinutes: 0,
  history: {
    monitoredMinutes: 0,
    assessedMinutes: 0,
    averageSimilarity: null,
    notifiedEpisodes: 0,
  },
  settings: {
    sensitivity: 'balanced',
    preview: true,
    historyDays: 30,
    reducedMotion: false,
    largeStatus: false,
  },
  deleteScope: null,
  error: null,
  announcement: '',
};

export const positioningReady = (model: Model): boolean =>
  Object.values(model.cameraQuality).every(Boolean);

export function reduce(model: Model, action: Action): Model {
  switch (action.type) {
    case 'navigate':
      return { ...model, previousScreen: model.screen, screen: action.screen, announcement: screenTitle(action.screen) };
    case 'bridge':
      return { ...model, bridgeAvailable: action.available };
    case 'busy':
      return { ...model, busy: action.value };
    case 'camera-granted':
      return {
        ...model,
        cameraAllowed: true,
        cameraName: action.name ?? model.cameraName,
        screen: 'positioning',
        announcement: 'Camera access is ready.',
      };
    case 'camera-denied':
      return { ...model, cameraAllowed: false, announcement: 'Camera access is off.' };
    case 'camera-quality':
      return { ...model, cameraQuality: { ...model.cameraQuality, ...action.quality }, cameraGuidance: action.guidance ?? model.cameraGuidance };
    case 'calibration-progress':
      return { ...model, calibrationProgress: Math.max(0, Math.min(100, action.progress)) };
    case 'calibration-restart':
      return { ...model, calibrationProgress: 0, calibrationReplacing: model.calibrationReady, calibrationCandidateReady: false, announcement: model.calibrationReady ? 'Ready to create a replacement reference.' : 'Ready to create a personal reference.' };
    case 'calibration-candidate':
      return { ...model, calibrationProgress: 100, calibrationCandidateReady: true, announcement: 'A validated replacement is ready for confirmation.' };
    case 'calibration-cancel':
      return { ...model, calibrationProgress: 0, calibrationReady: action.hasExisting, calibrationReplacing: false, calibrationCandidateReady: false, announcement: action.hasExisting ? 'The previous calibration was preserved.' : 'Calibration canceled.' };
    case 'calibration-complete':
      return {
        ...model,
        calibrationProgress: 100,
        calibrationReady: true,
        calibrationReplacing: false,
        calibrationCandidateReady: false,
        calibratedAt: action.at ?? new Date().toISOString(),
        announcement: 'Calibration ready.',
      };
    case 'notification-capability':
      return { ...model, notificationCapability: action.capability };
    case 'monitor':
      {
        const neutral = ['ready', 'finding', 'cannot-assess', 'paused', 'snoozed', 'error'].includes(action.status);
      return {
        ...model,
        monitorStatus: action.status,
        score: action.score === undefined ? model.score : action.score,
        correction: neutral ? null : action.correction === undefined ? model.correction : action.correction,
        alertVisible: action.status === 'alert' ? model.alertVisible : false,
        recoveryProgress: action.status === 'alert' ? Math.max(0, Math.min(100, action.recoveryProgress ?? model.recoveryProgress)) : action.status === 'good' ? 100 : 0,
        resetDetected: action.status === 'cooldown' ? model.resetDetected : false,
        announcement: monitorLabel(action.status),
      };
      }
    case 'alert':
      return {
        ...model,
        monitorStatus: 'alert',
        correction: action.correction ?? model.correction,
        alertVisible: true,
        recoveryProgress: 0,
        resetDetected: false,
        announcement: 'Posture check. You have moved away from your calibrated posture.',
      };
    case 'recovery-detected':
      return {
        ...model,
        monitorStatus: 'good',
        score: action.score,
        correction: action.correction ?? null,
        alertVisible: false,
        recoveryProgress: 100,
        resetDetected: true,
        announcement: 'Reset detected. You are back near your personal reference.',
      };
    case 'dismiss-alert':
      return { ...model, alertVisible: false };
    case 'snooze':
      return {
        ...model,
        monitorStatus: 'snoozed',
        alertVisible: false,
        recoveryProgress: 0,
        resetDetected: false,
        correction: null,
        snoozeMinutes: action.minutes,
        score: null,
        announcement: `Monitoring snoozed for ${action.minutes} minutes. The camera is off.`,
      };
    case 'history':
      return { ...model, history: { ...model.history, ...action.history } };
    case 'setting':
      return { ...model, settings: { ...model.settings, [action.key]: action.value } };
    case 'confirm-delete':
      return { ...model, deleteScope: action.scope };
    case 'cancel-delete':
      return { ...model, deleteScope: null };
    case 'deleted': {
      const resetHistory = action.scope === 'history' || action.scope === 'all';
      const resetCalibration = action.scope === 'calibration' || action.scope === 'all';
      return {
        ...model,
        screen: resetCalibration ? 'welcome' : model.screen,
        setupComplete: resetCalibration ? false : model.setupComplete,
        calibrationReady: resetCalibration ? false : model.calibrationReady,
        calibrationReplacing: resetCalibration ? false : model.calibrationReplacing,
        calibrationCandidateReady: resetCalibration ? false : model.calibrationCandidateReady,
        calibratedAt: resetCalibration ? null : model.calibratedAt,
        history: resetHistory ? initialModel.history : model.history,
        settings: action.scope === 'all' ? initialModel.settings : model.settings,
        monitorStatus: resetCalibration ? 'ready' : model.monitorStatus,
        deleteScope: null,
        announcement: `${deleteLabel(action.scope)} deleted.`,
      };
    }
    case 'error':
      return {
        ...model,
        previousScreen: model.screen,
        screen: 'error',
        monitorStatus: 'error',
        error: action.error,
        alertVisible: false,
        recoveryProgress: 0,
        resetDetected: false,
        correction: null,
        announcement: action.error.title,
      };
    case 'clear-error':
      return {
        ...model,
        screen: model.setupComplete ? 'ready' : 'welcome',
        monitorStatus: 'ready',
        error: null,
        announcement: 'Ready.',
      };
    case 'announce':
      return { ...model, announcement: action.message };
  }
}

export function screenTitle(screen: Screen): string {
  return {
    welcome: 'Private posture awareness',
    camera: 'Allow camera',
    positioning: 'Position your camera',
    calibration: 'Set your reference',
    notifications: 'Stay informed',
    ready: 'Ready to monitor',
    dashboard: 'Monitoring dashboard',
    correction: 'Let’s reset',
    history: 'Today',
    settings: 'Settings',
    error: 'Needs attention',
  }[screen];
}

export function monitorLabel(status: MonitorStatus): string {
  return {
    ready: 'Ready to monitor',
    finding: 'Finding you…',
    good: 'Looking good',
    changing: 'Posture is changing',
    alert: 'Time to reset',
    'cannot-assess': 'Cannot assess right now',
    cooldown: 'Monitoring during alert cooldown',
    paused: 'Monitoring paused',
    snoozed: 'Monitoring snoozed',
    error: 'Monitoring needs attention',
  }[status];
}

export function correctionText(correction: Model['correction']): string {
  return {
    'head-forward': 'If comfortable, ease your head back toward your calibrated position.',
    'head-height': 'If comfortable, raise your head slightly toward your calibrated position.',
    'head-lateral': 'If comfortable, re-center your head over your shoulders.',
    'shoulder-tilt': 'If comfortable, relax your shoulders toward your calibrated position.',
    'torso-forward': 'If comfortable, bring your torso back toward your calibrated position.',
    'torso-height': 'If comfortable, sit a little taller toward your calibrated position.',
  }[correction ?? 'head-forward'];
}

export function deleteLabel(scope: DeleteScope): string {
  return scope === 'all' ? 'All local app data' : scope === 'history' ? 'History' : 'Calibration';
}
