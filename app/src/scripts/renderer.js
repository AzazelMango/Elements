'use strict';

// ── View navigation ─────────────────────────────────────────────────────────

const VIEW_ON_ENTER = {
  'view-builder': ()         => window.Builder && window.Builder.init(),
  'view-battle':  (settings) => window.Battle  && window.Battle.init(settings),
};

const VIEW_ON_LEAVE = {
  'view-battle': () => window.Battle && window.Battle.stop(),
};

function navigate(viewId, params) {
  const current = document.querySelector('.view.active');
  if (current && VIEW_ON_LEAVE[current.id]) VIEW_ON_LEAVE[current.id]();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  if (VIEW_ON_ENTER[viewId]) VIEW_ON_ENTER[viewId](params);
}

window.navigate = navigate;

document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});

document.getElementById('btn-quit').addEventListener('click', () => window.api.quit());

// ── Confirm modal ────────────────────────────────────────────────────────────
// Returns a Promise that resolves to the `value` of whichever button is clicked.
// buttons: Array<{ label: string, value: any, cls?: string }>

function showConfirm({ title, body, buttons }) {
  return new Promise(resolve => {
    const overlay    = document.getElementById('app-modal');
    const titleEl    = document.getElementById('modal-title');
    const bodyEl     = document.getElementById('modal-body');
    const actionsEl  = document.getElementById('modal-actions');

    titleEl.textContent   = title ?? '';
    bodyEl.textContent    = body  ?? '';
    actionsEl.innerHTML   = '';

    buttons.forEach(({ label, value, cls }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.className   = cls ?? 'btn-sm';
      btn.addEventListener('click', () => {
        overlay.hidden = true;
        resolve(value);
      });
      actionsEl.appendChild(btn);
    });

    overlay.hidden = false;
  });
}

window.showConfirm = showConfirm;

// ── Guarded back-button: Builder ─────────────────────────────────────────────

document.getElementById('btn-builder-back')?.addEventListener('click', async () => {
  const draft = window.State?.getDraft();

  if (draft && window.State?.isDraftDirty?.()) {
    const action = await showConfirm({
      title:   'Unsaved Changes',
      body:    'You have unsaved changes to this team.',
      buttons: [
        { label: 'Save & Exit',    value: 'save',    cls: 'btn-primary' },
        { label: 'Discard & Exit', value: 'discard', cls: 'btn-danger'  },
        { label: 'Cancel',         value: 'cancel',  cls: 'btn-sm'      },
      ],
    });
    if (action === 'cancel') return;
    if (action === 'save') {
      window.State.saveDraft();
    } else {
      // Revert: if team exists in saved list reload it; otherwise just clear
      const saved = window.State.isDraftSaved()
        ? window.State.getTeam(draft.id)
        : null;
      window.State.clearDraft();
      if (saved) window.State.editTeam(saved.id); // restore saved snapshot
    }
  } else if (draft && !window.State?.isDraftDirty?.()) {
    // Clean draft — just clear it so builder resets on next open
    window.State.clearDraft();
  }

  navigate('view-menu');
});

// ── Guarded back-button: Battle ──────────────────────────────────────────────

document.getElementById('btn-battle-back')?.addEventListener('click', async () => {
  const leave = await showConfirm({
    title:   'Leave Battle?',
    body:    'The current battle will be abandoned.',
    buttons: [
      { label: 'Leave',  value: true,  cls: 'btn-danger' },
      { label: 'Stay',   value: false, cls: 'btn-sm'     },
    ],
  });
  if (leave) navigate('view-menu');
});

// ── Cascading submenu system ─────────────────────────────────────────────────
// Submenu content handlers are registered by individual modules in
// window.SUBMENU_ON_OPEN_HANDLERS (see menu.js). This keeps submenu-
// specific logic out of the routing layer.

const _openSubmenus = new Map(); // depth → submenuId

function openSubmenu(id, depth, triggerBtn) {
  const isAlreadyOpen = _openSubmenus.get(depth) === id;

  document.querySelectorAll('.menu-submenu').forEach(el => {
    if (parseInt(el.dataset.depth, 10) >= depth) el.classList.remove('open');
  });
  document.querySelectorAll('[data-submenu-depth]').forEach(b => {
    if (parseInt(b.dataset.submenuDepth, 10) >= depth) b.classList.remove('submenu-active');
  });
  for (const [d] of _openSubmenus) {
    if (d >= depth) _openSubmenus.delete(d);
  }

  if (isAlreadyOpen) return;

  const target = document.getElementById(id);
  if (!target) return;

  const handler = window.SUBMENU_ON_OPEN_HANDLERS?.[id];
  if (handler) handler();

  target.classList.add('open');
  triggerBtn?.classList.add('submenu-active');
  _openSubmenus.set(depth, id);
}

document.querySelectorAll('[data-submenu]').forEach(btn => {
  btn.addEventListener('click', () => {
    openSubmenu(
      btn.dataset.submenu,
      parseInt(btn.dataset.submenuDepth ?? '1', 10),
      btn,
    );
  });
});

function closeAllSubmenus() {
  document.querySelectorAll('.menu-submenu').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('[data-submenu-depth]').forEach(b => b.classList.remove('submenu-active'));
  _openSubmenus.clear();
}

window.closeAllSubmenus = closeAllSubmenus;
