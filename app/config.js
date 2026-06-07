/**
 * Golemental Arena — Application Configuration
 *
 * All tunable values are gathered here. Edit freely; main.js and preload.js
 * read this file at startup. Renderer-safe values are forwarded via the
 * contextBridge and exposed as window.config in the renderer process.
 */

module.exports = {

  // ─────────────────────────────────────────────────────────────────────────
  // WINDOW
  // ─────────────────────────────────────────────────────────────────────────
  window: {
    width:            1280,
    height:            720,
    minWidth:          900,
    minHeight:         600,
    resizable:        false,
    fullscreen:       false,   // start in fullscreen
    fullscreenable:   true,    // allow the user to fullscreen the window
    maximizable:      false,
    minimizable:      true,
    frame:            true,    // false = frameless / borderless window
    transparent:      false,   // requires frame: false on most platforms
    alwaysOnTop:      false,
    // 'default' | 'hidden' | 'hiddenInset' (macOS only; ignored on Windows)
    titleBarStyle:    'default',
    // Background fills the window before HTML paints — prevents white flash
    backgroundColor: '#0a0a12',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // RESOLUTION PRESETS
  // The renderer exposes these to the Settings submenu.
  // The 'id' field is stored in user settings so it survives config changes.
  // ─────────────────────────────────────────────────────────────────────────
  resolutions: [
    { id: '900x600',   label: '900 × 600  (Min)',    width:  900, height:  600 },
    { id: '1024x640',  label: '1024 × 640',          width: 1024, height:  640 },
    { id: '1280x720',  label: '1280 × 720  (HD)',    width: 1280, height:  720 },
    { id: '1366x768',  label: '1366 × 768  (WXGA)',  width: 1366, height:  768 },
    { id: '1600x900',  label: '1600 × 900',          width: 1600, height:  900 },
    { id: '1920x1080', label: '1920 × 1080 (FHD)',   width: 1920, height: 1080 },
  ],

  // ─────────────────────────────────────────────────────────────────────────
  // SECURITY
  // contextIsolation ON + nodeIntegration OFF is the Electron-recommended
  // baseline. Deviate only if you know why.
  // ─────────────────────────────────────────────────────────────────────────
  security: {
    contextIsolation:             true,   // keeps renderer JS sandboxed  ✓
    nodeIntegration:              false,  // no Node APIs in renderer      ✓
    sandbox:                      true,   // OS-level renderer sandbox     ✓
    webSecurity:                  true,   // enforces same-origin policy   ✓
    allowRunningInsecureContent:  false,
    // Open DevTools automatically on launch (flip to false for release)
    openDevTools:                 true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PERFORMANCE
  // ─────────────────────────────────────────────────────────────────────────
  performance: {
    // Disable if you hit GPU driver issues; costs some render performance
    hardwareAcceleration:  true,
    // Reduce CPU/GPU usage when the window is in the background
    backgroundThrottling:  true,
    // V8 bytecode caching strategy
    // 'none' | 'code' | 'bypassHeatCheck' | 'bypassHeatCheckAndSkipSourceMap'
    v8CacheOptions:        'bypassHeatCheck',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // APP BEHAVIOUR
  // ─────────────────────────────────────────────────────────────────────────
  app: {
    // Prevent launching a second instance; focuses existing window instead
    singleInstance:   true,
    // Hide the native menu bar (Alt still reveals it on Windows)
    autoHideMenuBar:  true,
    // Active UI language — must match an id defined in element/archetype files
    // 'en' | 'es' | 'fr' | 'de'
    language:         'en',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GAME RULES
  // Core mechanical constants. Changing these affects balance significantly.
  // ─────────────────────────────────────────────────────────────────────────
  game: {
    // Golems per team
    teamSize:          3,
    // Fixed HP for every Golem (no stat variation at this stage)
    baseHp:            100,
    // Number of copies of each element card available in the bay
    // Scales with teamSize if you change it — adjust together.
    bayStackSize:      2,
    // Action Points available to each Golem per round
    apPerGolem:        10,
    // Cards drawn into hand at the start of each round
    handSize:          5,
    // Weight applied to the Passive element's effectiveness score (0–1)
    // 0 = Passive has no effect; 1 = Passive equals Dominant
    passiveWeight:     0.33,

    // Element effectiveness score → damage multiplier mapping
    // Scores range from -2 to +2 (per the 2-paradoxical matrix)
    effectiveness: {
      '-2': 0.50,
      '-1': 0.75,
       '0': 1.00,
       '1': 1.25,
       '2': 1.50,
    },

    // Action tiers: base multiplier and AP cost
    // These must remain consistent with wiki/Gameplay.md
    actions: {
      quick:    { multiplier: 0.875, cost: 3  },
      standard: { multiplier: 1.000, cost: 5  },
      charged:  { multiplier: 1.125, cost: 7  },
      focused:  { multiplier: 1.250, cost: 10 },
    },

    // Time each player has to submit their round choices (ms). 0 = no limit.
    roundTimeLimitMs:  60000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIO
  // ─────────────────────────────────────────────────────────────────────────
  audio: {
    enabled:        true,
    masterVolume:   0.80,   // 0.0 – 1.0
    musicVolume:    0.50,
    sfxVolume:      0.80,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DEBUG / DEVELOPMENT
  // ─────────────────────────────────────────────────────────────────────────
  dev: {
    // Overlay showing current FPS in the corner of the screen
    showFps:   false,
    // Console verbosity: 'error' | 'warn' | 'info' | 'debug'
    logLevel:  'warn',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // USER SETTINGS DEFAULTS
  // These are the fallback values used when no settings.json exists.
  // The user can override them via the in-app Settings menu.
  // Stored in: <userData>/settings.json
  // ─────────────────────────────────────────────────────────────────────────
  userSettingsDefaults: {
    resolutionId:          '1280x720',
    fullscreen:            false,
    hardwareAcceleration:  true,
  },

};
