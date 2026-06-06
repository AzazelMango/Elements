'use strict';

window.ARCHETYPES = Object.freeze(['Stable', 'Volatile', 'Arcane']);

window.ELEMENTS = Object.freeze([
  { id: 'STN', name: 'Stone',    archetype: 'Stable'   },
  { id: 'MTL', name: 'Metal',    archetype: 'Stable'   },
  { id: 'ICE', name: 'Ice',      archetype: 'Stable'   },
  { id: 'WTR', name: 'Water',    archetype: 'Stable'   },
  { id: 'FRE', name: 'Fire',     archetype: 'Volatile' },
  { id: 'ELC', name: 'Electric', archetype: 'Volatile' },
  { id: 'AIR', name: 'Air',      archetype: 'Volatile' },
  { id: 'NAT', name: 'Nature',   archetype: 'Volatile' },
  { id: 'CRY', name: 'Crystal',  archetype: 'Arcane'   },
  { id: 'VOD', name: 'Void',     archetype: 'Arcane'   },
  { id: 'LIT', name: 'Light',    archetype: 'Arcane'   },
]);

// Archetype id → display abbreviation
window.ARCHETYPE_ABBR = Object.freeze({ Stable: 'STB', Volatile: 'VOL', Arcane: 'ARC' });

/**
 * Lookup an element by id.
 * @param {string} id
 * @returns {{ id, name, archetype } | undefined}
 */
window.getElement = function getElement(id) {
  return window.ELEMENTS.find(e => e.id === id);
};

// ── Element Interaction Matrix ──────────────────────────────────────────────
// ELEMENT_MATRIX[attacker_id][defender_id] = score  (-2 to +2)
// Attacker is the row (A), Defender is the column (B).
// Source: wiki/workflow/Notes-05-06-2026.md  (all rows sum to 0 — antisymmetric)
window.ELEMENT_MATRIX = Object.freeze({
  FRE: Object.freeze({ FRE:  0, ELC:  0, AIR:  0, WTR: -2, NAT: +2, MTL:  0, STN:  0, ICE: +2, CRY: +1, VOD: -2, LIT: -1 }),
  ELC: Object.freeze({ FRE:  0, ELC:  0, AIR: +1, WTR: +2, NAT: +1, MTL:  0, STN: -1, ICE:  0, CRY:  0, VOD: -2, LIT: -1 }),
  AIR: Object.freeze({ FRE:  0, ELC: -1, AIR:  0, WTR:  0, NAT: +2, MTL:  0, STN: -2, ICE: +1, CRY:  0, VOD:  0, LIT:  0 }),
  WTR: Object.freeze({ FRE: +2, ELC: -2, AIR:  0, WTR:  0, NAT: -2, MTL: +1, STN: +2, ICE: -2, CRY:  0, VOD: +2, LIT: -1 }),
  NAT: Object.freeze({ FRE: -2, ELC: -1, AIR: -2, WTR: +2, NAT:  0, MTL: +2, STN: +2, ICE: -2, CRY: -1, VOD: +1, LIT: +1 }),
  MTL: Object.freeze({ FRE:  0, ELC:  0, AIR:  0, WTR: -1, NAT: -2, MTL:  0, STN: +1, ICE: +1, CRY:  0, VOD: +1, LIT:  0 }),
  STN: Object.freeze({ FRE:  0, ELC: +1, AIR: -2, WTR: +2, NAT: -2, MTL: -1, STN:  0, ICE:  0, CRY:  0, VOD: +1, LIT: +1 }),
  ICE: Object.freeze({ FRE: -2, ELC:  0, AIR: -1, WTR: +2, NAT: +2, MTL: -1, STN:  0, ICE:  0, CRY:  0, VOD:  0, LIT:  0 }),
  CRY: Object.freeze({ FRE: -1, ELC:  0, AIR:  0, WTR:  0, NAT: +1, MTL:  0, STN:  0, ICE:  0, CRY:  0, VOD: -2, LIT: +2 }),
  VOD: Object.freeze({ FRE: +2, ELC: +2, AIR:  0, WTR: -2, NAT: -1, MTL: -1, STN: -1, ICE:  0, CRY: +2, VOD:  0, LIT: -1 }),
  LIT: Object.freeze({ FRE: +1, ELC: +1, AIR:  0, WTR: +1, NAT: -1, MTL:  0, STN: -1, ICE:  0, CRY: -2, VOD: +1, LIT:  0 }),
});

/**
 * f(score) / g(score) — map an element interaction score to an effectiveness multiplier.
 * Range: f(-2)=0.750, f(-1)=0.875, f(0)=1.000, f(+1)=1.125, f(+2)=1.250
 * @param {number} score  Integer -2 to +2
 * @returns {number}
 */
window.fScore = function fScore(score) {
  if (score >= 2)  return 1.250;
  if (score >= 1)  return 1.125;
  if (score <= -2) return 0.750;
  if (score <= -1) return 0.875;
  return 1.000;
};

/**
 * Look up the raw interaction score for attacker vs defender.
 * @param {string} attackerId  Element id (e.g. 'FRE')
 * @param {string} defenderId  Element id (e.g. 'WTR')
 * @returns {number}  Score -2 to +2 (0 if unknown)
 */
window.elementScore = function elementScore(attackerId, defenderId) {
  return (window.ELEMENT_MATRIX[attackerId] ?? {})[defenderId] ?? 0;
};
