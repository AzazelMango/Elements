# Battle UI Refactor — Implementation Plan

> **Target model:** Claude Sonnet / GPT-4o (code-heavy pass)
> **Authored by:** Claude Sonnet 4.6 (reasoning pass, 2026-06-06)

---

## Overview

Three concurrent goals:
1. **Golem Battle Cards** — rich cards replacing the plain `.arena-golem` divs; gradient swatch image, HP bar, stats row, equipment slots, queued-action badges
2. **Typed Hand Cards + Deck** — colour-coded cards per type (Curse/Enchant/Item/Special) with fully wired drag-to-equip logic; Deck stack + count alongside Hand in one div
3. **2-Column Action Planner** — Left col: Attack (move picker + tier buttons + queue); Right col: Defense stance

---

## Files to modify

| File | Changes |
|------|---------|
| `app/src/index.html` | Replace `<!-- Battle -->` div entirely |
| `app/src/assets/style.css` | Append new sections; remove listed old selectors |
| `app/src/scripts/battle.js` | State additions, all render functions, equip logic |

**Do NOT touch:** `engine.js`, `state.js`, `golems.js`, `elements.js`, `cards.js`, `utils.js`, `builder.js`

---

## Context: existing globals available in battle.js

```
window.CARDS          — all card objects (id, name, type, effect, tags[], itemSlot, durability, rarity)
window.ELEMENTS       — element definitions (id, name, archetype)
window.Engine         — { ATTACK_TIERS, DEFENSE_TIERS, computeDamage, movesFor }
window.Utils          — { esc, archClass, elClass, elColorVar, elDimVar, archAbbr }
window.getGolemStats  — (dom, pas) → { hp, ap, atk, def }
window.getBreedTier   — (dom, pas) → 'T1'|'T2'|'T3'
```

Card schema fields used here:
- `type`: `'move'|'curse'|'enchantment'|'item'|'special'`
- `itemSlot`: `'primary'|'secondary'|'armour'|'dual'|null` (items only)
- `tags[]`: `{ type: string, value: number, target: 'self'|'target', duration: number }`
- `durability`: number of rounds the item lasts; `1` = consumable

---

## 1. State changes (`battle.js`)

### 1a. Module-level additions

Add these alongside `let _state` and `let _timerId`:

```js
let _handDrag = null; // { handIdx, cardType, itemSlot }
```

### 1b. `makeGolem` — add `equipped`, `name`, `effects`, `equippedAtkMod`, `equippedDefMod`

Replace the returned object literal so it includes:

```js
return {
  slot, dom, pas, moves,
  name: `${dom}/${pas}`,
  hp: stats.hp, maxHp: stats.hp,
  atk: stats.atk, def: stats.def, ap: stats.ap,
  defeated: false,
  // Active round-based effect tokens: [{type, value, duration, source}]
  effects: [],
  // Equipment: these mirror the slot layout on the Golem Battle Card
  equipped: {
    primary:    null,          // item (itemSlot 'primary' or 'dual')
    secondary:  null,          // item (itemSlot 'secondary' or 'dual')
    armour:     null,          // item (itemSlot 'armour')
    enchants:   [null, null],  // enchantment cards
    curses:     [null, null, null], // curse cards applied BY opponent TO this golem
  },
};
```

### 1c. `initState` — add `deck` / `deckSize`

Add to the `_state` object:

```js
deck:     [],      // visual only for now
deckSize: window.CARDS.filter(c => c.type !== 'move').length,
```

### 1d. New constant: `CARD_ICONS` + `SLOT_ACCEPTS`

Place near the top of the IIFE, after `CFG`:

```js
const CARD_ICONS = {
  curse:        '\u2620',   // ☠
  enchantment:  '\u2728',   // ✨
  item:         '\u265f',   // ♟
  special:      '\ud83c\udf1f', // 🌟
};

// Which card types each slot accepts (for drag validation)
const SLOT_ACCEPTS = {
  primary:    (c) => c.type === 'item' && (c.itemSlot === 'primary' || c.itemSlot === 'dual'),
  secondary:  (c) => c.type === 'item' && (c.itemSlot === 'secondary' || c.itemSlot === 'dual'),
  armour:     (c) => c.type === 'item' && c.itemSlot === 'armour',
  enchant:    (c) => c.type === 'enchantment',
  curse:      (c) => c.type === 'curse',   // cursing an enemy golem
};
```

