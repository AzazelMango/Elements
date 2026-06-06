'use strict';

/**
 * Golems — data-layer schema documentation.
 * Actual Golem instances are created and managed by state.js.
 *
 * Golem record schema (as stored in teams.json and State):
 * {
 *   dom:   string | null   -- Dominant element id (e.g. 'FRE')
 *   pas:   string | null   -- Passive element id  (e.g. 'NAT')
 *   moves: string[]        -- Ordered list of assigned move card IDs (pre-battle, like a Pokémon moveset)
 *                             Max length: 4 for T1/T2, 5 for T3. Assigned in Golem Builder.
 * }
 *
 * Runtime Golem (used during battle, created in battle.js):
 * {
 *   slot:    number        -- 0-indexed position in team
 *   dom:     string        -- Dominant element id
 *   pas:     string        -- Passive element id
 *   moves:   object[]      -- Resolved card objects from the assigned move IDs
 *   hp:      number        -- Current HP
 *   maxHp:   number        -- Maximum HP (from config.game.baseHp)
 *   atk:     number        -- ATK stat (breed-tier adjusted)
 *   def:     number        -- DEF stat (breed-tier adjusted)
 *   ap:      number        -- AP per round (breed-tier adjusted)
 *   defeated: boolean      -- True when hp === 0
 * }
 *
 * Team record schema (as stored in teams.json and State.teams):
 * {
 *   id:     string         -- Unique team identifier
 *   name:   string         -- Display name
 *   golems: Array<{dom, pas, moves}>  -- length === config.game.teamSize
 * }
 */

// ── Breed Tier Helpers ────────────────────────────────────────────────────────

/**
 * Determine the Breed Tier of a Golem from its dom and pas elements.
 *   T1 — Purebreed:  dom === pas
 *   T2 — Crossbreed: dom and pas share the same Archetype (but are different elements)
 *   T3 — Hybrid:     dom and pas are from different Archetypes
 * @param {string} dom  Dominant element id
 * @param {string} pas  Passive element id
 * @returns {'T1'|'T2'|'T3'}
 */
window.getBreedTier = function getBreedTier(dom, pas) {
  if (!dom || !pas) return 'T3';
  if (dom === pas) return 'T1';
  const domEl = window.ELEMENTS.find(e => e.id === dom);
  const pasEl = window.ELEMENTS.find(e => e.id === pas);
  if (domEl && pasEl && domEl.archetype === pasEl.archetype) return 'T2';
  return 'T3';
};

/**
 * Return the base stats for a Golem based on its dom/pas pair.
 * Stat bonuses: T1 +2, T2 +1, T3 +0 to AP, ATK, DEF. HP is always 100.
 * @param {string} dom
 * @param {string} pas
 * @returns {{ hp: number, ap: number, atk: number, def: number }}
 */
window.getGolemStats = function getGolemStats(dom, pas) {
  const tier  = window.getBreedTier(dom, pas);
  const bonus = tier === 'T1' ? 4 : tier === 'T2' ? 2 : 0;
  return { hp: 100, ap: 10 + bonus, atk: 10 + bonus, def: 10 + bonus };
};

/**
 * Return the raw internal conflict score for a Golem (dom vs pas in the element matrix).
 * Purebreed (T1) always returns 0 (self vs self).
 * @param {string} dom
 * @param {string} pas
 * @returns {number}  Score -2 to +2
 */
window.getInternalScore = function getInternalScore(dom, pas) {
  if (!dom || !pas) return 0;
  return window.elementScore(dom, pas);
};

/**
 * Return the g() multiplier for internal conflict (attacker's own DOM vs PAS).
 * Uses the same f() mapping as external effectiveness.
 * @param {string} dom
 * @param {string} pas
 * @returns {number}
 */
window.getGMult = function getGMult(dom, pas) {
  return window.fScore(window.getInternalScore(dom, pas));
};

/**
 * Return the number of Move Slots for a Golem based on its Breed Tier.
 *   T1 / T2 — 4 slots
 *   T3      — 5 slots (compensates for no T1 card-draw advantage)
 * @param {string} dom
 * @param {string} pas
 * @returns {number}
 */
window.getMoveSlotCount = function getMoveSlotCount(dom, pas) {
  return window.getBreedTier(dom, pas) === 'T3' ? 5 : 4;
};
