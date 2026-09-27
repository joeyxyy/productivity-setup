# Productivity Setup

Productivity Setup is a responsive desk-health timer that tells you what to do right now:

**Sit -> Stand -> Walk -> repeat**

It is designed for people who want the benefits of frequent movement without having to babysit a timer. Open the app, press **Start Session**, and it guides the rest of the loop.

## What It Does

- Shows a large circular visualization of the whole Sit, Stand, Walk cycle.
- Starts with the default **Balanced Desk** routine: 20 minutes sitting, 8 minutes standing, 2 minutes moving.
- Uses clear activity states with text, color, and symbols.
- Keeps time from real timestamps instead of trusting `setInterval`, so refreshes, sleep, and backgrounding do not simply freeze the schedule.
- Supports pause, skip, reset, finish session, and quick +/- 5 minute adjustments.
- Shows eye-break and stretch overlays without resetting the main sit/stand/walk cycle.
- Replaces every second movement break with a 5-minute recovery break when hourly recovery is enabled.
- Tracks simple daily stats locally: productive time, sitting, standing, moving, eye breaks, and position changes.
- Saves settings and session state in local storage.
- Includes notification permission flow for browser notifications.
- Ships as an installable web app via a web app manifest.

## How It Works

The timer stores phase timestamps rather than decrementing a counter:

```ts
phase_started_at
phase_ends_at
current_phase
session_status
```

Each render calculates remaining time from:

```ts
phaseEndTimestamp - Date.now()
```

That means the app can recover correctly when the browser refreshes, the computer sleeps, or the tab is left in the background. When the app wakes up, it advances through any phases that should have already finished.

## Default Routine

| Phase | Duration | Purpose |
| --- | ---: | --- |
| Sit & Work | 20 min | Focus while seated |
| Stand & Work | 8 min | Raise your desk and keep working |
| Walk / Move | 2 min | Leave the desk and move |

When hourly recovery is enabled, every second movement break becomes a 5-minute reset.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| Space | Pause or resume |
| S | Skip current phase |
| + | Add 5 minutes |
| Esc | Close reminder overlay |

Shortcuts are ignored while typing in inputs.

## Tech Stack

- React
- TypeScript
- Vite
- CSS
- Lucide React icons
- Browser local storage
- Web Notifications API
- Web App Manifest
- Electron for desktop packaging

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Create a downloadable production package:

```bash
npm run package
```

That creates `release/productivity-setup-web.zip`. The zip contains the built `dist` folder plus a short run note. To use it, unzip it and serve `dist` with any static web server, for example:

```bash
npx serve dist
```

GitHub also provides a source download from **Code -> Download ZIP**, but that source zip still needs `npm install` and `npm run build`.

## Desktop App

Run the desktop app locally:

```bash
npm run desktop
```

Create a Windows desktop app folder:

```bash
npm run desktop:pack
```

Build outputs go to `desktop-app-build`. Open the generated folder and double-click `Productivity Setup.exe`.

Create a full Windows installer:

```bash
npm run desktop:dist
```

## Project Structure

```txt
src/
  main.tsx      App, timer engine, controls, reminders, settings, stats
  styles.css    Responsive interface styles
scripts/
  package-web.mjs  Creates the downloadable production zip
electron/
  main.cjs     Desktop app entrypoint
public/
  sw.js        PWA offline cache
  manifest.webmanifest
```

## Current Status

This is an MVP. It intentionally keeps the product simple:

- No account required.
- No backend required.
- No cloud sync yet.
- No mobile native packaging yet.

Future versions could add Supabase sync, Capacitor mobile builds, weekly analytics, calendar integrations, wearables, and smart scheduling.

## License

MIT