### 1e. New function: `equipCard(golemSlot, handIdx, slotKey, arrayIdx)`

Called on drop to a golem slot. `slotKey` = `'primary'|'secondary'|'armour'|'enchant'|'curse'`. `arrayIdx` only used for enchant/curse (0 or 1/2).

```js
function equipCard(golemSlot, handIdx, slotKey, arrayIdx) {
  const g    = _state.player[golemSlot];
  const card = _state.hand[handIdx];
  if (!g || !card) return false;
  if (!SLOT_ACCEPTS[slotKey]?.(card)) return false;

  const arrSlots = ['enchant', 'curse'];
  const fieldMap = { primary: 'primary', secondary: 'secondary', armour: 'armour',
                     enchant: 'enchants', curse: 'curses' };
  const field = fieldMap[slotKey];
  if (!field) return false;

  if (arrSlots.includes(slotKey)) {
    if (g.equipped[field][arrayIdx] !== null) return false;
    g.equipped[field][arrayIdx] = card;
  } else {
    if (g.equipped[field] !== null) return false;
    // 'dual' items occupy both primary AND secondary
    if (card.itemSlot === 'dual') {
      if (g.equipped.primary !== null || g.equipped.secondary !== null) return false;
      g.equipped.primary   = card;
      g.equipped.secondary = card; // same reference marks both slots occupied
    } else {
      g.equipped[field] = card;
    }
  }

  // Apply immediate + register timed effects
  applyCardEffects(g, card);

  // Remove from hand
  _state.hand.splice(handIdx, 1);
  render();
  return true;
}
```

### 1f. New function: `applyCardEffects(golem, card)`

```js
function applyCardEffects(golem, card) {
  if (!card.tags) return;
  card.tags.forEach(tag => {
    if (tag.target !== 'self') return; // curse/target effects applied elsewhere
    if (tag.duration === 1) {
      // Immediate one-shot
      if (tag.type === 'hp_gain')  golem.hp = Math.min(golem.maxHp, golem.hp + tag.value);
      if (tag.type === 'ap_gain')  golem.ap += tag.value; // lasts this round only
    } else {
      // Register for repeated application each round
      golem.effects.push({ type: tag.type, value: tag.value, duration: tag.duration,
                           source: card.id });
    }
  });
}
```

### 1g. `equipCurse(enemySlot, handIdx)` — curse an ENEMY golem

```js
function equipCurse(enemySlot, handIdx) {
  const g    = _state.enemy[enemySlot];
  const card = _state.hand[handIdx];
  if (!g || !card || card.type !== 'curse') return false;
  const idx = g.equipped.curses.indexOf(null);
  if (idx < 0) return false; // all 3 curse slots full
  g.equipped.curses[idx] = card;
  // Apply timed debuff effects to enemy
  card.tags?.forEach(tag => {
    if (tag.target !== 'target') return;
    g.effects.push({ type: tag.type, value: tag.value, duration: tag.duration,
                     source: card.id });
  });
  _state.hand.splice(handIdx, 1);
  render();
  return true;
}
```

### 1h. `tickEffects(golem)` — called at round start in `resolveRound`

```js
function tickEffects(golem) {
  golem.effects.forEach(eff => {
    switch (eff.type) {
      case 'hp_drain': golem.hp  = Math.max(0, golem.hp + eff.value); break; // value is negative
      case 'hp_gain':  golem.hp  = Math.min(golem.maxHp, golem.hp + eff.value); break;
      case 'atk_mod':  golem.atk = Math.max(0, golem.atk + eff.value); break;
      case 'def_mod':  golem.def = Math.max(0, golem.def + eff.value); break;
      case 'ap_gain':  golem.ap += eff.value; break;
      case 'ap_drain': golem.ap  = Math.max(0, golem.ap + eff.value); break;
    }
    eff.duration--;
  });
  golem.effects = golem.effects.filter(e => e.duration > 0);
}
```

In `resolveRound()`, at the very start (before running actions), add:
```js
_state.player.forEach(g => { if (!g.defeated) tickEffects(g); });
_state.enemy.forEach(g =>  { if (!g.defeated) tickEffects(g); });
```

---

## 2. HTML — replace `<!-- Battle -->` section in `index.html`

Replace everything from `<!-- Battle -->` to the closing `</div><!-- /#view-battle -->` with:

