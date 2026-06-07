// Cross-platform Electron launcher.
// Sets Linux-specific env vars before spawning Electron so GTK/GLib
// picks them up at process start (too late to set them inside main.js).
const { spawnSync } = require('child_process');
const electron      = require('electron');

const env = { ...process.env };

if (process.platform === 'linux') {
  // Prevent GTK from querying GSettings keys removed in GNOME 47+.
  // The VS Code snap injects an old schema into XDG_DATA_DIRS that
  // lacks font-antialiasing; pinning to the system schema dir fixes it.
  env.GSETTINGS_BACKEND    = 'memory';
  env.GSETTINGS_SCHEMA_DIR = '/usr/share/glib-2.0/schemas';
}

const args   = ['.', ...process.argv.slice(2)];
const result = spawnSync(String(electron), args, {
  env,
  cwd:   __dirname,
  stdio: 'inherit',
});

if (result.error) {
  console.error('Failed to launch Electron:', result.error);
  process.exit(1);
}
process.exit(result.status ?? 0);
