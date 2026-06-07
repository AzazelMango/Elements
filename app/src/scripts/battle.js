'use strict';

(function () {
  // ── Config ────────────────────────────────────────────────────────────────
  const CFG = {
    timerSecs: 0,
  };

  // ── Card icons & slot rules ───────────────────────────────────────────────
  const CARD_ICONS = {
    curse:       '<img src="assets/icons/CRS.svg" class="icon-card-type" alt="curse" draggable="false">',
    enchantment: '<img src="assets/icons/ENT.svg" class="icon-card-type" alt="enchantment" draggable="false">',
    equipment:   '<img src="assets/icons/EQP.svg" class="icon-card-type" alt="equipment" draggable="false">',
    item:        '<img src="assets/icons/ITM.svg" class="icon-card-type" alt="item" draggable="false">',
    special:     '<img src="assets/icons/SPC.svg" class="icon-card-type" alt="special" draggable="false">',
    general:     '<img src="assets/icons/GEN.svg" class="icon-card-type" alt="any" draggable="false">',
  };

  const SLOT_ACCEPTS = {
    primary:   (c) => c.type === 'item' && (c.itemSlot === 'primary'   || c.itemSlot === 'dual'),
    secondary: (c) => c.type === 'item' && (c.itemSlot === 'secondary' || c.itemSlot === 'dual'),
    equipment: (c) => c.type === 'equipment' && c.itemSlot === 'equipment',
    enchant:   (c) => c.type === 'enchantment',
    curse:     (c) => c.type === 'curse',
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let _state    = null;
  let _timerId  = null;
  let _handDrag = null; // { handIdx, cardType, itemSlot }

  function makeGolem(golemData, slot) {
    const dom   = golemData.dom;
    const pas   = golemData.pas;
    const stats = window.getGolemStats(dom, pas);
    const assignedMoves = (golemData.moves ?? [])
      .map(id => window.CARDS.find(c => c.id === id))
      .filter(Boolean);
    const moves = assignedMoves.length
      ? assignedMoves
      : Engine.movesFor(dom, pas).filter(m => m.pool !== null).slice(0, 4);
    return {
      slot, dom, pas, moves,
      name:     `${dom}/${pas}`,
      hp:       stats.hp, maxHp: stats.hp,
      atk:      stats.atk, def: stats.def, ap: stats.ap,
      defeated: false,
      effects:  [],
      equipped: {
        primary:   null,
        secondary: null,
        equipment:    null,
        enchants:  [null, null],
        curses:    [null, null, null],
      },
    };
  }

  function initState(teamId) {
    const team = teamId ? State.getTeam(teamId) : null;
    const pGolems = team
      ? team.golems.map((g, i) => makeGolem(g, i))
      : [
          makeGolem({ dom: 'FRE', pas: 'NAT', moves: [] }, 0),
          makeGolem({ dom: 'ELC', pas: 'MTL', moves: [] }, 1),
          makeGolem({ dom: 'ICE', pas: 'WTR', moves: [] }, 2),
        ];
    const hand = window.buildHand?.(window.config?.game?.handSize ?? 5) ?? [];
    _state = {
      round:        1,
      phase:        'planning',
      player:       pGolems,
      enemy: [
        makeGolem({ dom: 'STN', pas: 'VOD', moves: [] }, 0),
        makeGolem({ dom: 'AIR', pas: 'CRY', moves: [] }, 1),
        makeGolem({ dom: 'LIT', pas: 'ICE', moves: [] }, 2),
      ],
      queues:       [[], [], []],
      apUsed:       [0, 0, 0],
      defApUsed:    [0, 0, 0],
      defTier:      [null, null, null],
      enemyDefTier: [null, null, null],
      selectedSlot: null,
      selectedTier: 'standard',
      selectedMove: null,
      lastMove:     [null, null, null],
      lastTier:     ['standard', 'standard', 'standard'],
      hand,
      deckSize:     Math.max(0, window.CARDS.filter(c => c.type !== 'move').length - hand.length),
      timerSecs:    CFG.timerSecs,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s)        { return Utils.esc(s); }
  function archClass(id) { return Utils.archClass(id); }
  function apTotal(slot) { return _state.player[slot].ap; }
  function apRemaining(slot) {
    return apTotal(slot) - _state.apUsed[slot] - _state.defApUsed[slot];
  }
  function tierCost(tier) { return Engine.ATTACK_TIERS[tier]?.cost ?? 4; }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const $arenaEnemy  = document.getElementById('arena-enemy');
  const $arenaPlayer = document.getElementById('arena-player');
  const $arenaSvg    = document.getElementById('arena-svg');
  const $arena       = document.getElementById('battle-arena');
  const $log         = document.getElementById('battle-log');
  const $bRound      = document.getElementById('b-round');
  const $bTimer      = document.getElementById('b-timer');
  const $hand        = document.getElementById('battle-hand');
  const $deckStack   = document.getElementById('deck-stack');
  const $deckCount   = document.getElementById('deck-count');
  const $hint        = document.getElementById('action-empty-hint');
  const $planner     = document.getElementById('action-planner');
  const $golemLabel  = document.getElementById('ap-golem-label');
  const $apBarFill   = document.getElementById('ap-bar-fill');
  const $apRemaining = document.getElementById('ap-remaining');
  const $apMoveRow   = document.getElementById('ap-move-row');
  const $apDefRow    = document.getElementById('ap-def-row');
  const $apQueue     = document.getElementById('ap-queue');
  const $readyBtn    = document.getElementById('battle-ready-btn');

  // ── Equip logic ───────────────────────────────────────────────────────────

  function applyCardEffects(golem, card) {
    if (!card.tags) return;
    card.tags.forEach(tag => {
      if (tag.target !== 'self') return;
      if (tag.duration === 1) {
        if (tag.type === 'hp_gain') golem.hp = Math.min(golem.maxHp, golem.hp + tag.value);
        if (tag.type === 'ap_gain') golem.ap += tag.value;
      } else {
        golem.effects.push({
          type: tag.type, value: tag.value,
          duration: tag.duration, source: card.id,
        });
      }
    });
  }

  function tickEffects(golem) {
    golem.effects.forEach(eff => {
      switch (eff.type) {
        case 'hp_drain': golem.hp  = Math.max(0,         golem.hp  + eff.value); break;
        case 'hp_gain':  golem.hp  = Math.min(golem.maxHp, golem.hp + eff.value); break;
        case 'atk_mod':  golem.atk = Math.max(0,         golem.atk + eff.value); break;
        case 'def_mod':  golem.def = Math.max(0,         golem.def + eff.value); break;
        case 'ap_gain':  golem.ap += eff.value; break;
        case 'ap_drain': golem.ap  = Math.max(0,         golem.ap  + eff.value); break;
      }
      eff.duration--;
    });
    golem.effects = golem.effects.filter(e => e.duration > 0);
  }

  function equipCard(golemSlot, handIdx, slotKey, slotIdx) {
    const g    = _state.player[golemSlot];
    const card = _state.hand[handIdx];
    if (!g || !card) return false;
    if (!SLOT_ACCEPTS[slotKey]?.(card)) return false;
    const fieldMap = {
      primary:   'primary', secondary: 'secondary',
      equipment:    'equipment',  enchant:   'enchants', curse: 'curses',
    };
    const field    = fieldMap[slotKey];
    const arrSlots = ['enchant', 'curse'];
    if (!field) return false;
    if (arrSlots.includes(slotKey)) {
      if (g.equipped[field][slotIdx] !== null) return false;
      g.equipped[field][slotIdx] = card;
    } else {
      if (card.itemSlot === 'dual') {
        if (g.equipped.primary !== null || g.equipped.secondary !== null) return false;
        g.equipped.primary   = card;
        g.equipped.secondary = card;
      } else {
        if (g.equipped[field] !== null) return false;
        g.equipped[field] = card;
      }
    }
    applyCardEffects(g, card);
    _state.hand.splice(handIdx, 1);
    _state.deckSize = Math.max(0, _state.deckSize - 1);
    render();
    return true;
  }

  function equipCurse(enemySlot, handIdx) {
    const g    = _state.enemy[enemySlot];
    const card = _state.hand[handIdx];
    if (!g || !card || card.type !== 'curse') return false;
    const idx = g.equipped.curses.indexOf(null);
    if (idx < 0) return false;
    g.equipped.curses[idx] = card;
    card.tags?.forEach(tag => {
      if (tag.target !== 'target') return;
      g.effects.push({ type: tag.type, value: tag.value, duration: tag.duration, source: card.id });
    });
    _state.hand.splice(handIdx, 1);
    _state.deckSize = Math.max(0, _state.deckSize - 1);
    render();
    return true;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function renderGolemCard(g, side, isSelected) {
    const tier    = (g.dom && g.pas) ? window.getBreedTier(g.dom, g.pas) : '?';
    const archDom = archClass(g.dom);
    const archPas = archClass(g.pas);
    const pct     = Math.max(0, Math.round((g.hp / g.maxHp) * 100));
    const hpCls   = pct > 50 ? 'hp-hi' : pct > 25 ? 'hp-mid' : 'hp-lo';
    const eqp     = g.equipped;

    function slotHtml(slotKey, card, idx) {
      const filled     = card !== null;
      const filledCls  = filled ? ` bgc-slot--filled bc--${card.type}` : '';
      const latentCls  = (!filled && slotKey === 'curse') ? ' bgc-slot--latent' : '';
      const icon       = filled ? (CARD_ICONS[card.type] ?? '') : '';
      const label      = filled ? esc(card.name.slice(0, 5)) : '';
      const titleText  = filled ? esc(card.name) : slotKey;
      return `<div class="bgc-slot${filledCls}${latentCls}" data-slot-key="${slotKey}" data-slot-idx="${idx}" title="${titleText}">${icon}<span class="bgc-slot-name">${label}</span></div>`;
    }

    const equipHtml =
      slotHtml('primary',   eqp.primary,       0) +
      slotHtml('secondary', eqp.secondary,      0) +
      slotHtml('equipment',    eqp.equipment,         0) +
      slotHtml('enchant',   eqp.enchants[0],    0) +
      slotHtml('enchant',   eqp.enchants[1],    1) +
      slotHtml('curse',     eqp.curses[0],      0) +
      slotHtml('curse',     eqp.curses[1],      1) +
      slotHtml('curse',     eqp.curses[2],      2);

    let badgesHtml;
    if (side === 'player') {
      const atkBadges = (_state.queues[g.slot] ?? []).map(a => {
        const m = window.CARDS.find(c => c.id === a.moveId);
        return `<span class="bgc-badge bgc-badge--atk">${esc(m?.name?.slice(0, 9) ?? '?')} [${a.tier[0].toUpperCase()}]\u2192E${a.targetSlot + 1}</span>`;
      }).join('');
      const defBadge = _state.defTier[g.slot]
        ? `<span class="bgc-badge bgc-badge--def">${_state.defTier[g.slot]}</span>` : '';
      badgesHtml = `<div class="bgc-badges" id="bgc-badges-${side}-${g.slot}">${atkBadges}${defBadge}</div>`;
    } else {
      badgesHtml = `<div class="bgc-badges" id="bgc-badges-${side}-${g.slot}"></div>`;
    }

    const hasCurse   = eqp.curses.some(c => c !== null);
    const hasEnchant = eqp.enchants.some(c => c !== null);
    const hasSpecial = false; // reserved for future special slot
    const glowHtml = [
      hasCurse   ? '<span class="bgc-effect-glow bgc-effect-glow--curse"></span>'   : '',
      hasEnchant ? '<span class="bgc-effect-glow bgc-effect-glow--enchant"></span>' : '',
      hasSpecial ? '<span class="bgc-effect-glow bgc-effect-glow--special"></span>' : '',
    ].join('');

    const selCls = (side === 'player' && isSelected) ? ' bgc--selected' : '';
    const defCls = g.defeated ? ' bgc--defeated' : '';

    return `
      <div class="bgc-container">
        <div class="bgc bgc--${side}${selCls}${defCls}"
            id="${side}-${g.slot}" data-slot="${g.slot}">
          ${glowHtml}
          <div class="bgc-body">
            <div class="bgc-frame">
            </div>
            <div class="bgc-info">
              <div class="bgc-header">
                <span class="bgc-name">${esc(g.dom)}/${esc(g.pas)}</span>
                <span class="bgc-el bgc-el--dom ${archDom}">${Utils.elIconHtml(g.dom)}</span>
                <span class="bgc-el bgc-el--pas ${archPas}">${Utils.elIconHtml(g.pas)}</span>
                <span class="bgc-tier bgc-tier--${tier}">${tier}</span>
              </div>
              <div class="bgc-hp">
                <span class="bgc-hp-label">HP</span>
                <div class="bgc-hp-track">
                  <div class="bgc-hp-fill ${hpCls}" id="hpf-${side}-${g.slot}"></div>
                  <span class="bgc-hp-text">${g.hp} / ${g.maxHp}</span>
                </div>
              </div>
              <div class="bgc-stats">
                <span class="bgc-stat bgc-stat--atk">ATK ${g.atk}</span>
                <span class="bgc-stat bgc-stat--def">DEF ${g.def}</span>
                <span class="bgc-stat bgc-stat--ap">AP ${g.ap}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="bgc-slots">
          <div class="bgc-equip">${equipHtml}</div>
          ${badgesHtml}
        </div>
      </div>`;
  }

  function postRenderGolemCards(side) {
    const golems = side === 'player' ? _state.player : _state.enemy;
    golems.forEach(g => {
      const el = document.getElementById(`${side}-${g.slot}`);
      if (!el) return;
      // Colour vars on the card element cascade down to .bgc-frame and the gradient border
      el.style.setProperty('--bgc-dom',     Utils.elDimVar(g.dom));
      el.style.setProperty('--bgc-pas',     Utils.elDimVar(g.pas) || Utils.elDimVar(g.dom));
      el.style.setProperty('--bgc-col-dom', Utils.elColorVar(g.dom));
      el.style.setProperty('--bgc-col-pas', Utils.elColorVar(g.pas) || Utils.elColorVar(g.dom));
      const hpFill = el.querySelector('.bgc-hp-fill');
      if (hpFill) {
        const pct = Math.max(0, Math.round((g.hp / g.maxHp) * 100));
        hpFill.style.setProperty('--hp-pct', pct + '%');
      }
    });
  }

  function renderEnemyRow() {
    $arenaEnemy.innerHTML = _state.enemy.map(g => renderGolemCard(g, 'enemy', false)).join('');
    postRenderGolemCards('enemy');
    if (_state.phase === 'planning') {
      $arenaEnemy.querySelectorAll('.bgc-container').forEach(el => {
        const slot = +el.querySelector('.bgc')?.dataset.slot;
        el.addEventListener('click', () => {
          if (_handDrag) return;
          onEnemyClick(slot);
        });
      });
    }
  }

  function renderPlayerRow() {
    const sel = _state.selectedSlot;
    $arenaPlayer.innerHTML = _state.player.map(g =>
      renderGolemCard(g, 'player', sel === g.slot)
    ).join('');
    postRenderGolemCards('player');
    if (_state.phase === 'planning') {
      $arenaPlayer.querySelectorAll('.bgc-container').forEach(el => {
        const slot = +el.querySelector('.bgc')?.dataset.slot;
        el.addEventListener('click', () => onPlayerClick(slot));
      });
    }
  }

  function renderPlanner() {
    const slot    = _state.selectedSlot;
    const showing = slot !== null && _state.phase === 'planning';
    $hint.classList.toggle('hidden', showing);
    $planner.classList.toggle('hidden', !showing);
    if (!showing) return;

    const g         = _state.player[slot];
    const rem       = apRemaining(slot);
    const breedTier = window.getBreedTier(g.dom, g.pas);

    $golemLabel.textContent  = `G${slot + 1} \u00b7 ${g.dom}/${g.pas} [${breedTier}]`;
    $apRemaining.textContent = `${rem} / ${apTotal(slot)} AP`;
    $apBarFill.style.width   = `${((_state.apUsed[slot] + _state.defApUsed[slot]) / apTotal(slot)) * 100}%`;

    // ── Move picker ───────────────────────────────────────────────────────
    if ($apMoveRow) {
      const moves = g.moves;
      const selId = _state.selectedMove?.id ?? '';
      if (moves.length === 0) {
        $apMoveRow.innerHTML = `<span class="ap-move-label ap-move-label--empty">No moves assigned \u2014 build your team first.</span>`;
      } else {
        $apMoveRow.innerHTML = moves.map(m => {
          const archCls  = m.archetype ? `arch-${m.archetype.toLowerCase()}` : 'arch-stable';
          const elLabel  = m.element ? m.element.toUpperCase().slice(0, 3) : 'GEN';
          const elIcon   = m.element
            ? Utils.elIconHtml(m.element)
            : m.archetype
              ? Utils.archIconHtml(window.ARCHETYPE_ABBR?.[m.archetype[0].toUpperCase() + m.archetype.slice(1)] ?? '')
              : '<img src="assets/icons/GEN.svg" class="icon-el" alt="GEN" draggable="false">';
          const isActive = m.id === selId;
          return `<button class="ap-move-btn${isActive ? ' active' : ''}"
                          data-move-id="${esc(m.id)}"
                          data-element="${esc(m.element ?? '')}">
            <span class="apmb-el ${archCls}">${elIcon}<span>${esc(elLabel)}</span></span>
            <span class="apmb-name">${esc(m.name)}</span>
            <span class="apmb-pwr">${m.movePower.toFixed(2)}</span>
          </button>`;
        }).join('');

        $apMoveRow.querySelectorAll('.ap-move-btn').forEach(btn => {
          // CSP: set element colour via setProperty after render
          if (btn.dataset.element) {
            btn.style.setProperty('--apmb-el-col', Utils.elColorVar(btn.dataset.element));
          }
          btn.addEventListener('click', () => {
            _state.selectedMove = window.CARDS.find(c => c.id === btn.dataset.moveId) ?? null;
            if (_state.selectedSlot !== null) _state.lastMove[_state.selectedSlot] = _state.selectedMove;
            renderPlanner();
          });
        });
      }
    }

    // ── Attack tier buttons ───────────────────────────────────────────────
    document.querySelectorAll('.tier-btn').forEach(btn => {
      const cost = tierCost(btn.dataset.tier);
      btn.classList.toggle('active', btn.dataset.tier === _state.selectedTier);
      btn.disabled = !_state.selectedMove || cost > rem;
    });

    // ── Defense section ───────────────────────────────────────────────────
    if ($apDefRow) {
      const currDef = _state.defTier[slot];
      if (currDef) {
        const defAp = Engine.DEFENSE_TIERS[currDef]?.cost ?? 0;
        $apDefRow.innerHTML = `
          <span class="ap-def-current">Defending: <strong>${currDef}</strong> (${defAp} AP)</span>
          <button class="def-cancel-btn" id="def-cancel-btn">Cancel</button>`;
        document.getElementById('def-cancel-btn')?.addEventListener('click', () => {
          _state.defApUsed[slot] -= defAp;
          _state.defTier[slot]   = null;
          renderPlanner();
          renderPlayerRow();
        });
      } else {
        $apDefRow.innerHTML = `
          <div class="ap-def-row-inner">
            ${Object.entries(Engine.DEFENSE_TIERS).map(([key, d]) => `
              <button class="def-btn" data-def="${key}" ${d.cost > rem ? 'disabled' : ''}>
                ${key[0].toUpperCase() + key.slice(1)}<small>${d.cost} AP</small>
              </button>`).join('')}
          </div>`;
        $apDefRow.querySelectorAll('.def-btn').forEach(btn =>
          btn.addEventListener('click', () => {
            const dk   = btn.dataset.def;
            const cost = Engine.DEFENSE_TIERS[dk]?.cost ?? 0;
            if (cost > apRemaining(slot)) return;
            _state.defTier[slot]    = dk;
            _state.defApUsed[slot] += cost;
            renderPlanner();
            renderPlayerRow();
          })
        );
      }
    }

    // ── Action queue ──────────────────────────────────────────────────────
    const queue = _state.queues[slot];
    $apQueue.innerHTML = queue.length
      ? queue.map((a, i) => {
          const m = window.CARDS.find(c => c.id === a.moveId);
          return `
            <div class="queue-item">
              <span class="qi-move">${esc(m?.name ?? '?')}</span>
              <span class="qi-tier qi-${a.tier}">${a.tier}</span>
              <span class="qi-arrow">\u2192</span>
              <span class="qi-target">E${a.targetSlot + 1}</span>
              <span class="qi-cost">${a.cost}AP</span>
              <button class="qi-rm" data-slot="${slot}" data-idx="${i}">\u2715</button>
            </div>`;
        }).join('')
      : '<span class="queue-hint-text">Select move, tier, click enemy.</span>';

    $apQueue.querySelectorAll('.qi-rm').forEach(btn =>
      btn.addEventListener('click', () => removeAction(+btn.dataset.slot, +btn.dataset.idx))
    );
  }

  // Short readable labels for tag types in the card Effects row
  const TAG_LABELS = {
    ap_drain:       'AP',      atk_mod:     'ATK',  def_mod:    'DEF',
    hp_regen:       'HP',      dmg_boost:   'DMG',  dmg_reduce: 'DMG',
    reflect_dmg:    'RFLCT',   enchant_remove: 'RMV\u2728',
  };

  function renderHand() {
    $hand.innerHTML = _state.hand.map((c, i) => {
      // ── Affinity chips (targets row) ──────────────────────────────
      const chips = [];
      if (c.archetype) {
        const aAbbr = window.ARCHETYPE_ABBR?.[c.archetype[0].toUpperCase() + c.archetype.slice(1)] ?? '';
        chips.push(`<span class="bc-target-chip bc-target-arch arch-${c.archetype}">${Utils.archIconHtml(aAbbr)}<span>${c.archetype.slice(0, 3).toUpperCase()}</span></span>`);
      }
      if (c.element) {
        chips.push(`<span class="bc-target-chip bc-target-el" data-element="${esc(c.element)}">${Utils.elIconHtml(c.element)}<span>${esc(c.element)}</span></span>`);
      }
      if (!c.archetype && !c.element) {
        chips.push('<span class="bc-target-chip bc-target-global">ANY</span>');
      }

      // ── Tags row ─────────────────────────────────────────────────
      const tagHtml = c.tags?.length
        ? c.tags.map(t => {
            const lbl  = TAG_LABELS[t.type] ?? t.type.replace(/_/g, '\u200b').slice(0, 6);
            const sign = typeof t.value === 'number' && t.value > 0 ? '+' : '';
            const val  = typeof t.value === 'number' ? `${sign}${t.value}` : '';
            const tgt  = t.target === 'target' ? '\u2192' : '\u21ba'; // → self ↺
            return `<span class="bc-tag bc-tag--${t.target}">${tgt}${lbl}${val ? ' ' + val : ''}</span>`;
          }).join('')
        : '';

      return `
        <div class="bc bc--${esc(c.type)}" draggable="true"
             data-hand-idx="${i}" data-card-id="${esc(c.id)}" data-card-type="${esc(c.type)}">
          <div class="bc-header">
            <span class="bc-type-label">${esc(c.type)}</span>
            <span class="bc-type-icon">${CARD_ICONS[c.type] ?? ''}</span>
          </div>
          <div class="bc-art-wrap"><div class="bc-art"></div></div>
          <div class="bc-targets">${chips.join('')}</div>
          <div class="bc-name">${esc(c.name)}</div>
          <div class="bc-desc">${esc(c.effect)}</div>
          ${tagHtml ? `<div class="bc-tags">${tagHtml}</div>` : ''}
        </div>`;
    }).join('');

    // Set element chip colours via setProperty (CSP: no inline styles)
    $hand.querySelectorAll('.bc-target-el[data-element]').forEach(chip => {
      chip.style.setProperty('--bc-el-col', Utils.elColorVar(chip.dataset.element));
    });

    $hand.querySelectorAll('.bc').forEach(card => {
      card.addEventListener('dragstart', () => {
        const idx = parseInt(card.dataset.handIdx, 10);
        const c   = _state.hand[idx];
        _handDrag = { handIdx: idx, cardType: c?.type ?? '', itemSlot: c?.itemSlot ?? null };
      });
      card.addEventListener('dragend', () => { _handDrag = null; });
    });
  }

  function renderDeck() {
    if (!$deckStack || !$deckCount) return;
    const vis = Math.min(4, _state.deckSize);
    $deckStack.innerHTML = Array(vis).fill('<div class="bc-facedown"></div>').join('');
    $deckStack.querySelectorAll('.bc-facedown').forEach((c, i) =>
      c.style.setProperty('--stack-i', i)
    );
    $deckCount.textContent = _state.deckSize;
  }

  function renderReadyBtn() {
    $readyBtn.disabled    = _state.phase !== 'planning' || !_state.queues.some(q => q.length > 0);
    $readyBtn.textContent = '\u2691  Ready';
    $readyBtn.onclick     = null;
  }

  function attachEquipListeners() {
    _state.player.forEach(g => {
      const el        = document.getElementById(`player-${g.slot}`);
      if (!el) return;
      const container = el.closest('.bgc-container') ?? el;
      container.querySelectorAll('.bgc-slot').forEach(slot => {
        slot.addEventListener('dragover', e => {
          if (!_handDrag) return;
          const slotKey = slot.dataset.slotKey;
          const card    = _state.hand[_handDrag.handIdx];
          if (!card || !SLOT_ACCEPTS[slotKey]?.(card)) return;
          e.preventDefault();
          e.stopPropagation();
          slot.classList.add('bgc-slot--hover');
        });
        slot.addEventListener('dragleave', () => slot.classList.remove('bgc-slot--hover'));
        slot.addEventListener('drop', e => {
          e.preventDefault();
          e.stopPropagation();
          slot.classList.remove('bgc-slot--hover');
          if (!_handDrag) return;
          const slotKey   = slot.dataset.slotKey;
          const slotIdx   = parseInt(slot.dataset.slotIdx, 10);
          const golemSlot = parseInt(el.dataset.slot, 10);
          equipCard(golemSlot, _handDrag.handIdx, slotKey, slotIdx);
          _handDrag = null;
        });
      });
    });
  }

  function attachCurseListeners() {
    _state.enemy.forEach(g => {
      const el        = document.getElementById(`enemy-${g.slot}`);
      if (!el) return;
      const container = el.closest('.bgc-container') ?? el;
      container.addEventListener('dragover', e => {
        if (!_handDrag || _handDrag.cardType !== 'curse') return;
        e.preventDefault();
        el.classList.add('bgc--curse-target');
      });
      container.addEventListener('dragleave', e => {
        if (!container.contains(e.relatedTarget))
          el.classList.remove('bgc--curse-target');
      });
      container.addEventListener('drop', e => {
        e.preventDefault();
        el.classList.remove('bgc--curse-target');
        if (!_handDrag || _handDrag.cardType !== 'curse') return;
        equipCurse(g.slot, _handDrag.handIdx);
        _handDrag = null;
      });
    });
  }

  function render() {
    $bRound.textContent = _state.round;
    if (CFG.timerSecs > 0) $bTimer.textContent = _state.timerSecs;
    renderEnemyRow();
    renderPlayerRow();
    renderPlanner();
    renderHand();
    renderDeck();
    renderReadyBtn();
    attachEquipListeners();
    attachCurseListeners();
  }

  // ── Interactions ──────────────────────────────────────────────────────────

  function onPlayerClick(slot) {
    if (_state.phase !== 'planning' || _state.player[slot].defeated) return;
    if (_state.selectedSlot === slot) {
      _state.selectedSlot = null;
    } else {
      _state.selectedSlot = slot;
      const moves = _state.player[slot].moves;
      const lastM = _state.lastMove[slot];
      const valid = lastM && moves.find(m => m.id === lastM.id);
      _state.selectedMove = valid ?? (moves[0] ?? null);
      _state.selectedTier = _state.lastTier[slot] ?? 'standard';
    }
    render();
  }

  function onEnemyClick(slot) {
    if (_state.phase !== 'planning') return;
    const ps = _state.selectedSlot;
    if (ps === null || _state.enemy[slot].defeated || !_state.selectedMove) return;
    const cost = tierCost(_state.selectedTier);
    if (cost > apRemaining(ps)) return;
    _state.queues[ps].push({
      moveId:     _state.selectedMove.id,
      tier:       _state.selectedTier,
      targetSlot: slot,
      cost,
    });
    _state.apUsed[ps] += cost;
    render();
  }

  function removeAction(golemSlot, idx) {
    const a = _state.queues[golemSlot][idx];
    _state.apUsed[golemSlot] -= a.cost;
    _state.queues[golemSlot].splice(idx, 1);
    render();
  }

  // Attack tier buttons — bound once at load
  document.querySelectorAll('.tier-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      if (_state) {
        _state.selectedTier = btn.dataset.tier;
        if (_state.selectedSlot !== null) _state.lastTier[_state.selectedSlot] = _state.selectedTier;
        renderPlanner();
      }
    })
  );

  $readyBtn.addEventListener('click', () => {
    if (!_state || _state.phase !== 'planning') return;
    _state.phase = 'resolving';
    if (_timerId) { clearInterval(_timerId); _timerId = null; }
    $readyBtn.disabled = true;
    $hint.classList.remove('hidden');
    $planner.classList.add('hidden');
    resolveRound();
  });

  // ── Timer ─────────────────────────────────────────────────────────────────

  function startTimer() {
    if (_timerId) clearInterval(_timerId);
    _timerId = setInterval(() => {
      if (!_state || _state.phase !== 'planning') {
        clearInterval(_timerId); _timerId = null; return;
      }
      _state.timerSecs--;
      $bTimer.textContent = Math.max(0, _state.timerSecs);
      if (_state.timerSecs <= 0) {
        clearInterval(_timerId); _timerId = null;
        if (_state.queues.some(q => q.length > 0)) $readyBtn.click();
      }
    }, 1000);
  }

  // ── SVG & animation ───────────────────────────────────────────────────────

  function setupSvg() {
    $arenaSvg.innerHTML = `<defs>
      <marker id="mh-p" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="#c8a043"/>
      </marker>
      <marker id="mh-e" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <polygon points="0 0, 8 3, 0 6" fill="#9b6fd6"/>
      </marker>
    </defs>`;
  }

  function drawArrow(fromEl, toEl, side) {
    const ar    = $arena.getBoundingClientRect();
    const fr    = fromEl.getBoundingClientRect();
    const tr    = toEl.getBoundingClientRect();
    const x1    = fr.left + fr.width  / 2 - ar.left;
    const y1    = fr.top  + fr.height / 2 - ar.top;
    const x2    = tr.left + tr.width  / 2 - ar.left;
    const y2    = tr.top  + tr.height / 2 - ar.top;
    const len   = Math.hypot(x2 - x1, y2 - y1);
    const color  = side === 'player' ? '#c8a043' : '#9b6fd6';
    const markId = `url(#mh-${side === 'player' ? 'p' : 'e'})`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', markId);
    path.style.strokeDasharray  = len;
    path.style.strokeDashoffset = len;
    path.style.transition = 'stroke-dashoffset 0.32s ease';
    $arenaSvg.appendChild(path);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; })
    );
    return path;
  }

  function floatDamage(targetEl, amount) {
    const ar  = $arena.getBoundingClientRect();
    const tr  = targetEl.getBoundingClientRect();
    const div = document.createElement('div');
    div.className   = 'damage-float';
    div.textContent = `-${amount}`;
    div.style.left  = `${tr.left + tr.width / 2 - ar.left}px`;
    div.style.top   = `${tr.top - ar.top + 6}px`;
    $arena.appendChild(div);
    setTimeout(() => div.remove(), 950);
  }

  // ── Resolution ────────────────────────────────────────────────────────────

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function addLog(msg, type = 'action') {
    const el = document.createElement('div');
    el.className   = `log-entry log-${type}`;
    el.textContent = msg;
    $log.appendChild(el);
    $log.scrollTop = $log.scrollHeight;
  }

  async function runAction(side, action) {
    await sleep(350);
    const fallbackMove = window.CARDS.find(c => c.id === 'MOV_GEN_01');

    if (side === 'player') {
      const att    = _state.player[action.pSlot];
      const tgt    = _state.enemy[action.targetSlot];
      if (att.defeated || tgt.defeated) return;
      const move   = window.CARDS.find(c => c.id === action.moveId) ?? fallbackMove;
      const defKey = _state.enemyDefTier[action.targetSlot];
      const result = Engine.computeDamage(att, tgt, move, action.tier, defKey);

      const fromEl = document.getElementById(`player-${action.pSlot}`);
      const toEl   = document.getElementById(`enemy-${action.targetSlot}`);
      const arrow  = drawArrow(fromEl, toEl, 'player');
      await sleep(360);

      tgt.hp = Math.max(0, tgt.hp - result.final);
      if (tgt.hp === 0) tgt.defeated = true;
      floatDamage(toEl, result.final);

      const effPct  = (result.effectiveness * 100).toFixed(0);
      const defNote = defKey ? ` [${defKey}]` : '';
      addLog(
        `  G${action.pSlot + 1} [${action.tier}] ${move.name} \u2192 E${action.targetSlot + 1}${defNote}` +
        `  eff:${effPct}%  DEF-${tgt.def}  \u2212${result.final}`
      );
      renderEnemyRow();
      renderPlayerRow();
      attachEquipListeners();
      attachCurseListeners();
      await sleep(400);
      arrow.remove();

    } else {
      const att    = _state.enemy[action.eSlot];
      const tgt    = _state.player[action.targetSlot];
      if (att.defeated || tgt.defeated) return;
      const move   = window.CARDS.find(c => c.id === action.moveId) ?? fallbackMove;
      const defKey = _state.defTier[action.targetSlot];
      const result = Engine.computeDamage(att, tgt, move, action.tier, defKey);

      const fromEl = document.getElementById(`enemy-${action.eSlot}`);
      const toEl   = document.getElementById(`player-${action.targetSlot}`);
      const arrow  = drawArrow(fromEl, toEl, 'enemy');
      await sleep(360);

      tgt.hp = Math.max(0, tgt.hp - result.final);
      if (tgt.hp === 0) tgt.defeated = true;
      floatDamage(toEl, result.final);

      const effPct  = (result.effectiveness * 100).toFixed(0);
      const defNote = defKey ? ` [${defKey}]` : '';
      addLog(
        `  E${action.eSlot + 1} [${action.tier}] ${move.name} \u2192 G${action.targetSlot + 1}${defNote}` +
        `  eff:${effPct}%  DEF-${tgt.def}  \u2212${result.final}`
      );
      renderEnemyRow();
      renderPlayerRow();
      attachEquipListeners();
      attachCurseListeners();
      await sleep(400);
      arrow.remove();
    }
  }

  function buildEnemyActions() {
    const alivePlayers = _state.player.filter(g => !g.defeated);
    if (!alivePlayers.length) return [];
    const actions = [];

    _state.enemy.forEach(g => {
      if (g.defeated) return;
      const pool = g.moves.length ? g.moves : Engine.movesFor(g.dom, g.pas).filter(m => m.pool !== null);
      const move = pool[Math.floor(Math.random() * pool.length)]
                ?? window.CARDS.find(c => c.id === 'MOV_GEN_01');

      const tierPick = ['standard', 'standard', 'quick', 'charged'];
      const tier     = tierPick[Math.floor(Math.random() * tierPick.length)];
      const tgt      = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

      const defOptions = ['guard', 'taunt', null, null];
      _state.enemyDefTier[g.slot] = defOptions[Math.floor(Math.random() * defOptions.length)];

      actions.push({
        eSlot:      g.slot,
        moveId:     move.id,
        tier,
        targetSlot: tgt.slot,
        cost:       Engine.ATTACK_TIERS[tier]?.cost ?? 4,
      });
    });

    return actions;
  }

  async function resolveRound() {
    // Tick timed effects at start of each round
    _state.player.forEach(g => { if (!g.defeated) tickEffects(g); });
    _state.enemy.forEach(g =>  { if (!g.defeated) tickEffects(g); });

    const pActions = [];
    _state.queues.forEach((q, pSlot) => q.forEach(a => pActions.push({ pSlot, ...a })));
    const eActions = buildEnemyActions();

    addLog(`\u2500\u2500 Round ${_state.round} \u2500\u2500`, 'round');

    const total = Math.max(pActions.length, eActions.length);
    for (let i = 0; i < total; i++) {
      if (i < pActions.length) await runAction('player', pActions[i]);
      if (i < eActions.length) await runAction('enemy',  eActions[i]);
    }

    await sleep(600);

    const playerAlive = _state.player.some(g => !g.defeated);
    const enemyAlive  = _state.enemy.some(g => !g.defeated);

    if (!playerAlive || !enemyAlive) {
      addLog(playerAlive ? '\u2605  Victory!' : '\u2715  Defeat.', playerAlive ? 'victory' : 'defeat');
      _state.phase          = 'roundEnd';
      $hint.textContent     = playerAlive ? 'Victory!' : 'Defeat.';
      $hint.classList.remove('hidden');
      $readyBtn.textContent = '\u2190 Back to Menu';
      $readyBtn.disabled    = false;
      $readyBtn.onclick     = () => window.navigate('view-menu');
      return;
    }

    // Next round — reset round-scoped state; draw 3 new cards
    _state.round++;
    _state.queues       = [[], [], []];
    _state.apUsed       = [0, 0, 0];
    _state.defApUsed    = [0, 0, 0];
    _state.defTier      = [null, null, null];
    _state.enemyDefTier = [null, null, null];
    _state.selectedSlot = null;
    _state.selectedMove = null;
    _state.phase        = 'planning';
    _state.timerSecs    = CFG.timerSecs;

    const newCards = window.buildHand?.(3) ?? [];
    _state.hand.push(...newCards);
    _state.deckSize = Math.max(0, _state.deckSize - newCards.length);

    setupSvg();
    render();
    if (CFG.timerSecs > 0) startTimer();
  }

  // ── Public ────────────────────────────────────────────────────────────────

  window.Battle = {
    init(settings = {}) {
      CFG.timerSecs = settings.timerSecs != null
        ? settings.timerSecs
        : Math.floor((window.config?.game?.roundTimeLimitMs ?? 0) / 1000);
      if (_timerId) { clearInterval(_timerId); _timerId = null; }
      $log.innerHTML = '';
      initState(settings.teamId ?? null);
      setupSvg();
      render();
      if (CFG.timerSecs > 0) startTimer();
    },
    stop() {
      if (_timerId) { clearInterval(_timerId); _timerId = null; }
    },
  };

})();