```html
<!-- Battle -->
<div id="view-battle" class="view">
  <div class="battle-layout">

    <!-- Left sidebar: nav + log -->
    <aside class="battle-sidebar">
      <div class="bs-top">
        <button class="back-btn" id="btn-battle-back">&#8592; Menu</button>
        <div class="bs-stat-row">
          <span class="bs-stat-label">Round</span>
          <span class="bs-stat-value" id="b-round">1</span>
        </div>
        <div class="bs-stat-row">
          <span class="bs-stat-label">Time</span>
          <span class="bs-timer" id="b-timer">&#8212;</span>
        </div>
      </div>
      <div class="bs-log-header">Battle Log</div>
      <div class="battle-log" id="battle-log"></div>
    </aside>

    <!-- Right: arena + bottom -->
    <div class="battle-right">

      <!-- Arena: enemy top, SVG overlay, player bottom -->
      <section class="battle-arena" id="battle-arena">
        <div class="arena-enemy-row" id="arena-enemy"></div>
        <svg class="arena-svg" id="arena-svg" width="100%" height="100%"
             xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="arena-player-row" id="arena-player"></div>
      </section>

      <!-- Bottom: [Deck | Hand] + [Action Planner] -->
      <section class="battle-bottom">

        <!-- Card area: deck stack (left) + hand row (right) -->
        <div class="battle-card-area">
          <div class="bca-deck" id="battle-deck">
            <div class="bca-deck-label">Deck</div>
            <div class="bca-deck-stack" id="deck-stack"></div>
            <div class="bca-deck-count" id="deck-count">&#8212;</div>
          </div>
          <div class="bca-hand" id="battle-hand"></div>
        </div>

        <!-- Action planner -->
        <div class="battle-action-panel">
          <div class="bap-hint" id="action-empty-hint">Select a Golem to plan actions.</div>

          <div class="action-planner hidden" id="action-planner">

            <!-- AP header spanning full width -->
            <div class="ap-header">
              <span class="ap-golem-label" id="ap-golem-label">&#8212;</span>
              <div class="ap-bar-wrap">
                <div class="ap-bar-track"><div class="ap-bar-fill" id="ap-bar-fill"></div></div>
                <span class="ap-remaining" id="ap-remaining">&#8212;</span>
              </div>
            </div>

            <!-- Two columns -->
            <div class="ap-columns">

              <!-- LEFT: Attack -->
              <div class="ap-col ap-col--attack">
                <div class="ap-col-hdr">Attack</div>
                <div class="ap-move-row" id="ap-move-row"></div>
                <div class="ap-tier-row">
                  <button class="tier-btn" data-tier="quick">Quick<small>2 AP</small></button>
                  <button class="tier-btn" data-tier="standard">Standard<small>4 AP</small></button>
                  <button class="tier-btn" data-tier="charged">Charged<small>6 AP</small></button>
                  <button class="tier-btn" data-tier="focused">Focused<small>8 AP</small></button>
                </div>
                <div class="ap-queue" id="ap-queue"></div>
              </div>

              <!-- RIGHT: Defense -->
              <div class="ap-col ap-col--defense">
                <div class="ap-col-hdr">Defense</div>
                <div class="ap-def-row" id="ap-def-row"></div>
              </div>

            </div><!-- /.ap-columns -->
          </div><!-- /#action-planner -->

          <button class="battle-ready-btn" id="battle-ready-btn" disabled>&#9873; Ready</button>
        </div><!-- /.battle-action-panel -->

      </section><!-- /.battle-bottom -->
    </div><!-- /.battle-right -->
  </div><!-- /.battle-layout -->
</div><!-- /#view-battle -->
```

---

## 3. Golem Battle Card HTML structure

Replace `renderEnemyRow()` and `renderPlayerRow()` with two thin wrappers over a shared `renderGolemCard(g, side, isSelected)` function.

### `renderGolemCard(g, side, isSelected)` — returns HTML string

`side` = `'player'` or `'enemy'`. Player-side golem cards have drop-target equipment slots.

