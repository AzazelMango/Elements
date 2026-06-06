'use strict';

/**
 * Engine — pure combat math module.
 * Implements the damage formula and effectiveness calculation from wiki/Gameplay.md.
 *
 * All functions are stateless. Exposed as window.Engine (frozen).
 *
 * Damage formula (Elemental):
 *   raw    = ATK × move_power × action_tier × defense_mult × effectiveness
 *   final  = max(0, round(raw) − DEF)
 *
 * Damage formula (General / non-elemental):
 *   raw    = ATK × move_power × action_tier × defense_mult
 *   final  = max(0, round(raw) − DEF)
 *
 * Effectiveness:
 *   eff = (f(DOM_A vs DOM_B) + 0.33 × f(PAS_A vs DOM_B)) × g(DOM_A vs PAS_A)
 *
 * T1 (Purebreed) neutral penalty:
 *   When DOM_A vs DOM_B score is 0, use f(-1) = 0.875 instead of f(0) = 1.0.
 *   Applies only to the DOM-vs-DOM external term, not the PAS term or g().
 */
(function () {

  // ── Action tiers (source of truth for battle.js) ─────────────────────────
  const ATTACK_TIERS = Object.freeze({
    quick:    Object.freeze({ multiplier: 0.875, cost: 2 }),
    standard: Object.freeze({ multiplier: 1.000, cost: 4 }),
    charged:  Object.freeze({ multiplier: 1.125, cost: 6 }),
    focused:  Object.freeze({ multiplier: 1.250, cost: 8 }),
  });

  const DEFENSE_TIERS = Object.freeze({
    taunt: Object.freeze({ multiplier: 0.875, cost: 2 }),
    guard: Object.freeze({ multiplier: 0.750, cost: 4 }),
    brace: Object.freeze({ multiplier: 0.525, cost: 6 }),
    parry: Object.freeze({ multiplier: 0.250, cost: 8 }),
  });

  // ── Effectiveness ─────────────────────────────────────────────────────────

  /**
   * Calculate the full effectiveness multiplier for a single elemental attack.
   *
   * @param {string}  attDom  Attacker's dominant element id
   * @param {string}  attPas  Attacker's passive element id
   * @param {string}  defDom  Defender's dominant element id
   * @param {boolean} isT1    True if the attacker is T1 (Purebreed) — applies neutral penalty
   * @returns {number}
   */
  function effectiveness(attDom, attPas, defDom, isT1) {
    const domScore = window.elementScore(attDom, defDom);
    const pasScore = window.elementScore(attPas, defDom);

    // T1 neutral penalty: DOM-vs-DOM score of 0 → treat as -1
    const domMult = (isT1 && domScore === 0) ? 0.875 : window.fScore(domScore);
    const pasMult = window.fScore(pasScore);

    const external = domMult + 0.33 * pasMult;
    const gMult    = window.getGMult(attDom, attPas);

    return external * gMult;
  }

  // ── Damage ────────────────────────────────────────────────────────────────

  /**
   * Compute final damage for a single attack action.
   *
   * @param {object} attacker   { dom, pas, atk }
   * @param {object} defender   { dom, def }
   * @param {object} move       Card object from window.CARDS — needs movePower, isElemental
   * @param {string} tierKey    Attack tier: 'quick'|'standard'|'charged'|'focused'
   * @param {string|null} defTierKey  Best defense declared by defender, or null
   * @returns {{ raw: number, final: number, effectiveness: number, breakdown: object }}
   */
  function computeDamage(attacker, defender, move, tierKey, defTierKey) {
    const tier    = ATTACK_TIERS[tierKey]        ?? ATTACK_TIERS.standard;
    const defTier = defTierKey ? (DEFENSE_TIERS[defTierKey] ?? null) : null;
    const defMult = defTier ? defTier.multiplier : 1.0;

    const isT1  = window.getBreedTier(attacker.dom, attacker.pas) === 'T1';
    const eff   = move.isElemental
      ? effectiveness(attacker.dom, attacker.pas, defender.dom, isT1)
      : 1.0;

    const raw   = attacker.atk * move.movePower * tier.multiplier * defMult * eff;
    const final = Math.max(0, Math.round(raw) - defender.def);

    return {
      raw,
      final,
      effectiveness: eff,
      breakdown: {
        atk:      attacker.atk,
        power:    move.movePower,
        tierMult: tier.multiplier,
        defMult,
        eff,
        defFlat:  defender.def,
      },
    };
  }

  // ── Move Pool ─────────────────────────────────────────────────────────────

  /**
   * Return all move cards available to a Golem based on its dom/pas elements.
   *
   * Access rules:
   *   - General pool:        all Golems
   *   - Element moves:       if card.element === dom OR card.element === pas
   *   - Archetype moves:     if card.archetype === dom-archetype (always)
   *                          OR card.archetype === pas-archetype (T3 Hybrid blended pool)
   *   - Pure Bond moves:     T1 only, matching dom archetype
   *
   * @param {string} dom
   * @param {string} pas
   * @returns {Array}  Filtered subset of window.CARDS (moves only)
   */
  function movesFor(dom, pas) {
    if (!dom || !pas || !window.CARDS) return [];

    const domEl   = window.ELEMENTS?.find(e => e.id === dom);
    const pasEl   = window.ELEMENTS?.find(e => e.id === pas);
    const domArch = domEl?.archetype?.toLowerCase() ?? null;
    const pasArch = pasEl?.archetype?.toLowerCase() ?? null;
    const tier    = window.getBreedTier(dom, pas);

    return window.CARDS.filter(c => {
      if (c.type !== 'move') return false;

      // Pure Bond moves: T1 only, dom archetype, rare
      if (c.rarity === 'rare' && c.scope === 'archetype' && c.pool !== null) {
        return tier === 'T1' && c.archetype === domArch;
      }

      // General pool — all Golems
      if (c.pool === 'general') return true;

      // Element-specific moves — DOM or PAS element
      if (c.scope === 'element') {
        return c.element === dom || c.element === pas;
      }

      // Archetype-scoped moves (non-pure-bond)
      if (c.scope === 'archetype') {
        if (c.archetype === domArch) return true;
        if (tier === 'T3' && c.archetype === pasArch) return true;
        return false;
      }

      return false;
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.Engine = Object.freeze({
    ATTACK_TIERS,
    DEFENSE_TIERS,
    effectiveness,
    computeDamage,
    movesFor,
  });

})();
