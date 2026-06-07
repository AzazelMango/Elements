---
title: Golems
base-HP: 100
base-AP: 10
base-ATK: 10
base-DEF: 10
---
# Golems
Golems are constructed via Elemental Haploid consisting of a [Dominant Element](./Golems/Dominant_Element.md) and a [Passive Element](./Golems/Passive_Element.md). The former being the basis of what [Architype](./Golems/Architypes.md) the Golem is and thus what its strengths and weaknesses are, while the latter is more of a support element that can influence the outcome of battles in various ways. The interactions between the Dominant and Passive Elements, as well as the Architype, create a complex web of interactions that players can use to their advantage in battles.

| ABV | Stat          | Default | Description                                                                        |
|-----|---------------|---------|------------------------------------------------------------------------------------|
| HP  | Health Points | 100     | The amount of damage a Golem can take before being destroyed. Not affected by Breed Tier — modified by cards only. |
| AP  | Action Points | 10      | The amount of energy a Golem has to perform actions in battle.                     |
| ATK | Attack Power  | 10      | The amount of damage a Golem can deal to an opponent.                              |
| DEF | Defense Power | 10      | The amount of damage a Golem can mitigate when attacked.                           |

AP, ATK, and DEF receive a flat bonus based on the Golem's Breed Tier:

- T1 - Purebreed - Haploid of the same element (e.g. FRE/FRE)
- T2 - Crossbreed - Haploid of two elements in the same Architype (e.g. FRE/NAT, both Volatile)
- T3 - Hybrid - Haploid of two elements not in the same Architype (e.g. FRE/STN, Volatile + Stable)

| Stat | T1  | T2  | T3  |
|------|:---:|:---:|:---:|
| HP   | 100 | 100 | 100 |
| AP   | 12  | 11  | 10  |
| ATK  | 12  | 11  | 10  |
| DEF  | 12  | 11  | 10  |

### Internal Conflict

Every Golem has an **internal conflict score** — the element interaction score of its own DOM vs PAS (using the same matrix as combat). This becomes the `g()` multiplier applied to `effectiveness` on all Elemental Moves.

| Internal Score | g() | Relationship | Example |
|:-:|:-:|---|---|
| +2 | 1.250 | DOM overpowers PAS — highly coherent | FRE/NAT |
| +1 | 1.125 | DOM leads PAS — stable alignment | FRE/MTL |
|  0 | 1.000 | Neutral coexistence | FRE/AIR, all T1 |
| -1 | 0.875 | PAS resists DOM — internal friction | FRE/ELC |
| -2 | 0.750 | PAS fundamentally opposes DOM — deep conflict | FRE/WTR |

- **Purebreed:** DOM vs PAS is always 0 → `g() = 1.0`. No internal conflict, no bonus.
- **Crossbreed:** DOM/PAS share an Architype, so internal scores tend to be mild.
- **Hybrid:** DOM/PAS can strongly oppose each other — the 5 Move slots and large hand compensate for the `g()` ceiling.

General Moves are **not affected** by `g()` — internal conflict only applies to Elemental and Archetype Moves.

## Golem Building
Players are given two of each element to build 3 Golems. This way players can either have 1 Pure Golem or 2 Hybrid Golems using the same Element, thus inducing complex combos and strategies. Players can also choose to mix and match elements to create unique Golems with different strengths and weaknesses.

In the **Golem Builder**, each Golem is assigned a Move List and Enchantment loadout based on its **Breed Tier**, determined by the relationship between its Dominant and Passive Elements:

| Axis                 | T1 — Purebreed                   | T2 — Crossbreed                  | T3 — Hybrid                      |
|----------------------|----------------------------------|----------------------------------|----------------------------------|
| **Condition**        | DOM = PAS (same element)         | DOM/PAS share Architype          | DOM/PAS from diff Architypes     |
| **Move Slots**       | 4                                | 4                                | 5                                |
| **Enchant Slots**    | 1                                | 2                                | 2                                |
| **Item Slots**       | 3 (Primary + Secondary + Armour) | 3 (Primary + Secondary + Armour) | 3 (Primary + Secondary + Armour) |
| **Hand Size**        | 5                                | 6                                | 7                                |
| **Card Draw**        | Rare-weighted                    | Base                             | Base                             |
| **Stat Bonus**       | +4 AP, ATK, DEF                  | +2 AP, ATK, DEF                  | +0 (base stats)                  |
| **Neutral Penalty**  | 0-score matchups → -1            | None                             | None                             |