```html
<div class="bgc bgc--{side} {bgc--defeated?} {bgc--selected?}"
     id="{side}-{slot}" data-slot="{slot}">

  <!-- Row 1: Name + Tier badge -->
  <div class="bgc-header">
    <span class="bgc-name">{dom}/{pas}</span>
    <span class="bgc-tier bgc-tier--{T1|T2|T3}">{T1|T2|T3}</span>
  </div>

  <!-- Row 2: Swatch frame (gradient applied via JS setProperty after render) -->
  <div class="bgc-frame">
    <span class="bgc-el bgc-el--dom {archClass(dom)}">{dom}</span>
    <span class="bgc-el bgc-el--pas {archClass(pas)}">{pas}</span>
  </div>

  <!-- Row 3: HP bar (width set via JS setProperty) -->
  <div class="bgc-hp">
    <div class="bgc-hp-track">
      <div class="bgc-hp-fill {hp-hi|hp-mid|hp-lo}" id="hpf-{side}-{slot}"></div>
    </div>
    <span class="bgc-hp-text">{hp} / {maxHp}</span>
  </div>

  <!-- Row 4: Stats -->
  <div class="bgc-stats">
    <span class="bgc-stat bgc-stat--atk">ATK {atk}</span>
    <span class="bgc-stat bgc-stat--def">DEF {def}</span>
    <span class="bgc-stat bgc-stat--ap">AP {ap}</span>
  </div>

  <!-- Row 5: Equipment slots -->
  <div class="bgc-equip">
    <div class="bgc-slot {bgc-slot--filled?} {bc--item?}" data-slot-key="primary"   data-slot-idx="0">
      {empty: ♟ | filled: CARD_ICONS[type] + shortName}
    </div>
    <div class="bgc-slot {bgc-slot--filled?}" data-slot-key="secondary"  data-slot-idx="0">...</div>
    <div class="bgc-slot {bgc-slot--filled?}" data-slot-key="armour"     data-slot-idx="0">...</div>
    <div class="bgc-slot {bgc-slot--filled?}" data-slot-key="enchant"    data-slot-idx="0">...</div>
    <div class="bgc-slot {bgc-slot--filled?}" data-slot-key="enchant"    data-slot-idx="1">...</div>
    <div class="bgc-slot bgc-slot--latent {bgc-slot--filled?}" data-slot-key="curse" data-slot-idx="0">...</div>
    <div class="bgc-slot bgc-slot--latent {bgc-slot--filled?}" data-slot-key="curse" data-slot-idx="1">...</div>
    <div class="bgc-slot bgc-slot--latent {bgc-slot--filled?}" data-slot-key="curse" data-slot-idx="2">...</div>
  </div>

  <!-- Row 6: Queued badges -->
  <div class="bgc-badges" id="bgc-badges-{side}-{slot}"></div>
</div>
```

**Slot fill logic** (in the template):
- Empty slot: show faint type icon (♟ for primary/secondary/armour, ✨ for enchant, ☠ for curse)
- Filled slot: add class `bgc-slot--filled bc--{card.type}`, show `CARD_ICONS[type]` + 6-char name truncated
- Curse slots: add class `bgc-slot--latent` when empty (they visually fade); remove when filled
- "Dual" item fills BOTH primary AND secondary slots with the same card reference

**After `$arenaPlayer.innerHTML = ...` and `$arenaEnemy.innerHTML = ...`**, run a post-render setup loop:

```js
function postRenderGolemCards(side) {
  const golems = side === 'player' ? _state.player : _state.enemy;
  golems.forEach(g => {
    const el = document.getElementById(`${side}-${g.slot}`);
    if (!el) return;

    // Gradient swatch
    const frame = el.querySelector('.bgc-frame');
    frame.style.setProperty('--bgc-dom', Utils.elDimVar(g.dom));
    frame.style.setProperty('--bgc-pas', Utils.elDimVar(g.pas) || Utils.elDimVar(g.dom));

    // HP bar width
    const pct   = Math.max(0, Math.round((g.hp / g.maxHp) * 100));
    const hpFill = el.querySelector('.bgc-hp-fill');
    hpFill.style.setProperty('--hp-pct', pct + '%');
    // hp class is set in HTML template (hp-hi/mid/lo) so no class change needed here
    // unless you want to update it separately — setting the CSS var is sufficient
  });
}
```

Call `postRenderGolemCards('player')` after `$arenaPlayer.innerHTML = ...`  
Call `postRenderGolemCards('enemy')` after `$arenaEnemy.innerHTML = ...`

### Equipment slot drag listeners (player side only)

After rendering player cards, wire drop targets:

