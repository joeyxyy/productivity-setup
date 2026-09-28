import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bell,
  BellOff,
  Check,
  Coffee,
  Droplets,
  Eye,
  FastForward,
  Footprints,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  Settings,
  SkipForward,
  Timer,
} from "lucide-react";
import "./styles.css";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type ActivityType = "sit" | "stand" | "walk";
type SessionStatus = "idle" | "running" | "paused";
type OverlayType = "eye" | "stretch" | null;
type AlarmTone = "classic" | "digital" | "bell" | "gentle";
type AlarmHandle = { stop: () => void };

type Step = {
  type: ActivityType;
  label: string;
  duration: number;
  color: string;
  icon: string;
  cue: string;
};

type Stats = {
  productive: number;
  sit: number;
  stand: number;
  walk: number;
  eye: number;
  stretch: number;
  changes: number;
  day: string;
};

type SettingsState = {
  sitMinutes: number;
  standMinutes: number;
  walkMinutes: number;
  eyeEnabled: boolean;
  stretchEnabled: boolean;
  hourlyBreakEnabled: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  alarmTone: AlarmTone;
  autoStart: boolean;
};

type SavedState = {
  status: SessionStatus;
  phaseIndex: number;
  cycleCount: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  pausedRemaining: number;
  lastTickAt: number;
  nextEyeAt: number;
  nextStretchAt: number;
  stats: Stats;
  settings: SettingsState;
};

const storageKey = "productivity-setup-v1";
const todayKey = () => new Date().toISOString().slice(0, 10);

const defaultSettings: SettingsState = {
  sitMinutes: 20,
  standMinutes: 8,
  walkMinutes: 2,
  eyeEnabled: true,
  stretchEnabled: true,
  hourlyBreakEnabled: true,
  notificationsEnabled: true,
  soundEnabled: true,
  alarmTone: "classic",
  autoStart: true,
};

const freshStats = (): Stats => ({
  productive: 0,
  sit: 0,
  stand: 0,
  walk: 0,
  eye: 0,
  stretch: 0,
  changes: 0,
  day: todayKey(),
});

const formatDuration = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
};

const formatStat = (ms: number) => {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
};

const buildRoutine = (settings: SettingsState): Step[] => [
  {
    type: "sit",
    label: "Sit & Work",
    duration: settings.sitMinutes * 60000,
    color: "#22c55e",
    icon: "●",
    cue: "Sit and focus",
  },
  {
    type: "stand",
    label: "Stand & Work",
    duration: settings.standMinutes * 60000,
    color: "#3b82f6",
    icon: "▲",
    cue: "Raise your desk",
  },
  {
    type: "walk",
    label: settings.hourlyBreakEnabled ? "Walk / Reset" : "Walk / Move",
    duration: settings.walkMinutes * 60000,
    color: "#ef4444",
    icon: "◆",
    cue: "Leave the desk and move",
  },
];

const getStepDuration = (step: Step, settings: SettingsState, cycleCount: number) => {
  if (settings.hourlyBreakEnabled && step.type === "walk" && (cycleCount + 1) % 2 === 0) {
    return 5 * 60000;
  }
  return step.duration;
};

const notificationCopy = (step: Step) => {
  if (step.type === "stand") return ["Time to stand", "Raise your desk and continue working."];
  if (step.type === "walk") return ["Movement time", "Walk around and reset your body."];
  return ["Back to work", "Sit down and begin your next focus block."];
};

const alarmTones: Record<AlarmTone, { notes: number[]; wave: OscillatorType; interval: number }> = {
  classic: { notes: [880, 660, 880, 660], wave: "square", interval: 1800 },
  digital: { notes: [1047, 1319, 1047], wave: "sawtooth", interval: 1400 },
  bell: { notes: [659, 988, 1319], wave: "sine", interval: 2200 },
  gentle: { notes: [523, 659, 784], wave: "triangle", interval: 2600 },
};

const createAlarm = (tone: AlarmTone, enabled: boolean): AlarmHandle | null => {
  if (!enabled) return null;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.setValueAtTime(0.22, context.currentTime);
  master.connect(context.destination);
  const selected = alarmTones[tone];

  const ring = () => {
    selected.notes.forEach((frequency, index) => {
      const start = context.currentTime + index * 0.2;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = selected.wave;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.85, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);

      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + 0.34);
    });
  };

  ring();
  const interval = window.setInterval(ring, selected.interval);
  return {
    stop: () => {
      window.clearInterval(interval);
      void context.close();
    },
  };
};