- **T1** — fewest build options but the strongest card layer; punished by neutral matchups, rewarded by favourable ones
- **T2** — balanced in builder and battle; extra Enchant slot rewards pre-match setup strategy
- **T3** — most flexible in builder (5 moves, 2 enchants, largest hand); no card draw advantage

These are fixed for the match. During battle, the player selects a Move and an Action Tier each round; the tier determines how much AP is spent and scales the Move's effect.

### Move Design Principle
Moves reflect the element's natural strengths and weaknesses. A Move available to a WTR Golem should be effective against the elements that Water beats (FRE, STN) or thematically appropriate to water's nature. Elemental and Archetype Moves are not generic — each is tied to a specific element or Architype and designed around that element's position in the interaction matrix.

Each Move has its own `move_power` multiplier (range: 0.75–1.25) that scales its base effect. Higher power Moves tend to be pure damage; lower power Moves compensate with secondary effects (buffs, debuffs, status).

## Architype & Move Pool

There are **four Move Pools**. Every Golem has access to the General pool. Elemental/Archetype pool access is determined by Breed Tier.

| Pool | Tied to | Role |
|------|---------|------|
| **General** | None — all Golems | Reliable fallback; bypasses `effectiveness` entirely |
| **Stable** | Stable Architype | Defensive/sustain focus |
| **Volatile** | Volatile Architype | Burst damage, high risk/reward |
| **Arcane** | Arcane Architype | Effect-heavy, debuffs, unusual interactions |

A Golem's Dominant Element determines its **Architype** (Stable, Volatile, or Arcane). The combination of the Dominant and Passive Architypes determines what **elemental pool** the Golem has access to:

| DOM \ PAS | Stable | Volatile | Arcane |
|-----------|--------|----------|--------|
| **Stable**   | T1 — Pure Stable, full pool + rare cards | T3 — Hybrid STB/VOL, blended pool | T3 — Hybrid STB/ARC, blended pool |
| **Volatile** | T3 — Hybrid VOL/STB, blended pool | T1 — Pure Volatile, full pool + rare cards | T3 — Hybrid VOL/ARC, blended pool |
| **Arcane**   | T3 — Hybrid ARC/STB, blended pool | T3 — Hybrid ARC/VOL, blended pool | T1 — Pure Arcane, full pool + rare cards |

- **T2 (same Architype, different element)** — e.g. FRE/NAT (both Volatile): access to the full Volatile pool at base draw quality
- **Blended pool** — a T3 Hybrid draws from both Architypes' Move pools

<!-- TODO: define the specific Move pools per Architype (Stable = defensive/sustain, Volatile = burst/risky, Arcane = effect-heavy/unusual) -->

### Pure Bond Moves
Purebreed (T1) Golems have access to one exclusive **Pure Bond Move** per Architype, available only through the rare-weighted draw pool. These moves are unavailable to Crossbreed or Hybrid builds.

| Architype | Move | Effect |
|---|---|---|
| **Stable** | Iron Will | Deal no damage. The next hit this round cannot reduce this Golem's HP below 1. |
| **Volatile** | Frenzy | Strike all 3 opponent Golems at Quick tier (0.875× move_power) for the AP cost of a single Quick (2 AP total). |
| **Arcane** | Rift | Deal no damage. Swap this Golem's effectiveness scores with the target Golem's for this round. |

See `cards.js` — IDs: `MOV_STB_PURE`, `MOV_VOL_PURE`, `MOV_ARC_PURE`.

### Move Pool Content Reference
See `app/src/data/cards.js` for the full card and move definitions. Pool values in that file (`pool: 'general'|'stable'|'volatile'|'arcane'`) are the canonical source of truth for what each pool contains. A **blended pool** (T3 Hybrid) has access to both pools but at reduced selection depth — the builder presents a merged list capped at the lower of the two pool sizes.