```js
function attachEquipListeners() {
  _state.player.forEach(g => {
    const el = document.getElementById(`player-${g.slot}`);
    if (!el) return;
    el.querySelectorAll('.bgc-slot').forEach(slot => {
      slot.addEventListener('dragover', e => {
        if (!_handDrag) return;
        const slotKey = slot.dataset.slotKey;
        const card    = _state.hand[_handDrag.handIdx];
        if (!card || !SLOT_ACCEPTS[slotKey]?.(card)) return;
        e.preventDefault();
        slot.classList.add('bgc-slot--hover');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('bgc-slot--hover'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('bgc-slot--hover');
        if (!_handDrag) return;
        const slotKey  = slot.dataset.slotKey;
        const slotIdx  = parseInt(slot.dataset.slotIdx, 10);
        const golemSlot = parseInt(el.dataset.slot, 10);
        equipCard(golemSlot, _handDrag.handIdx, slotKey, slotIdx);
      });
    });
  });
}
```

### Enemy curse-drop listeners

```js
function attachCurseListeners() {
  _state.enemy.forEach(g => {
    const el = document.getElementById(`enemy-${g.slot}`);
    if (!el) return;
    el.addEventListener('dragover', e => {
      if (!_handDrag || _handDrag.cardType !== 'curse') return;
      e.preventDefault();
      el.classList.add('bgc--curse-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('bgc--curse-target'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('bgc--curse-target');
      if (!_handDrag || _handDrag.cardType !== 'curse') return;
      equipCurse(g.slot, _handDrag.handIdx);
    });
  });
}
```

Call `attachEquipListeners()` and `attachCurseListeners()` at the end of `render()`.

---

## 4. Hand card HTML structure

Rewrite `renderHand()`:

```js
function renderHand() {
  $hand.innerHTML = _state.hand.map((c, i) => `
    <div class="bc bc--${Utils.esc(c.type)}" draggable="true"
         data-hand-idx="${i}" data-card-id="${Utils.esc(c.id)}" data-card-type="${Utils.esc(c.type)}">
      <div class="bc-type-icon">${CARD_ICONS[c.type] ?? ''}</div>
      <div class="bc-art"></div>
      <div class="bc-name">${Utils.esc(c.name)}</div>
      <div class="bc-effect">${Utils.esc(c.effect)}</div>
    </div>`).join('');

  $hand.querySelectorAll('.bc').forEach(card => {
    card.addEventListener('dragstart', () => {
      const i    = parseInt(card.dataset.handIdx, 10);
      const c    = _state.hand[i];
      _handDrag  = { handIdx: i, cardType: c?.type ?? '', itemSlot: c?.itemSlot ?? null };
    });
    card.addEventListener('dragend', () => { _handDrag = null; });
  });
}
```

---

## 5. Deck visual

Add `renderDeck()` and call it from `render()`:

```js
const $deck      = document.getElementById('battle-deck');   // outer container
const $deckStack = document.getElementById('deck-stack');
const $deckCount = document.getElementById('deck-count');

function renderDeck() {
  if (!$deckStack || !$deckCount) return;
  const vis = Math.min(4, _state.deckSize);
  $deckStack.innerHTML = Array(vis).fill('<div class="bc-facedown"></div>').join('');
  // Stack offset via setProperty (avoids inline style in template)
  $deckStack.querySelectorAll('.bc-facedown').forEach((c, i) => {
    c.style.setProperty('--stack-i', i);
  });
  $deckCount.textContent = _state.deckSize;
}
```

---

## 6. Planner changes

The `renderPlanner()` function needs minimal structural changes:
- AP bar already targets `$apBarFill` (DOM property, not template literal) — keep as-is
- `$apMoveRow` rendering: remove the `style="color:..."` inline style; replace with `class="ap-move-empty-hint"` and style via CSS
- `$apDefRow` and `$apQueue` are already separate DOM refs — they now sit in separate columns per the new HTML, so no JS changes needed for the split (the HTML layout handles it)
- `$apBarFill.style.width = ...` is a DOM property assignment — CSP-safe, keep as-is

**One change:** Remove `style="color:var(--text-muted)"` from the no-moves-assigned message:
```js
// BEFORE:
$apMoveRow.innerHTML = `<span class="ap-move-label" style="color:var(--text-muted)">No moves…</span>`;
// AFTER:
$apMoveRow.innerHTML = `<span class="ap-move-label ap-move-label--empty">No moves assigned — build your team first.</span>`;
```

---

## 7. `render()` additions

