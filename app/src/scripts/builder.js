'use strict';

(function () {
  // ── Config ─────────────────────────────────────────────────────────────────
  const HP         = window.config?.game?.baseHp       ?? 100;
  const AP         = window.config?.game?.apPerGolem   ?? 10;
  const STACK_SIZE = window.config?.game?.bayStackSize ?? 2;

  // ── Module state ───────────────────────────────────────────────────────────
  let _bay              = {};
  let _dragData         = null;
  let _dropped          = false;
  let _moveFilter       = { archetype: null, element: null, validOnly: false };
  let _selectedGolemIdx = null;
  let _moveDrag         = null;  // active move-card drag: { type, moveId, golemIdx?, chipIdx? }

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const $golemRow       = document.getElementById('golem-row');
  const $bayCards       = document.getElementById('bay-cards');
  const $builderPanel   = document.getElementById('builder-panel');
  const $movesFilterBar = document.getElementById('moves-filter-bar');
  const $movesList      = document.getElementById('moves-list');
  const $noDraft        = document.getElementById('builder-no-draft');
  const $teamSelect   = document.getElementById('builder-team-select');
  const $teamName     = document.getElementById('builder-team-name');
  const $primaryBtn   = document.getElementById('builder-primary-btn');
  const $saveBtn      = document.getElementById('builder-save-btn');
  const $deleteBtn    = document.getElementById('builder-delete-btn');
  const $newBtn       = document.getElementById('builder-new-btn');

  // ── Helpers ───────────────────────────────────────────────────────────────

  function esc(s)        { return Utils.esc(s);        }
  function archAbbr(id)  { return Utils.archAbbr(id);  }
  function archClass(id) { return Utils.archClass(id); }
  function elClass(id)   { return Utils.elClass(id);   }

  // ── Bay management ─────────────────────────────────────────────────────────

  function initBay(golems) {
    _bay = {};
    window.ELEMENTS.forEach(el => (_bay[el.id] = STACK_SIZE));
    golems.forEach(g => {
      if (g.dom) _bay[g.dom] = Math.max(0, (_bay[g.dom] ?? 0) - 1);
      if (g.pas) _bay[g.pas] = Math.max(0, (_bay[g.pas] ?? 0) - 1);
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function renderTeamSelect() {
    const teams  = State.getTeams();
    const draft  = State.getDraft();
    const sel    = draft?.id ?? '';
    const primId = State.getPrimaryTeamId();
    $teamSelect.innerHTML =
      '<option value="">— select team —</option>' +
      teams.map(t =>
        `<option value="${esc(t.id)}"${t.id === sel ? ' selected' : ''}>${t.id === primId ? '★ ' : ''}${esc(t.name)}</option>`
      ).join('');
  }

  function renderGolemRow() {
    const draft = State.getDraft();
    if (!draft) { $golemRow.innerHTML = ''; return; }
    $golemRow.innerHTML = draft.golems.map((g, i) => {
      const domEl    = g.dom ? window.ELEMENTS.find(e => e.id === g.dom) : null;
      const pasEl    = g.pas ? window.ELEMENTS.find(e => e.id === g.pas) : null;
      const stats    = window.getGolemStats(g.dom ?? 'FRE', g.pas ?? 'FRE');
      const tier     = g.dom && g.pas ? window.getBreedTier(g.dom, g.pas) : '?';
      const maxSlots = g.dom && g.pas ? window.getMoveSlotCount(g.dom, g.pas) : 4;
      const archStr  = `${archAbbr(g.dom)} / ${archAbbr(g.pas)}`;
      const archCls  = archClass(g.dom);
      const domBG    = Utils.elColorVar(g.dom);
      const pasBG    = Utils.elColorVar(g.pas) || domBG;
      const isSel    = _selectedGolemIdx === i;

      const moves     = g.moves ?? [];
      const moveChips = moves.map((id, j) => {
        const m = window.CARDS.find(c => c.id === id);
        return `<div class="golem-move-chip" draggable="true"
          data-golem="${i}" data-idx="${j}" data-move="${esc(id)}">
          <span class="gmc-name">${esc(m?.name ?? id)}</span>
          <button class="gmc-rm" data-golem="${i}" data-move="${esc(id)}">&#10005;</button>
        </div>`;
      }).join('');
      const emptyChips = Array(maxSlots - moves.length).fill(0)
        .map((_, k) => `<div class="golem-move-chip golem-move-chip--empty"
          data-golem="${i}" data-idx="${moves.length + k}">&mdash;</div>`).join('');


      return `
        <div class="golem-card ${archCls}${isSel ? ' golem-card--selected' : ''}" data-golem-idx="${i}"
             data-dom="${esc(g.dom ?? '')}" data-pas="${esc(g.pas ?? '')}">
          <div class="golem-card-title">Golem ${i + 1}</div>
          <div class="golem-element-row">
            ${renderSlot(i, 'dom', domEl)}
            <span class="slot-sep">/</span>
            ${renderSlot(i, 'pas', pasEl)}
          </div>
          <div class="golem-stats">
            <div class="stat-row"><span class="stat-label">Tier</span><span class="stat-value">${tier}</span></div>
            <div class="stat-row"><span class="stat-label">HP</span><span class="stat-value">${stats.hp}</span></div>
            <div class="stat-row"><span class="stat-label">AP</span><span class="stat-value">${stats.ap}</span></div>
            <div class="stat-row"><span class="stat-label">ATK</span><span class="stat-value">${stats.atk}</span></div>
            <div class="stat-row"><span class="stat-label">DEF</span><span class="stat-value">${stats.def}</span></div>
            <div class="stat-row"><span class="stat-label">Arch</span><span class="stat-value">${esc(archStr)}</span></div>
          </div>
          <div class="golem-move-list" data-golem="${i}">
            <div class="golem-move-list-hdr">Moves <span class="gmh-count">${moves.length}/${maxSlots}</span></div>
            ${moveChips}${emptyChips}
          </div>
        </div>`;
    }).join('');

    $golemRow.querySelectorAll('.golem-card').forEach(c => {
      c.addEventListener('dragover',  onGolemCardDragOver);
      c.addEventListener('dragleave', onGolemCardDragLeave);
      c.addEventListener('drop',      onGolemCardDrop);
    });

    // Golem card click — select for move assignment (not triggered by slot or remove-button)
    $golemRow.querySelectorAll('.golem-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.golem-slot') || e.target.closest('.gmc-rm')) return;
        const idx = parseInt(card.dataset.golemIdx, 10);
        _selectedGolemIdx = _selectedGolemIdx === idx ? null : idx;
        render();
      });
    });

    // Remove-button inside move chip
    $golemRow.querySelectorAll('.gmc-rm').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        State.setDraftGolemMove(parseInt(btn.dataset.golem, 10), btn.dataset.move);
        render();
      });
    });

    $golemRow.querySelectorAll('.golem-slot').forEach(s => {
      s.addEventListener('dragover',  onSlotDragOver);
      s.addEventListener('dragleave', onSlotDragLeave);
      s.addEventListener('drop',      onSlotDrop);
    });

    $golemRow.querySelectorAll('.elem-card[draggable]').forEach(c => {
      c.addEventListener('dragstart', onPlacedCardDragStart);
      c.addEventListener('dragend',   onDragEnd);
    });
  }

  function renderSlot(golem, role, el) {
    const label = role === 'dom' ? 'DOM' : 'PAS';
    if (el) {
      return `
        <div class="golem-slot golem-slot--filled"
             data-golem="${golem}" data-role="${role}">
          <span class="slot-role-label">${label}</span>
          <div class="elem-card ${elClass(el.id)}" draggable="true"
               data-golem="${golem}" data-role="${role}" data-element="${esc(el.id)}">
            <div class="ec-icon"><div class="ec-icon-placeholder"></div></div>
            <span class="ec-id">${esc(el.id)}</span>
            <span class="ec-name">${esc(el.name)}</span>
          </div>
        </div>`;
    }
    return `
      <div class="golem-slot golem-slot--empty"
           data-golem="${golem}" data-role="${role}">
        <span class="slot-role-label">${label}</span>
        <span class="slot-hint">drop</span>
      </div>`;
  }

  function renderBay() {
    $bayCards.innerHTML = '';
    ['Stable', 'Volatile', 'Arcane'].forEach(arch => {
      const els     = window.ELEMENTS.filter(e => e.archetype === arch);
      const groupEl = document.createElement('div');
      groupEl.className = `arch-group arch-group--${arch.toLowerCase()}`;
      const hdrEl   = document.createElement('div');
      hdrEl.className   = 'arch-group-hdr';
      hdrEl.textContent = arch;
      const gridEl  = document.createElement('div');
      gridEl.className  = 'arch-group-grid';
      groupEl.appendChild(hdrEl);
      groupEl.appendChild(gridEl);
      els.forEach(el => {
        const avail  = _bay[el.id] ?? 0;
        const active = avail > 0;
        const card   = document.createElement('div');
        card.className       = `elem-card ${elClass(el.id)}${active ? '' : ' elem-card--spent'}`;
        card.draggable       = active;
        card.dataset.element = el.id;
        const badge = avail > 1 ? `<span class="bay-stack-count">${avail}x</span>` : '';
        card.innerHTML =
          `<div class="ec-icon"><div class="ec-icon-placeholder"></div></div>` +
          `<span class="ec-id">${esc(el.id)}</span>` +
          `<span class="ec-name">${esc(el.name)}</span>` +
          badge;
        if (active) {
          card.addEventListener('dragstart', onBayCardDragStart);
          card.addEventListener('dragend',   onDragEnd);
        }
        gridEl.appendChild(card);
      });
      $bayCards.appendChild(groupEl);
    });
  }

  function renderMovesFilterBar() {
    if (!$movesFilterBar) return;
    const f = _moveFilter;

    const archPills = ['all', 'stable', 'volatile', 'arcane', 'general'].map(a => {
      const isActive = a === 'all' ? !f.archetype : f.archetype === a;
      const label    = a === 'all' ? 'All' : a[0].toUpperCase() + a.slice(1);
      return `<button class="mf-pill${isActive ? ' mf-pill--active' : ''}" data-arch="${a}">${label}</button>`;
    }).join('');

    const validActive = f.validOnly ? ' mf-pill--active' : '';

    let elRow = '';
    if (f.archetype) {
      const arch = f.archetype[0].toUpperCase() + f.archetype.slice(1);
      const pills = window.ELEMENTS
        .filter(e => e.archetype === arch)
        .map(el => {
          const act = f.element === el.id ? ' mf-el-pill--active' : '';
          return `<button class="mf-el-pill ${elClass(el.id)}${act}" data-el="${esc(el.id)}">${esc(el.id)}</button>`;
        }).join('');
      elRow = `<div class="mf-el-row">${pills}</div>`;
    }

    $movesFilterBar.innerHTML = `
      <div class="mf-arch-row">
        ${archPills}
        <button class="mf-pill mf-pill--valid${validActive}" id="mf-valid-btn">Valid</button>
      </div>
      ${elRow}`;

    $movesFilterBar.querySelectorAll('[data-arch]').forEach(btn =>
      btn.addEventListener('click', () => {
        const a = btn.dataset.arch;
        _moveFilter.archetype = a === 'all' ? null : a;
        _moveFilter.element   = null;
        renderMovesFilterBar();
        renderMovesList();
      })
    );
    $movesFilterBar.querySelectorAll('[data-el]').forEach(btn =>
      btn.addEventListener('click', () => {
        _moveFilter.element = _moveFilter.element === btn.dataset.el ? null : btn.dataset.el;
        renderMovesFilterBar();
        renderMovesList();
      })
    );
    document.getElementById('mf-valid-btn')?.addEventListener('click', () => {
      _moveFilter.validOnly = !_moveFilter.validOnly;
      renderMovesFilterBar();
      renderMovesList();
    });
  }

  function renderMovesList() {
    if (!$movesList) return;
    const f     = _moveFilter;
    const draft = State.getDraft();
    const selG  = _selectedGolemIdx !== null ? draft?.golems[_selectedGolemIdx] : null;

    // Build valid set — moves accessible by at least one golem in the current team
    let validIds = null;
    if (f.validOnly && draft) {
      validIds = new Set();
      draft.golems.forEach(g => {
        if (g.dom && g.pas) Engine.movesFor(g.dom, g.pas).forEach(m => validIds.add(m.id));
      });
    }

    let moves = window.CARDS.filter(c => c.type === 'move');

    if (f.element) {
      moves = moves.filter(m => m.element === f.element);
    } else if (f.archetype === 'general') {
      moves = moves.filter(m => m.pool === 'general');
    } else if (f.archetype) {
      moves = moves.filter(m => m.pool === f.archetype);
    }

    if (validIds) moves = moves.filter(m => validIds.has(m.id));

    // Static hint: drag is always available; click-assign is secondary
    const hintHtml = `<div class="moves-assign-hint">Drag any move to a Golem${selG ? ` · click toggles on Golem ${_selectedGolemIdx + 1}` : ' · or select a Golem to click-assign'}</div>`;

    if (!moves.length) {
      $movesList.innerHTML = hintHtml + '<div class="moves-empty">No moves match this filter.</div>';
      return;
    }

    const assignedSet = new Set(selG?.moves ?? []);

    $movesList.innerHTML = hintHtml + moves.map(m => {
      const badgeCls  = m.element
        ? elClass(m.element)
        : m.archetype ? `arch-${m.archetype}` : 'mc-badge--gen';
      const badgeText = m.element ?? (m.archetype ? m.archetype.slice(0, 3).toUpperCase() : 'GEN');
      const rarityKey = m.rarity[0].toUpperCase();
      const assignedCls = assignedSet.has(m.id) ? ' moves-card--assigned' : '';
      const selectableCls = selG ? ' moves-card--selectable' : '';
      return `
        <div class="moves-card${assignedCls}${selectableCls}" draggable="true" data-move-id="${esc(m.id)}"
             data-element="${esc(m.element ?? '')}" data-pool="${esc(m.pool ?? '')}">
          <div class="mc-top">
            <span class="mc-badge ${badgeCls}">${esc(badgeText)}</span>
            <span class="mc-name">${esc(m.name)}</span>
            <span class="mc-pwr">${m.movePower !== null ? m.movePower.toFixed(2) : '\u2014'}</span>
            <span class="mc-rarity mc-rarity--${m.rarity}">${rarityKey}</span>
          </div>
          <div class="mc-effect">${esc(m.effect)}</div>
        </div>`;
    }).join('');
  }

  function attachHoverListeners() {
    const draft = State.getDraft();

    // ── Click-to-assign ──────────────────────────────────────────────────────
    $movesList?.querySelectorAll('.moves-card').forEach(mc => {
      mc.addEventListener('click', () => {
        if (_selectedGolemIdx === null) return;
        State.setDraftGolemMove(_selectedGolemIdx, mc.dataset.moveId);
        render();
      });
    });

    // ── Bidirectional hover highlights ───────────────────────────────────────
    $movesList?.querySelectorAll('.moves-card').forEach(mc => {
      const moveId = mc.dataset.moveId;
      mc.addEventListener('mouseenter', () => {
        if (!draft) return;
        $golemRow.querySelectorAll('.golem-card').forEach((gc, i) => {
          const g = draft.golems[i];
          if (!g?.dom || !g?.pas) return;
          if (Engine.movesFor(g.dom, g.pas).some(m => m.id === moveId))
            gc.classList.add('golem-move-highlight');
        });
      });
      mc.addEventListener('mouseleave', () => {
        $golemRow.querySelectorAll('.golem-move-highlight')
          .forEach(gc => gc.classList.remove('golem-move-highlight'));
      });
    });

    $golemRow.querySelectorAll('.golem-card').forEach(gc => {
      const idx = parseInt(gc.dataset.golemIdx, 10);
      gc.addEventListener('mouseenter', () => {
        if (!draft) return;
        const g = draft.golems[idx];
        if (!g?.dom || !g?.pas) return;
        const validIds = new Set(Engine.movesFor(g.dom, g.pas).map(m => m.id));
        $movesList?.querySelectorAll('.moves-card').forEach(mc =>
          mc.classList.toggle('move-golem-highlight', validIds.has(mc.dataset.moveId))
        );
      });
      gc.addEventListener('mouseleave', () => {
        $movesList?.querySelectorAll('.move-golem-highlight')
          .forEach(mc => mc.classList.remove('move-golem-highlight'));
      });
    });

    // ── Move panel → golem DnD ───────────────────────────────────────────────
    $movesList?.querySelectorAll('.moves-card').forEach(mc => {
      mc.addEventListener('dragstart', e => {
        _moveDrag = { type: 'panel', moveId: mc.dataset.moveId };
        e.dataTransfer.effectAllowed = 'copy';
        setTimeout(() => mc.classList.add('mc-dragging'), 0);
      });
      mc.addEventListener('dragend', () => {
        mc.classList.remove('mc-dragging');
        _moveDrag = null;
      });
    });

    // ── Move chip → reorder / between-golem DnD ──────────────────────────────
    $golemRow?.querySelectorAll('.golem-move-chip[draggable]').forEach(chip => {
      chip.addEventListener('dragstart', e => {
        _moveDrag = {
          type:     'chip',
          moveId:   chip.dataset.move,
          golemIdx: parseInt(chip.dataset.golem, 10),
          chipIdx:  parseInt(chip.dataset.idx,   10),
        };
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation(); // prevent element-card drag from triggering
        setTimeout(() => chip.classList.add('mc-dragging'), 0);
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('mc-dragging');
        _moveDrag = null;
      });
    });

    // ── Per-chip drop targets (insert at position) ───────────────────────────
    $golemRow?.querySelectorAll('.golem-move-chip').forEach(chip => {
      chip.addEventListener('dragover', e => {
        if (!_moveDrag) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = _moveDrag.type === 'chip' ? 'move' : 'copy';
        chip.classList.add('chip-drag-over');
      });
      chip.addEventListener('dragleave', e => {
        if (!chip.contains(e.relatedTarget))
          chip.classList.remove('chip-drag-over');
      });
      chip.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        chip.classList.remove('chip-drag-over');
        chip.closest('.golem-move-list')?.classList.remove('move-list-drag-over');
        if (!_moveDrag) return;
        const toGolem = parseInt(chip.dataset.golem, 10);
        const toIdx   = parseInt(chip.dataset.idx,   10);
        const moveId  = _moveDrag.moveId;
        if (_moveDrag.type === 'panel') {
          State.setDraftGolemMoveAt(toGolem, toIdx, moveId);
        } else {
          const fromGolem = _moveDrag.golemIdx;
          if (fromGolem === toGolem) {
            State.reorderDraftGolemMove(toGolem, _moveDrag.chipIdx, toIdx);
          } else {
            State.setDraftGolemMove(fromGolem, moveId);   // remove from source
            State.setDraftGolemMoveAt(toGolem, toIdx, moveId); // insert at target
          }
        }
        render();
      });
    });

    // ── Golem move-list column drop zone (append) ────────────────────────────
    $golemRow?.querySelectorAll('.golem-move-list').forEach(list => {
      list.addEventListener('dragover', e => {
        if (!_moveDrag) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = _moveDrag.type === 'chip' ? 'move' : 'copy';
        list.classList.add('move-list-drag-over');
      });
      list.addEventListener('dragleave', e => {
        if (!list.contains(e.relatedTarget))
          list.classList.remove('move-list-drag-over');
      });
      list.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        list.classList.remove('move-list-drag-over');
        if (!_moveDrag) return;
        const toGolem = parseInt(list.dataset.golem, 10);
        const moveId  = _moveDrag.moveId;
        if (_moveDrag.type === 'panel') {
          State.setDraftGolemMove(toGolem, moveId);
        } else {
          const fromGolem = _moveDrag.golemIdx;
          if (fromGolem === toGolem) {
            State.reorderDraftGolemMove(toGolem, _moveDrag.chipIdx, Infinity);
          } else {
            State.setDraftGolemMove(fromGolem, moveId);
            State.setDraftGolemMove(toGolem,   moveId);
          }
        }
        render();
      });
    });
  }

  function render() {
    const draft    = State.getDraft();
    const primId   = State.getPrimaryTeamId();
    const isPrimary = !!draft?.id && draft.id === primId;
    renderTeamSelect();
    $teamName.value        = draft?.name ?? '';
    $saveBtn.disabled      = !State.isDraftValid();
    $deleteBtn.textContent = State.isDraftSaved() ? 'Delete Team' : 'Discard';
    if ($primaryBtn) {
      $primaryBtn.textContent = isPrimary ? '\u2605' : '\u2606';
      $primaryBtn.disabled    = !State.isDraftSaved();
      $primaryBtn.title       = isPrimary ? 'Primary Team (click to unset)' : 'Set as Primary Team';
      $primaryBtn.classList.toggle('btn-star--active', isPrimary);
    }
    $golemRow.classList.toggle('hidden', !draft);
    $noDraft.classList.toggle('hidden', !!draft);
    renderBay();
    renderMovesFilterBar();
    renderMovesList();
    if (draft) {
      renderGolemRow();
      // Apply per-element gradient vars via JS (avoids CSP inline-style block)
      draft.golems.forEach((g, i) => {
        const card = $golemRow.querySelector(`[data-golem-idx="${i}"]`);
        if (!card) return;
        card.style.setProperty('--dom-dim', Utils.elColorVar(g.dom) || 'transparent');
        card.style.setProperty('--pas-dim', Utils.elColorVar(g.pas) || Utils.elColorVar(g.dom) || 'transparent');
      });
    }
    attachHoverListeners();
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  function onBayCardDragStart(e) {
    const id = e.currentTarget.dataset.element;
    if (!_bay[id]) return;
    _dragData = { from: 'bay', id };
    _dropped  = false;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.currentTarget.classList.add('dragging'), 0);
  }

  function onPlacedCardDragStart(e) {
    _dragData = {
      from:  'slot',
      id:    e.currentTarget.dataset.element,
      golem: parseInt(e.currentTarget.dataset.golem, 10),
      role:  e.currentTarget.dataset.role,
    };
    _dropped = false;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.currentTarget.classList.add('dragging'), 0);
  }

  function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    if (!_dropped && _dragData?.from === 'slot') {
      const draft = State.getDraft();
      if (draft) {
        const { id, golem: g, role } = _dragData;
        const sg = draft.golems[g];
        State.setDraftGolem(
          g,
          role === 'dom' ? null : sg.dom,
          role === 'pas' ? null : sg.pas,
        );
        _bay[id] = Math.min(STACK_SIZE, (_bay[id] ?? 0) + 1);
        render();
      }
    }
    _dragData = null;
    _dropped  = false;
  }

  // ── Core drop logic (shared) ─────────────────────────────────────────

  function performDrop(tGolem, tRole) {
    _dropped = true;
    const draft = State.getDraft();
    if (!draft || !_dragData) return;
    const tEl = draft.golems[tGolem][tRole];
    if (_dragData.from === 'slot' &&
        _dragData.golem === tGolem &&
        _dragData.role  === tRole) return;
    if (tEl) _bay[tEl] = Math.min(STACK_SIZE, (_bay[tEl] ?? 0) + 1);
    if (_dragData.from === 'bay') {
      _bay[_dragData.id] = Math.max(0, (_bay[_dragData.id] ?? 0) - 1);
    } else {
      const sg = draft.golems[_dragData.golem];
      State.setDraftGolem(
        _dragData.golem,
        _dragData.role === 'dom' ? null : sg.dom,
        _dragData.role === 'pas' ? null : sg.pas,
      );
    }
    const tg = draft.golems[tGolem];
    State.setDraftGolem(
      tGolem,
      tRole === 'dom' ? _dragData.id : tg.dom,
      tRole === 'pas' ? _dragData.id : tg.pas,
    );
    render();
  }

  // ── Slot-level DnD ────────────────────────────────────────────────

  function onSlotDragOver(e) {
    if (!_dragData) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
  }

  function onSlotDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      e.currentTarget.classList.remove('drag-over');
    }
  }

  function onSlotDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    if (!_dragData) return;
    performDrop(
      parseInt(e.currentTarget.dataset.golem, 10),
      e.currentTarget.dataset.role,
    );
  }

  // ── Golem-card-level DnD (smart drop: DOM first, then PAS) ──────────

  function onGolemCardDragOver(e) {
    if (_moveDrag) {
      // Move-card drag: whole card is a valid drop zone (append to move list)
      e.preventDefault();
      e.dataTransfer.dropEffect = _moveDrag.type === 'chip' ? 'move' : 'copy';
      e.currentTarget.classList.add('drag-over-move');
      return;
    }
    if (!_dragData) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const draft = State.getDraft();
    if (!draft) return;
    const golemIdx  = parseInt(e.currentTarget.dataset.golemIdx, 10);
    const g         = draft.golems[golemIdx];
    const emptyRole = !g.dom ? 'dom' : !g.pas ? 'pas' : null;
    if (!emptyRole) return;
    e.currentTarget.querySelectorAll('.golem-slot').forEach(s =>
      s.classList.toggle('drag-over', s.dataset.role === emptyRole)
    );
    e.currentTarget.classList.add('drag-over');
  }

  function onGolemCardDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      e.currentTarget.classList.remove('drag-over');
      e.currentTarget.classList.remove('drag-over-move');
      e.currentTarget.querySelectorAll('.golem-slot').forEach(s =>
        s.classList.remove('drag-over')
      );
    }
  }

  function onGolemCardDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    e.currentTarget.classList.remove('drag-over-move');
    e.currentTarget.querySelectorAll('.golem-slot').forEach(s =>
      s.classList.remove('drag-over')
    );
    if (_moveDrag) {
      // Dropped on card body (outside a chip/list — those stopPropagation)
      const golemIdx = parseInt(e.currentTarget.dataset.golemIdx, 10);
      const moveId   = _moveDrag.moveId;
      if (_moveDrag.type === 'panel') {
        State.setDraftGolemMove(golemIdx, moveId);
      } else if (_moveDrag.golemIdx !== golemIdx) {
        State.setDraftGolemMove(_moveDrag.golemIdx, moveId); // remove from source
        State.setDraftGolemMove(golemIdx, moveId);           // append to target
      }
      render();
      return;
    }
    if (!_dragData) return;
    const draft = State.getDraft();
    if (!draft) return;
    const golemIdx  = parseInt(e.currentTarget.dataset.golemIdx, 10);
    const g         = draft.golems[golemIdx];
    const emptyRole = !g.dom ? 'dom' : !g.pas ? 'pas' : null;
    if (emptyRole) performDrop(golemIdx, emptyRole);
    else _dropped = true;
  }

  function onBayDrop(e) {
    e.preventDefault();
    if (!_dragData || _dragData.from !== 'slot') return;
    _dropped = true;
    const draft = State.getDraft();
    if (!draft) return;
    const { id, golem: g, role } = _dragData;
    const sg = draft.golems[g];
    State.setDraftGolem(
      g,
      role === 'dom' ? null : sg.dom,
      role === 'pas' ? null : sg.pas,
    );
    _bay[id] = Math.min(STACK_SIZE, (_bay[id] ?? 0) + 1);
    render();
  }

  // ── Control events ─────────────────────────────────────────────────────────

  $teamSelect.addEventListener('change', () => {
    const id = $teamSelect.value;
    if (!id) { State.clearDraft(); render(); return; }
    const team = State.editTeam(id);
    if (team) { initBay(team.golems); render(); }
  });

  $newBtn.addEventListener('click', () => {
    const team = State.newDraft();
    initBay(team.golems);
    render();
    $teamName.focus();
  });

  $teamName.addEventListener('input', () => {
    State.setDraftName($teamName.value);
    $saveBtn.disabled = !State.isDraftValid();
    renderTeamSelect();
  });

  $saveBtn.addEventListener('click', () => {
    if (State.saveDraft()) render();
  });

  $deleteBtn.addEventListener('click', () => {
    const draft = State.getDraft();
    if (!draft) return;
    if (State.isDraftSaved()) State.deleteTeam(draft.id);
    else State.clearDraft();
    render();
  });

  $primaryBtn?.addEventListener('click', () => {
    const draft = State.getDraft();
    if (!draft?.id || !State.isDraftSaved()) return;
    const currentPrimary = State.getPrimaryTeamId();
    if (currentPrimary === draft.id) {
      State.setPrimaryTeamId(null);
    } else if (currentPrimary) {
      const prev = State.getTeam(currentPrimary);
      if (!window.confirm(`Change primary team from "${prev?.name ?? 'current'}" to "${draft.name}"?`)) return;
      State.setPrimaryTeamId(draft.id);
    } else {
      State.setPrimaryTeamId(draft.id);
    }
    render();
  });

  // Builder panel as return zone — accept cards dragged back from slots
  $builderPanel.addEventListener('dragover', e => {
    if (_dragData?.from === 'slot') e.preventDefault();
  });
  $builderPanel.addEventListener('drop', onBayDrop);

  // ── Public ─────────────────────────────────────────────────────────────────

  window.Builder = {
    init() {
      let draft = State.getDraft();
      if (!draft) {
        // Auto-load the primary team when the builder opens
        const primaryId = State.getPrimaryTeamId();
        if (primaryId) {
          const team = State.editTeam(primaryId);
          if (team) { draft = team; initBay(team.golems); }
        }
      } else {
        initBay(draft.golems);
      }
      render();
    },
  };
})();
