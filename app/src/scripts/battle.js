'use strict';

(function () {
  // ── Config ────────────────────────────────────────────────────────────────
  const CFG = {
    timerSecs: 0,
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let _state   = null;
  let _timerId = null;

  // Build a runtime Golem from a team golem record + slot index.
  function makeGolem(golemData, slot) {
    const dom   = golemData.dom;
    const pas   = golemData.pas;
    const stats = window.getGolemStats(dom, pas);
    // Resolve move IDs → card objects; fall back to Engine pool if no moves assigned
    const assignedMoves = (golemData.moves ?? [])
      .map(id => window.CARDS.find(c => c.id === id))
      .filter(Boolean);
    const moves = assignedMoves.length
      ? assignedMoves
      : Engine.movesFor(dom, pas).filter(m => m.pool !== null).slice(0, 4);
    return { slot, dom, pas, moves, hp: stats.hp, maxHp: stats.hp,
             atk: stats.atk, def: stats.def, ap: stats.ap, defeated: false };
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
    _state = {
      round:        1,
      phase:        'planning',
      player:       pGolems,
      enemy: [
        makeGolem({ dom: 'STN', pas: 'VOD', moves: [] }, 0),
        makeGolem({ dom: 'AIR', pas: 'CRY', moves: [] }, 1),
        makeGolem({ dom: 'LIT', pas: 'ICE', moves: [] }, 2),
      ],
      queues:       [[], [], []],        // attack queue per player golem slot
      apUsed:       [0, 0, 0],           // AP spent on attacks
      defApUsed:    [0, 0, 0],           // AP spent on defense
      defTier:      [null, null, null],  // declared defense stance per slot
      enemyDefTier: [null, null, null],
      selectedSlot: null,
      selectedTier: 'standard',
      selectedMove: null,                // active move card object (or null)
      hand:         window.buildHand?.(window.config?.game?.handSize ?? 5) ?? [],
      timerSecs:    CFG.timerSecs,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s)          { return Utils.esc(s); }
  function archClass(id)   { return Utils.archClass(id); }
  function apTotal(slot)   { return _state.player[slot].ap; }
  function apRemaining(slot) {
    return apTotal(slot) - _state.apUsed[slot] - _state.defApUsed[slot];
  }
  function tierCost(tier)  { return Engine.ATTACK_TIERS[tier]?.cost ?? 4; }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const $arenaEnemy  = document.getElementById('arena-enemy');
  const $arenaPlayer = document.getElementById('arena-player');
  const $arenaSvg    = document.getElementById('arena-svg');
  const $arena       = document.getElementById('battle-arena');
  const $log         = document.getElementById('battle-log');
  const $bRound      = document.getElementById('b-round');
  const $bTimer      = document.getElementById('b-timer');
  const $hand        = document.getElementById('battle-hand');
  const $hint        = document.getElementById('action-empty-hint');
  const $planner     = document.getElementById('action-planner');
  const $golemLabel  = document.getElementById('ap-golem-label');
  const $apBarFill   = document.getElementById('ap-bar-fill');
  const $apRemaining = document.getElementById('ap-remaining');
  const $apMoveRow   = document.getElementById('ap-move-row');
  const $apDefRow    = document.getElementById('ap-def-row');
  const $apQueue     = document.getElementById('ap-queue');
  const $readyBtn    = document.getElementById('battle-ready-btn');

  // ── Rendering ─────────────────────────────────────────────────────────────

  function hpBar(g) {
    const pct = Math.max(0, Math.round((g.hp / g.maxHp) * 100));
    const cls = pct > 50 ? 'hp-hi' : pct > 25 ? 'hp-mid' : 'hp-lo';
    return `<div class="ag-hp-bar"><div class="ag-hp-fill ${cls}" style="width:${pct}%"></div></div>
            <div class="ag-hp-num">${g.hp} / ${g.maxHp}</div>`;
  }

  function renderEnemyRow() {
    $arenaEnemy.innerHTML = _state.enemy.map(g => `
      <div class="arena-golem ag-enemy${g.defeated ? ' ag-defeated' : ''}"
           id="enemy-${g.slot}" data-slot="${g.slot}">
        <div class="ag-pairing">
          <span class="ag-el ${archClass(g.dom)}">${esc(g.dom)}</span>
          <span class="ag-sep">/</span>
          <span class="ag-el ${archClass(g.pas)}">${esc(g.pas)}</span>
        </div>
        ${hpBar(g)}
      </div>`).join('');
    if (_state.phase === 'planning') {
      $arenaEnemy.querySelectorAll('.arena-golem').forEach(el =>
        el.addEventListener('click', () => onEnemyClick(+el.dataset.slot))
      );
    }
  }

  function renderPlayerRow() {
    const sel = _state.selectedSlot;
    $arenaPlayer.innerHTML = _state.player.map(g => {
      const atkBadges = _state.queues[g.slot].map(a => {
        const m    = window.CARDS.find(c => c.id === a.moveId);
        const name = m ? m.name.slice(0, 9) : '???';
        return `<span class="ag-badge">${esc(name)} @ ${a.tier[0].toUpperCase()}→E${a.targetSlot + 1}</span>`;
      }).join('');
      const defBadge = _state.defTier[g.slot]
        ? `<span class="ag-badge ag-badge--def">${_state.defTier[g.slot]}</span>` : '';
      return `
        <div class="arena-golem ag-player${g.defeated ? ' ag-defeated' : ''}${sel === g.slot ? ' ag-selected' : ''}"
             id="player-${g.slot}" data-slot="${g.slot}">
          <div class="ag-pairing">
            <span class="ag-el ${archClass(g.dom)}">${esc(g.dom)}</span>
            <span class="ag-sep">/</span>
            <span class="ag-el ${archClass(g.pas)}">${esc(g.pas)}</span>
          </div>
          ${hpBar(g)}
          <div class="ag-badges">${atkBadges}${defBadge}</div>
        </div>`;
    }).join('');
    if (_state.phase === 'planning') {
      $arenaPlayer.querySelectorAll('.arena-golem').forEach(el =>
        el.addEventListener('click', () => onPlayerClick(+el.dataset.slot))
      );
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

    $golemLabel.textContent  = `G${slot + 1} · ${g.dom}/${g.pas} [${breedTier}]  ATK:${g.atk} DEF:${g.def}`;
    $apRemaining.textContent = `${rem} / ${apTotal(slot)} AP`;
    $apBarFill.style.width   = `${((_state.apUsed[slot] + _state.defApUsed[slot]) / apTotal(slot)) * 100}%`;

    // ── Move picker — uses pre-assigned moves from builder ────────────────
    if ($apMoveRow) {
      const moves = g.moves; // pre-assigned card objects
      const selId = _state.selectedMove?.id ?? '';
      if (moves.length === 0) {
        $apMoveRow.innerHTML = `<span class="ap-move-label" style="color:var(--text-muted)">No moves assigned — build your team first.</span>`;
      } else {
        $apMoveRow.innerHTML = `
          <label class="ap-move-label">Move:</label>
          <select class="ap-move-select" id="ap-move-select">
            <option value="">— select move —</option>
            ${moves.map(m => `
              <option value="${esc(m.id)}" ${m.id === selId ? 'selected' : ''}>
                ${esc(m.name)} · pwr ${m.movePower.toFixed(3)} [${esc(m.rarity[0].toUpperCase())}]
              </option>`).join('')}
          </select>`;
        const $sel = document.getElementById('ap-move-select');
        if ($sel) {
          $sel.addEventListener('change', () => {
            _state.selectedMove = window.CARDS.find(c => c.id === $sel.value) ?? null;
            renderPlanner();
          });
        }
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
              <span class="qi-arrow">→</span>
              <span class="qi-target">Enemy ${a.targetSlot + 1}</span>
              <span class="qi-cost">${a.cost} AP</span>
              <button class="qi-rm" data-slot="${slot}" data-idx="${i}">✕</button>
            </div>`;
        }).join('')
      : '<span class="queue-hint-text">Select a move, choose tier, then click an enemy Golem.</span>';

    $apQueue.querySelectorAll('.qi-rm').forEach(btn =>
      btn.addEventListener('click', () => removeAction(+btn.dataset.slot, +btn.dataset.idx))
    );
  }

  function renderHand() {
    $hand.innerHTML = _state.hand.map(c => `
      <div class="hand-card" data-id="${esc(c.id)}">
        <span class="hc-name">${esc(c.name)}</span>
      </div>`).join('');
  }

  function renderReadyBtn() {
    $readyBtn.disabled    = _state.phase !== 'planning' || !_state.queues.some(q => q.length > 0);
    $readyBtn.textContent = '⚑  Ready';
    $readyBtn.onclick     = null;
  }

  function render() {
    $bRound.textContent = _state.round;
    if (CFG.timerSecs > 0) $bTimer.textContent = _state.timerSecs;
    renderEnemyRow();
    renderPlayerRow();
    renderPlanner();
    renderHand();
    renderReadyBtn();
  }

  // ── Interactions ──────────────────────────────────────────────────────────

  function onPlayerClick(slot) {
    if (_state.phase !== 'planning' || _state.player[slot].defeated) return;
    if (_state.selectedSlot === slot) {
      _state.selectedSlot = null;
    } else {
      _state.selectedSlot = slot;
      // Auto-select first assigned move when switching Golem
      const moves = _state.player[slot].moves;
      if (!_state.selectedMove && moves.length) _state.selectedMove = moves[0];
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
      if (_state) { _state.selectedTier = btn.dataset.tier; renderPlanner(); }
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
        `  G${action.pSlot + 1} [${action.tier}] ${move.name} → E${action.targetSlot + 1}${defNote}` +
        `  eff:${effPct}%  DEF-${tgt.def}  −${result.final}`
      );
      renderEnemyRow();
      renderPlayerRow();
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
        `  E${action.eSlot + 1} [${action.tier}] ${move.name} → G${action.targetSlot + 1}${defNote}` +
        `  eff:${effPct}%  DEF-${tgt.def}  −${result.final}`
      );
      renderEnemyRow();
      renderPlayerRow();
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
      // Enemy uses its pre-assigned moves (or falls back to pool)
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
    const pActions = [];
    _state.queues.forEach((q, pSlot) => q.forEach(a => pActions.push({ pSlot, ...a })));
    const eActions = buildEnemyActions();

    addLog(`── Round ${_state.round} ──`, 'round');

    const total = Math.max(pActions.length, eActions.length);
    for (let i = 0; i < total; i++) {
      if (i < pActions.length) await runAction('player', pActions[i]);
      if (i < eActions.length) await runAction('enemy',  eActions[i]);
    }

    await sleep(600);

    const playerAlive = _state.player.some(g => !g.defeated);
    const enemyAlive  = _state.enemy.some(g => !g.defeated);

    if (!playerAlive || !enemyAlive) {
      addLog(playerAlive ? '★  Victory!' : '✕  Defeat.', playerAlive ? 'victory' : 'defeat');
      _state.phase          = 'roundEnd';
      $hint.textContent     = playerAlive ? 'Victory!' : 'Defeat.';
      $hint.classList.remove('hidden');
      $readyBtn.textContent = '← Back to Menu';
      $readyBtn.disabled    = false;
      $readyBtn.onclick     = () => window.navigate('view-menu');
      return;
    }

    // Next round — reset round-scoped state
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