```js
function render() {
  $bRound.textContent = _state.round;
  if (CFG.timerSecs > 0) $bTimer.textContent = _state.timerSecs;
  renderEnemyRow();      // now calls renderGolemCard + postRenderGolemCards('enemy')
  renderPlayerRow();     // now calls renderGolemCard + postRenderGolemCards('player')
  renderPlanner();
  renderHand();
  renderDeck();          // NEW
  renderReadyBtn();
  attachEquipListeners();  // NEW — rewires after every render
  attachCurseListeners();  // NEW
}
```

---

## 8. CSS — append these sections to `style.css`

Group each section with its comment header. **Do not edit existing rules unless listed in section 9.**

```css
/* ── Battle Golem Card (bgc) ──────────────────────────────────────────── */

.bgc {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  background: var(--bg-card);
  border: 1px solid var(--border-dim);
  border-radius: 4px;
  padding: 0.55rem 0.5rem;
  cursor: pointer;
  min-width: 145px;
  max-width: 185px;
  position: relative;
  transition: outline 0.1s;
  user-select: none;
}
.bgc--selected   { outline: 2px solid var(--accent-gold); outline-offset: 2px; }
.bgc--defeated   { opacity: 0.38; pointer-events: none; }
.bgc--curse-target { outline: 2px dashed #8f0000; outline-offset: 2px; }

/* Header */
.bgc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.3rem;
}
.bgc-name { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em; }
.bgc-tier {
  font-size: 0.58rem;
  font-weight: 700;
  padding: 0.08rem 0.3rem;
  border-radius: 2px;
  flex-shrink: 0;
}
.bgc-tier--T1 { background: var(--accent-gold); color: #000; }
.bgc-tier--T2 { background: #888; color: #fff; }
.bgc-tier--T3 { background: #444; color: #aaa; }

/* Swatch frame: gradient set via JS setProperty(--bgc-dom / --bgc-pas) */
.bgc-frame {
  position: relative;
  height: 60px;
  border-radius: 3px;
  background: linear-gradient(130deg,
    var(--bgc-dom, var(--bg-secondary)) 0%,
    var(--bgc-pas, var(--bg-tertiary)) 100%);
  overflow: hidden;
}
.bgc-el {
  position: absolute;
  bottom: 3px;
  font-size: 0.54rem;
  font-weight: 700;
  padding: 0.1rem 0.22rem;
  border-radius: 2px;
  background: rgba(0,0,0,0.6);
  line-height: 1;
  letter-spacing: 0.03em;
}
.bgc-el--dom { left: 3px; }
.bgc-el--pas { right: 3px; }

/* HP bar — width controlled by --hp-pct custom prop (set via JS) */
.bgc-hp { display: flex; flex-direction: column; gap: 0.1rem; }
.bgc-hp-track {
  height: 7px;
  background: var(--bg-secondary);
  border-radius: 2px;
  overflow: hidden;
}
.bgc-hp-fill {
  height: 100%;
  width: var(--hp-pct, 100%);
  transition: width 0.3s ease;
}
.bgc-hp-fill.hp-hi  { background: #4caf50; }
.bgc-hp-fill.hp-mid { background: #ff9800; }
.bgc-hp-fill.hp-lo  { background: #f44336; }
.bgc-hp-text { font-size: 0.6rem; text-align: right; color: var(--text-muted); }

/* Stats row */
.bgc-stats {
  display: flex;
  gap: 0.5rem;
  font-size: 0.62rem;
}
.bgc-stat--atk { color: #e57373; }
.bgc-stat--def { color: #64b5f6; }
.bgc-stat--ap  { color: var(--accent-gold); }

/* Equipment slots */
.bgc-equip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.18rem;
}
.bgc-slot {
  width: 20px;
  height: 20px;
  border: 1px dashed var(--border-dim);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.62rem;
  background: var(--bg-secondary);
  transition: border-color 0.1s, background 0.1s;
  cursor: default;
  overflow: hidden;
  flex-shrink: 0;
}
/* Per-slot type colour */
.bgc-slot[data-slot-key="primary"],
.bgc-slot[data-slot-key="secondary"] { border-color: #060671; }
.bgc-slot[data-slot-key="armour"]    { border-color: #555; }
.bgc-slot[data-slot-key="enchant"]   { border-color: #066506; }
.bgc-slot[data-slot-key="curse"]     { border-color: #8f0000; }
/* Latent curse slots are invisible until filled */
.bgc-slot--latent:not(.bgc-slot--filled) { border-style: dotted; opacity: 0.35; }
/* Hover when a valid card is dragged over */
.bgc-slot--hover {
  border-style: solid;
  background: color-mix(in srgb, var(--accent-gold) 18%, var(--bg-secondary));
}
/* Filled slot */
.bgc-slot--filled { border-style: solid; cursor: pointer; font-size: 0.5rem; }
/* Filled slot inherits card type colour */
.bgc-slot--filled.bc--curse       { border-color: #8f0000; background: rgba(211,13,13,0.18); }
.bgc-slot--filled.bc--enchantment { border-color: #066506; background: rgba(18,177,18,0.18); }
.bgc-slot--filled.bc--item        { border-color: #060671; background: rgba(10,44,192,0.18); }
.bgc-slot--filled.bc--special     { border-color: #4e024d; background: rgba(141,10,139,0.18); }

/* Badges row */
.bgc-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.18rem;
  min-height: 0;
}
.bgc-badge {
  font-size: 0.54rem;
  padding: 0.1rem 0.28rem;
  border-radius: 2px;
  background: var(--bg-secondary);
  color: var(--text-muted);
  white-space: nowrap;
}
.bgc-badge--def { background: #0d2740; color: #90caf9; }
.bgc-badge--atk { background: #2a0d0d; color: #ef9a9a; }

/* ── Battle Card — hand cards ──────────────────────────────────────────── */

.bc {
  display: flex;
  flex-direction: column;
  width: 70px;
  min-height: 100px;
  border: 2px solid var(--card-border, var(--border-dim));
  border-radius: 4px;
  background: var(--card-bg-tint, var(--bg-card));
  padding: 0.25rem;
  cursor: grab;
  flex-shrink: 0;
  position: relative;
  transition: transform 0.1s, box-shadow 0.1s;
}
.bc:active { cursor: grabbing; }
.bc:hover {
  transform: translateY(-7px);
  box-shadow: 0 8px 18px rgba(0,0,0,0.45);
  z-index: 10;
}
/* Per-type theming */
.bc--curse       { --card-border: #8f0000; --card-bg-tint: rgba(211,13,13,0.10); }
.bc--enchantment { --card-border: #066506; --card-bg-tint: rgba(18,177,18,0.10); }
.bc--item        { --card-border: #060671; --card-bg-tint: rgba(10,44,192,0.10); }
.bc--special     { --card-border: #4e024d; --card-bg-tint: rgba(141,10,139,0.10); }

.bc-type-icon {
  position: absolute;
  top: 3px;
  right: 4px;
  font-size: 0.75rem;
  line-height: 1;
}
.bc-art {
  height: 34px;
  background: var(--bg-secondary);
  border-radius: 2px;
  margin-bottom: 0.2rem;
  flex-shrink: 0;
}
.bc-name {
  font-size: 0.56rem;
  font-weight: 700;
  line-height: 1.25;
  word-break: break-word;
}
.bc-effect {
  font-size: 0.5rem;
  color: var(--text-muted);
  line-height: 1.3;
  margin-top: 0.12rem;
  overflow: hidden;
  flex: 1;
}

/* Face-down deck card */
.bc-facedown {
  width: 70px;
  height: 100px;
  border: 2px solid var(--border-dim);
  border-radius: 4px;
  background: var(--bg-tertiary);
  position: absolute;
  /* --stack-i set via JS setProperty; creates stacked illusion */
  top:  calc(var(--stack-i, 0) * -3px);
  left: calc(var(--stack-i, 0) *  2px);
}

/* ── Battle card area (deck + hand) ────────────────────────────────────── */

.battle-card-area {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  padding: 0.4rem 0.5rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.bca-deck {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.bca-deck-label { font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.08em; }
.bca-deck-stack {
  position: relative;
  width: 70px;
  height: 100px;
}
.bca-deck-count { font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); }
.bca-hand {
  display: flex;
  align-items: flex-end;
  gap: 0.32rem;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 0.15rem;
}

/* ── Battle bottom layout ──────────────────────────────────────────────── */

.battle-bottom {
  display: flex;
  gap: 0.6rem;
  padding: 0.4rem 0.5rem;
  flex-shrink: 0;
  height: 210px;
  border-top: 1px solid var(--border-dim);
  overflow: hidden;
}
.battle-action-panel {
  display: flex;
  flex-direction: column;
  min-width: 340px;
  flex: 0 0 auto;
}

/* ── Action planner 2-column ───────────────────────────────────────────── */

.ap-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--border-dim);
  margin-bottom: 0.25rem;
}
.ap-bar-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.ap-columns {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.ap-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  min-width: 0;
  overflow-y: auto;
}
.ap-col-hdr {
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-dim);
  padding-bottom: 0.18rem;
  flex-shrink: 0;
}

/* No-moves hint — replaces old inline style */
.ap-move-label--empty { color: var(--text-muted); font-size: 0.78rem; }
```