const initialState = (): SavedState => {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as SavedState;
      return {
        ...parsed,
        stats: parsed.stats.day === todayKey() ? parsed.stats : freshStats(),
        settings: { ...defaultSettings, ...parsed.settings },
      };
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  return {
    status: "idle",
    phaseIndex: 0,
    cycleCount: 0,
    phaseStartedAt: 0,
    phaseEndsAt: 0,
    pausedRemaining: 0,
    lastTickAt: Date.now(),
    nextEyeAt: Date.now() + 20 * 60000,
    nextStretchAt: Date.now() + 2 * 60 * 60000,
    stats: freshStats(),
    settings: defaultSettings,
  };
};

function advanceToNow(state: SavedState, routine: Step[], now: number): SavedState {
  if (state.status !== "running" || !state.phaseEndsAt) return state;

  let next = { ...state };
  const elapsed = Math.max(0, now - next.lastTickAt);
  const currentType = routine[next.phaseIndex]?.type ?? "sit";
  next.stats = {
    ...next.stats,
    productive: next.stats.productive + elapsed,
    [currentType]: next.stats[currentType] + elapsed,
  };
  next.lastTickAt = now;

  while (now >= next.phaseEndsAt) {
    const wrapped = next.phaseIndex === routine.length - 1;
    next.phaseIndex = (next.phaseIndex + 1) % routine.length;
    next.cycleCount = wrapped ? next.cycleCount + 1 : next.cycleCount;
    next.phaseStartedAt = next.phaseEndsAt;
    next.phaseEndsAt =
      next.phaseStartedAt + getStepDuration(routine[next.phaseIndex], next.settings, next.cycleCount);
    next.stats = { ...next.stats, changes: next.stats.changes + 1 };
  }

  return next;
}

