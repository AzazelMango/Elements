const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const cfg  = require('./config');

// ── Persistence helpers ────────────────────────────────────────────────────
function teamsFilePath() {
  return path.join(app.getPath('userData'), 'teams.json');
}

function readTeamsSync() {
  try {
    const raw  = fs.readFileSync(teamsFilePath(), 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return { teams: data, primaryTeamId: null }; // back-compat
    return { teams: Array.isArray(data.teams) ? data.teams : [], primaryTeamId: data.primaryTeamId ?? null };
  } catch {
    return { teams: [], primaryTeamId: null };
  }
}

function writeTeamsSync(data) {
  fs.writeFileSync(teamsFilePath(), JSON.stringify(data), 'utf8');
}

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettingsSync() {
  try {
    return { ...cfg.userSettingsDefaults, ...JSON.parse(fs.readFileSync(settingsFilePath(), 'utf8')) };
  } catch {
    return { ...cfg.userSettingsDefaults };
  }
}

function writeSettingsSync(settings) {
  fs.writeFileSync(settingsFilePath(), JSON.stringify(settings), 'utf8');
}

// Read once at startup — used by createWindow() and hardware-accel flag below.
const _savedSettings = readSettingsSync();

// Resolve saved resolution preset → { width, height }; fall back to config defaults.
function _savedWindowSize() {
  const preset = (cfg.resolutions ?? []).find(r => r.id === _savedSettings.resolutionId);
  return preset
    ? { width: preset.width, height: preset.height }
    : { width: cfg.window.width, height: cfg.window.height };
}

// ── Performance flags (must be set before app ready) ──────────────────────
// Honour the user's saved preference; fall back to config.
const _hwAccel = _savedSettings.hardwareAcceleration !== false
  ? cfg.performance.hardwareAcceleration
  : false;
if (!_hwAccel) {
  app.disableHardwareAcceleration();
}

// Font rendering — improves antialiasing on Linux/Wayland
app.commandLine.appendSwitch('font-render-hinting', 'full');

// ── Single-instance lock ───────────────────────────────────────────────────
if (cfg.app.singleInstance) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

let mainWindow;

function createWindow() {
  const { width, height } = _savedWindowSize();
  const fullscreen = !!_savedSettings.fullscreen;

  mainWindow = new BrowserWindow({
    // Window dimensions & behaviour
    width,
    height,
    minWidth:        cfg.window.minWidth,
    minHeight:       cfg.window.minHeight,
    resizable:       cfg.window.resizable,
    fullscreen,
    fullscreenable:  cfg.window.fullscreenable,
    maximizable:     cfg.window.maximizable,
    minimizable:     cfg.window.minimizable,
    frame:           cfg.window.frame,
    transparent:     cfg.window.transparent,
    alwaysOnTop:     cfg.window.alwaysOnTop,
    titleBarStyle:   cfg.window.titleBarStyle,
    backgroundColor: cfg.window.backgroundColor,
    autoHideMenuBar: cfg.app.autoHideMenuBar,
    title:           'Golemental Arena',
    // Start hidden — show after content is ready to avoid white flash
    show: false,

    webPreferences: {
      preload:                    path.join(__dirname, 'src', 'preload.js'),
      contextIsolation:           cfg.security.contextIsolation,
      nodeIntegration:            cfg.security.nodeIntegration,
      sandbox:                    cfg.security.sandbox,
      webSecurity:                cfg.security.webSecurity,
      allowRunningInsecureContent: cfg.security.allowRunningInsecureContent,
      backgroundThrottling:       cfg.performance.backgroundThrottling,
      v8CacheOptions:             cfg.performance.v8CacheOptions,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Show once the first frame is painted — no white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (cfg.security.openDevTools) {
      mainWindow.webContents.openDevTools();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('quit-app', () => app.quit());

// Synchronously return the renderer-safe config slice.
ipcMain.on('get-renderer-config', (event) => {
  event.returnValue = {
    language:      cfg.app.language,
    game:          cfg.game,
    audio:         cfg.audio,
    dev:           cfg.dev,
    resolutions:   cfg.resolutions,
    userSettings:  _savedSettings,   // renderer reads this instead of calling settings:load at startup
  };
});

// Team persistence
ipcMain.on('teams:load', (event) => {
  event.returnValue = readTeamsSync();
});

ipcMain.on('teams:save', (event, data) => {
  try {
    writeTeamsSync(data);
    event.returnValue = { ok: true };
  } catch (err) {
    event.returnValue = { ok: false, error: err.message };
  }
});

// User settings persistence
ipcMain.on('settings:load', (event) => {
  event.returnValue = readSettingsSync();
});

ipcMain.on('settings:save', (event, settings) => {
  try {
    writeSettingsSync(settings);
    event.returnValue = { ok: true };
  } catch (err) {
    event.returnValue = { ok: false, error: err.message };
  }
});

// Apply resolution at runtime (no restart needed)
ipcMain.on('window:setResolution', (event, { width, height, fullscreen }) => {
  if (!mainWindow) { event.returnValue = { ok: false }; return; }
  if (fullscreen) {
    mainWindow.setFullScreen(true);
  } else {
    mainWindow.setFullScreen(false);
    mainWindow.setSize(width, height, true);
    mainWindow.center();
  }
  event.returnValue = { ok: true };
});