---

## 9. Old CSS rules to remove from `style.css`

Search for and **delete** these rule blocks (they are superseded by the above):

| Selector | Reason |
|----------|--------|
| `.arena-golem` | Replaced by `.bgc` |
| `.ag-enemy`, `.ag-player`, `.ag-selected`, `.ag-defeated` | Replaced by `.bgc--*` |
| `.ag-pairing` | Removed |
| `.ag-el`, `.ag-sep` | Removed |
| `.ag-hp-bar`, `.ag-hp-fill`, `.ag-hp-num` | Replaced by `.bgc-hp*` |
| `.ag-badges`, `.ag-badge`, `.ag-badge--def` | Replaced by `.bgc-badges`, `.bgc-badge*` |
| `.battle-hand` | Renamed to `.bca-hand` |
| `.hand-card`, `.hc-name` | Replaced by `.bc`, `.bc-name` |

Keep everything else: `.battle-layout`, `.battle-sidebar`, `.bs-*`, `.battle-arena`,
`.arena-enemy-row`, `.arena-player-row`, `.arena-svg`, `.battle-right`,
`.damage-float`, `.tier-btn`, `.queue-item`, `.qi-*`, `.ap-bar-track`, `.ap-bar-fill`,
`.battle-ready-btn`, `.bap-hint`, `.action-planner`, `.ap-golem-label`, `.ap-remaining`,
`.ap-move-row`, `.ap-move-label` (keep, but add new `.ap-move-label--empty`),
`.ap-tier-row`, `.ap-def-row`, `.ap-queue`.

