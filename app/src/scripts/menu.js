'use strict';

/**
 * Menu — main menu submenu controllers.
 * Handles dynamic population and event wiring for all submenus.
 * Depends on: Utils, State (via window globals), navigate (renderer.js).
 */
(function () {

  // ── Shared ─────────────────────────────────────────────────────────────────

  // Settings are embedded in the renderer config at startup (already loaded
  // from settings.json by main.js before the window is created).
  let _settings = { ...(window.config?.userSettings ?? {}) };

  // ── Battle submenu ─────────────────────────────────────────────────────────

  function populateBattleSubmenu() {
    const sel   = document.getElementById('battle-team-select');
    const teams = window.State?.getTeams() ?? [];
    sel.innerHTML = teams.length
      ? teams.map(t =>
          `<option value="${Utils.esc(t.id)}">${Utils.esc(t.name)}</option>`
        ).join('')
      : '<option value="">— No saved teams —</option>';
  }

  const $timerSlider  = document.getElementById('battle-timer-slider');
  const $timerDisplay = document.getElementById('battle-timer-display');

  $timerSlider?.addEventListener('input', function () {
    const v = parseInt(this.value, 10);
    $timerDisplay.textContent = v === 0 ? 'Disabled' : `${v}s`;
  });

  document.getElementById('btn-start-battle')?.addEventListener('click', () => {
    const teamId    = document.getElementById('battle-team-select')?.value ?? null;
    const timerSecs = parseInt($timerSlider?.value ?? '0', 10);
    window.closeAllSubmenus?.();
    window.navigate('view-battle', { teamId, timerSecs });
  });

  // ── Settings submenu ───────────────────────────────────────────────────────

  const $resolutionSel = document.getElementById('settings-resolution');
  const $fullscreenChk = document.getElementById('settings-fullscreen');
  const $hwaccelChk    = document.getElementById('settings-hwaccel');

  function populateSettingsSubmenu() {
    const presets = window.config?.resolutions ?? [];
    $resolutionSel.innerHTML = presets
      .map(r => {
        const sel = r.id === _settings.resolutionId ? ' selected' : '';
        return `<option value="${Utils.esc(r.id)}"${sel}>${Utils.esc(r.label)}</option>`;
      })
      .join('');

    $fullscreenChk.checked = !!_settings.fullscreen;
    $hwaccelChk.checked    = _settings.hardwareAcceleration !== false;
  }

  document.getElementById('btn-apply-settings')?.addEventListener('click', () => {
    const resId      = $resolutionSel.value;
    const fullscreen = $fullscreenChk.checked;
    const hwaccel    = $hwaccelChk.checked;

    _settings = { ..._settings, resolutionId: resId, fullscreen, hardwareAcceleration: hwaccel };
    window.api?.saveSettings?.(_settings);

    const preset = (window.config?.resolutions ?? []).find(r => r.id === resId);
    if (preset) {
      window.api?.setResolution?.({ width: preset.width, height: preset.height, fullscreen });
    }

    window.closeAllSubmenus?.();
  });

  // ── Register hooks with renderer ───────────────────────────────────────────

  window.SUBMENU_ON_OPEN_HANDLERS = window.SUBMENU_ON_OPEN_HANDLERS ?? {};
  window.SUBMENU_ON_OPEN_HANDLERS['submenu-play']     = populateBattleSubmenu;
  window.SUBMENU_ON_OPEN_HANDLERS['submenu-settings'] = populateSettingsSubmenu;

})();