function App() {
  const [state, setState] = useState<SavedState>(initialState);
  const [now, setNow] = useState(Date.now());
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayRemaining, setOverlayRemaining] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [lastNotifiedPhase, setLastNotifiedPhase] = useState(-1);
  const [alarmActive, setAlarmActive] = useState(false);
  const alarmRef = useRef<AlarmHandle | null>(null);

  const routine = useMemo(() => buildRoutine(state.settings), [state.settings]);
  const current = routine[state.phaseIndex] ?? routine[0];
  const nextStep = routine[(state.phaseIndex + 1) % routine.length];
  const currentDuration = getStepDuration(current, state.settings, state.cycleCount);
  const nextCycleCount = state.phaseIndex === routine.length - 1 ? state.cycleCount + 1 : state.cycleCount;
  const nextDuration = getStepDuration(nextStep, state.settings, nextCycleCount);
  const cycleDuration = routine.reduce((sum, step) => sum + step.duration, 0);
  const remaining = state.status === "paused" ? state.pausedRemaining : state.phaseEndsAt - now;
  const phaseProgress = state.status === "idle" ? 0 : 1 - Math.max(0, remaining) / currentDuration;
  const cycleElapsed =
    routine.slice(0, state.phaseIndex).reduce((sum, step) => sum + step.duration, 0) +
    Math.max(0, current.duration - Math.max(0, remaining));

  const stopAlarm = () => {
    alarmRef.current?.stop();
    alarmRef.current = null;
    setAlarmActive(false);
  };

  const startAlarm = () => {
    stopAlarm();
    const alarm = createAlarm(state.settings.alarmTone, state.settings.soundEnabled);
    if (alarm) {
      alarmRef.current = alarm;
      setAlarmActive(true);
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearInterval(id);
      alarmRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    setState((currentState) => advanceToNow(currentState, routine, now));
  }, [now, routine]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (state.status !== "running") return;
    if (state.settings.eyeEnabled && now >= state.nextEyeAt && overlay === null) {
      setOverlay("eye");
      setOverlayRemaining(20000);
      startAlarm();
    }
    if (state.settings.stretchEnabled && now >= state.nextStretchAt && overlay === null) {
      setOverlay("stretch");
      setOverlayRemaining(120000);
      startAlarm();
    }
  }, [now, overlay, state]);

  useEffect(() => {
    if (!overlay) return;
    const id = window.setInterval(() => {
      setOverlayRemaining((value) => {
        if (value <= 1000) {
          finishOverlay(true);
          return 0;
        }
        return value - 1000;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [overlay]);

  useEffect(() => {
    if (state.status !== "running" || state.phaseIndex === lastNotifiedPhase) return;
    setLastNotifiedPhase(state.phaseIndex);
    notifyTransition(current);
  }, [current, lastNotifiedPhase, state.phaseIndex, state.status]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT" || target?.tagName === "TEXTAREA") return;
      if (event.key === " ") {
        event.preventDefault();
        togglePause();
      }
      if (event.key.toLowerCase() === "s") skipPhase();
      if (event.key === "+" || event.key === "=") extendPhase(5);
      if (event.key === "Escape") {
        stopAlarm();
        setOverlay(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const requestNotifications = async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  };

  const notifyTransition = (step: Step) => {
    startAlarm();
    if (!state.settings.notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    const [title, body] = notificationCopy(step);
    new Notification(title, { body, icon: "/icon.svg" });
  };

  const startSession = async () => {
    await requestNotifications();
    const start = Date.now();
    setState((value) => ({
      ...value,
      status: "running",
      phaseIndex: 0,
      cycleCount: 0,
      phaseStartedAt: start,
      phaseEndsAt: start + getStepDuration(routine[0], value.settings, 0),
      lastTickAt: start,
      nextEyeAt: start + 20 * 60000,
      nextStretchAt: start + 2 * 60 * 60000,
    }));
    setLastNotifiedPhase(0);
  };

  const togglePause = () => {
    stopAlarm();
    setState((value) => {
      if (value.status === "idle") return value;
      if (value.status === "paused") {
        const resumed = Date.now();
        return {
          ...value,
          status: "running",
          phaseStartedAt: resumed - (currentDuration - value.pausedRemaining),
          phaseEndsAt: resumed + value.pausedRemaining,
          lastTickAt: resumed,
        };
      }
      return {
        ...advanceToNow(value, routine, Date.now()),
        status: "paused",
        pausedRemaining: Math.max(0, value.phaseEndsAt - Date.now()),
      };
    });
  };

  const skipPhase = () => {
    stopAlarm();
    const time = Date.now();
    setState((value) => ({
      ...advanceToNow(value, routine, time),
      status: value.status === "idle" ? "idle" : "running",
      phaseIndex: (value.phaseIndex + 1) % routine.length,
      cycleCount: value.phaseIndex === routine.length - 1 ? value.cycleCount + 1 : value.cycleCount,
      phaseStartedAt: time,
      phaseEndsAt:
        time +
        getStepDuration(
          routine[(value.phaseIndex + 1) % routine.length],
          value.settings,
          value.phaseIndex === routine.length - 1 ? value.cycleCount + 1 : value.cycleCount,
        ),
      lastTickAt: time,
      stats: { ...advanceToNow(value, routine, time).stats, changes: advanceToNow(value, routine, time).stats.changes + 1 },
    }));
  };

  const extendPhase = (minutes: number) => {
    setState((value) => ({
      ...value,
      phaseEndsAt: value.phaseEndsAt + minutes * 60000,
      pausedRemaining: value.status === "paused" ? value.pausedRemaining + minutes * 60000 : value.pausedRemaining,
    }));
  };

  const resetSession = () => {
    stopAlarm();
    const time = Date.now();
    setState((value) => ({
      ...value,
      status: "idle",
      phaseIndex: 0,
      cycleCount: 0,
      phaseStartedAt: 0,
      phaseEndsAt: 0,
      pausedRemaining: 0,
      lastTickAt: time,
    }));
    setOverlay(null);
  };

  const finishSession = () => resetSession();

  const finishOverlay = (done: boolean) => {
    stopAlarm();
    const time = Date.now();
    setState((value) => ({
      ...value,
      nextEyeAt: overlay === "eye" ? time + 20 * 60000 : value.nextEyeAt,
      nextStretchAt: overlay === "stretch" ? time + 2 * 60 * 60000 : value.nextStretchAt,
      stats: {
        ...value.stats,
        eye: overlay === "eye" && done ? value.stats.eye + 1 : value.stats.eye,
        stretch: overlay === "stretch" && done ? value.stats.stretch + 1 : value.stats.stretch,
      },
    }));
    setOverlay(null);
  };

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    if (key === "soundEnabled" && value === false) stopAlarm();
    setState((currentState) => ({ ...currentState, settings: { ...currentState.settings, [key]: value } }));
  };

  const ring = makeRing(routine, cycleElapsed, cycleDuration);

  return (
    <main className="app" style={{ "--accent": current.color } as React.CSSProperties}>
      <section className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Productivity Setup</p>
            <h1>{state.status === "idle" ? "Ready to start?" : current.label}</h1>
          </div>
          <button className="icon-button" onClick={() => setShowSettings((value) => !value)} aria-label="Settings">
            <Settings size={21} />
          </button>
        </header>

        <section className="hero">
          <div className="timer-card" aria-live="polite">
            <svg className="cycle-ring" viewBox="0 0 260 260" role="img" aria-label="Sit, stand, and walk cycle">
              <circle className="track" cx="130" cy="130" r="112" />
              {ring.segments.map((segment) => (
                <circle
                  key={segment.key}
                  className="segment"
                  cx="130"
                  cy="130"
                  r="112"
                  stroke={segment.color}
                  strokeDasharray={`${segment.length} ${ring.circumference - segment.length}`}
                  strokeDashoffset={segment.offset}
                />
              ))}
              <circle
                className="position"
                cx="130"
                cy="18"
                r="7"
                transform={`rotate(${ring.angle} 130 130)`}
              />
            </svg>
            <div className="timer-center">
              <span className="state-icon" aria-hidden="true">
                {current.icon}
              </span>
              <strong>{state.status === "idle" ? "Balanced Desk" : current.label}</strong>
              <span className="time">{state.status === "idle" ? "20 / 8 / 2" : formatDuration(remaining)}</span>
              <small>{state.status === "paused" ? "paused" : state.status === "idle" ? "Sit • Stand • Move" : "remaining"}</small>
            </div>
          </div>

          <div className="next-line">
            <span>Next</span>
            <strong>
              {nextStep.label} • {Math.round(nextStep.duration / 60000)} min
              {nextDuration !== nextStep.duration ? " recovery" : ""}
            </strong>
          </div>

          <div className="phase-progress" aria-label={`${Math.round(phaseProgress * 100)} percent through current phase`}>
            <span style={{ width: `${Math.min(100, Math.max(0, phaseProgress * 100))}%` }} />
          </div>

          {alarmActive && (
            <div className="alarm-banner" role="alert">
              <Bell size={19} />
              <strong>Alarm ringing</strong>
              <button onClick={stopAlarm}>
                <BellOff size={18} /> Stop alarm
              </button>
            </div>
          )}

          <div className="controls">
            {state.status === "idle" ? (
              <button className="primary" onClick={startSession}>
                <Play size={18} /> Start Session
              </button>
            ) : (
              <button className="primary" onClick={togglePause}>
                {state.status === "paused" ? <Play size={18} /> : <Pause size={18} />}
                {state.status === "paused" ? "Resume" : "Pause"}
              </button>
            )}
            <button onClick={skipPhase} disabled={state.status === "idle"}>
              <SkipForward size={18} /> Skip
            </button>
            <button onClick={() => extendPhase(5)} disabled={state.status === "idle"}>
              <FastForward size={18} /> +5 min
            </button>
            <button onClick={resetSession}>
              <RotateCcw size={18} /> Reset
            </button>
          </div>

          <button className="finish" onClick={finishSession} disabled={state.status === "idle"}>
            Finish Session
          </button>
        </section>

        <aside className="side">
          {showSettings ? (
            <SettingsPanel
              settings={state.settings}
              updateSetting={updateSetting}
              requestNotifications={requestNotifications}
              testAlarm={startAlarm}
              stopAlarm={stopAlarm}
              alarmActive={alarmActive}
            />
          ) : (
            <Dashboard stats={state.stats} />
          )}
        </aside>
      </section>

      <section className="quick-adjust" aria-label="Quick adjustment">
        <strong>{current.label}</strong>
        <div>
          <button onClick={() => extendPhase(-5)} disabled={state.status === "idle"}>
            -5 min
          </button>
          <button onClick={() => extendPhase(5)} disabled={state.status === "idle"}>
            +5 min
          </button>
          <button onClick={skipPhase} disabled={state.status === "idle"}>
            Skip
          </button>
        </div>
      </section>

      {overlay && (
        <Overlay
          type={overlay}
          remaining={overlayRemaining}
          onDone={() => finishOverlay(true)}
          onSkip={() => finishOverlay(false)}
          onSnooze={() => {
            const time = Date.now();
            setState((value) => ({ ...value, nextEyeAt: time + 2 * 60000 }));
            stopAlarm();
            setOverlay(null);
          }}
        />
      )}
    </main>
  );
}

function makeRing(routine: Step[], cycleElapsed: number, cycleDuration: number) {
  const circumference = 2 * Math.PI * 112;
  let cursor = 0;
  const segments = routine.map((step) => {
    const length = (step.duration / cycleDuration) * circumference;
    const segment = {
      key: step.type,
      color: step.color,
      length,
      offset: -cursor,
    };
    cursor += length;
    return segment;
  });
  return {
    circumference,
    segments,
    angle: (cycleElapsed / cycleDuration) * 360,
  };
}

function Dashboard({ stats }: { stats: Stats }) {
  return (
    <section className="panel">
      <h2>Today</h2>
      <div className="stat-grid">
        <Stat icon={<Timer />} label="Productive" value={formatStat(stats.productive)} />
        <Stat icon={<Coffee />} label="Sitting" value={formatStat(stats.sit)} />
        <Stat icon={<Bell />} label="Standing" value={formatStat(stats.stand)} />
        <Stat icon={<Footprints />} label="Moving" value={formatStat(stats.walk)} />
        <Stat icon={<Eye />} label="Eye breaks" value={`${stats.eye}`} />
        <Stat icon={<RefreshCcw />} label="Changes" value={`${stats.changes}`} />
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SettingsPanel({
  settings,
  updateSetting,
  requestNotifications,
  testAlarm,
  stopAlarm,
  alarmActive,
}: {
  settings: SettingsState;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  requestNotifications: () => Promise<void>;
  testAlarm: () => void;
  stopAlarm: () => void;
  alarmActive: boolean;
}) {
  return (
    <section className="panel settings-panel">
      <h2>Routine</h2>
      <label>
        Sit
        <input min="1" max="90" type="number" value={settings.sitMinutes} onChange={(e) => updateSetting("sitMinutes", Number(e.target.value))} />
      </label>
      <label>
        Stand
        <input min="1" max="90" type="number" value={settings.standMinutes} onChange={(e) => updateSetting("standMinutes", Number(e.target.value))} />
      </label>
      <label>
        Walk
        <input min="1" max="30" type="number" value={settings.walkMinutes} onChange={(e) => updateSetting("walkMinutes", Number(e.target.value))} />
      </label>
      <h2>Reminders</h2>
      <Toggle label="Eye reminders" checked={settings.eyeEnabled} onChange={(value) => updateSetting("eyeEnabled", value)} />
      <Toggle label="Stretch reminders" checked={settings.stretchEnabled} onChange={(value) => updateSetting("stretchEnabled", value)} />
      <Toggle label="Hourly recovery" checked={settings.hourlyBreakEnabled} onChange={(value) => updateSetting("hourlyBreakEnabled", value)} />
      <Toggle label="Notifications" checked={settings.notificationsEnabled} onChange={(value) => updateSetting("notificationsEnabled", value)} />
      <Toggle label="Sound" checked={settings.soundEnabled} onChange={(value) => updateSetting("soundEnabled", value)} />
      <label>
        Alarm tone
        <select value={settings.alarmTone} onChange={(event) => updateSetting("alarmTone", event.target.value as AlarmTone)}>
          <option value="classic">Classic</option>
          <option value="digital">Digital</option>
          <option value="bell">Bell</option>
          <option value="gentle">Gentle</option>
        </select>
      </label>
      <Toggle label="Auto-start next" checked={settings.autoStart} onChange={(value) => updateSetting("autoStart", value)} />
      <button className="wide" onClick={alarmActive ? stopAlarm : testAlarm} disabled={!settings.soundEnabled}>
        {alarmActive ? <BellOff size={18} /> : <Bell size={18} />}
        {alarmActive ? "Stop alarm" : "Test selected tone"}
      </button>
      <button className="wide" onClick={requestNotifications}>
        <Bell size={18} /> Enable Notifications
      </button>
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Overlay({
  type,
  remaining,
  onDone,
  onSkip,
  onSnooze,
}: {
  type: OverlayType;
  remaining: number;
  onDone: () => void;
  onSkip: () => void;
  onSnooze: () => void;
}) {
  const isEye = type === "eye";
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <section className="overlay-panel">
        {isEye ? <Eye size={42} /> : <Droplets size={42} />}
        <h2>{isEye ? "Eye Break" : "Stretch"}</h2>
        <p>{isEye ? "Look about 20 feet away." : "Take two minutes for neck, shoulder, wrist, or back mobility."}</p>
        <strong>{formatDuration(remaining)}</strong>
        <div className="overlay-actions">
          <button className="primary" onClick={onDone}>
            <Check size={18} /> Done
          </button>
          {isEye && <button onClick={onSnooze}>Snooze 2 min</button>}
          <button onClick={onSkip}>Skip</button>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