---

## 10. Implementation order

1. **`battle.js` — state** (sections 1a–1h): `_handDrag`, `CARD_ICONS`, `SLOT_ACCEPTS`, `makeGolem` extension, `initState` extension, `equipCard`, `equipCurse`, `applyCardEffects`, `tickEffects`
2. **`battle.js` — render functions**: rewrite `renderEnemyRow`, `renderPlayerRow` (both use `renderGolemCard`), add `postRenderGolemCards`, rewrite `renderHand`, add `renderDeck`, update `renderPlanner` (remove inline style on empty-moves hint), update `render()` call list
3. **`battle.js` — interaction listeners**: add `attachEquipListeners`, `attachCurseListeners`, call them from `render()`; keep existing `onPlayerClick`, `onEnemyClick`, `drawArrow`, `floatDamage`, `resolveRound` unchanged (just add `tickEffects` call at start of round)
4. **`index.html`** — replace the Battle section (section 2); update DOM ref IDs if any changed
5. **`style.css`** — append new sections (section 8), then delete old rules (section 9)

---

## 11. Constraints / gotchas

- **No inline `style="..."` in any `innerHTML` template string** — all dynamic CSS values applied via `element.style.setProperty()` after setting innerHTML
- `$apBarFill.style.width = ...` is fine (DOM property on a JS-created ref, not in a template)
- `path.style.strokeDasharray` etc in `drawArrow()` is fine — same reason
- `floatDamage()` uses `div.style.left/top` — fine (DOM property, not template)
- The `hpBar()` helper currently uses `style="width:${pct}%"` inline — **remove this function** and use the `bgc-hp-fill` CSS variable approach described above
- Golem card click for planning still works: `id="player-{slot}"` + click → `onPlayerClick(slot)` — wire exactly as before
- Enemy golem click still works: `id="enemy-{slot}"` + click → `onEnemyClick(slot)` — keep but wrap: only register if phase is `'planning'` AND `_handDrag === null` (so curse-drags don't accidentally queue attacks)
- The `drawArrow(fromEl, toEl, side)` function uses `document.getElementById('player-{slot}')` and `document.getElementById('enemy-{slot}')` — the new IDs match exactly, no change needed
- `_handDrag` and `_dragData` (element-bay drag) are separate variables; they don't conflict
