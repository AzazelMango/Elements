
## Actions

Each Golem has a base AP determined by its Breed Tier (T1: 12, T2: 11, T3: 10). AP can be further modified by Enchantments and Curses. A Golem may split its AP freely between any number of actions, provided the total does not exceed its AP for the round.

Each action declaration has two parts:
- **Move** — *what* the Golem does (assigned in the Golem Builder before the match; element/archetype-flavored abilities)
- **Action Tier** — *how much AP* to spend doing it (chosen each round from the tables below)

The action tier's multiplier is applied to the Move's base effect. A Move can be executed at any tier the player can afford.

### Attacks
| Level    | X-plier | AP |
|----------|---------|----|
| Quick    | 0.875   | 2  |
| Standard | 1.000   | 4  |
| Charged  | 1.125   | 6  |
| Focused  | 1.250   | 8  |

Attack multiplier is applied to the attacker's base damage roll, modified by element effectiveness.

### Defenses
| Level    | X-plier | AP |
|----------|---------|----|
| Taunt    | 0.875   | 2  |
| Guard    | 0.750   | 4  |
| Brace    | 0.525   | 6  |
| Parry    | 0.250   | 8  |

Defense multiplier reduces the attacker's effective multiplier on all incoming attacks that round. If a Golem declares multiple defense actions, only the strongest applies.

### Damage Formula
```
damage = ATK × move_power × action_tier × defense_multiplier × effectiveness
```
- `ATK` — attacker's ATK stat, determined by Breed Tier (T1: 12, T2: 11, T3: 10); modified by cards
- `move_power` — the Move's own power multiplier (range: 0.75–1.25; defined per Move)
- `action_tier` — from the Attacks table above
- `defense_multiplier` — defender's best declared Defense X-plier (1.0 if no defense declared). Note: the base `DEF` stat reduces the effective damage after the formula resolves — `DEF` acts as a flat damage absorber post-calculation (every point of DEF absorbs 1 damage). Cards and Breed Tier bonuses to DEF increase this absorption.
- `effectiveness` — derived from Dominant and Passive element matchup (see below)
  - **Elemental Moves** include `effectiveness` in the formula
  - **General Moves** skip `effectiveness` entirely — they always resolve at flat power

```
// Elemental or Archetype Move
damage = ATK × move_power × action_tier × defense_multiplier × effectiveness

// General Move
damage = ATK × move_power × action_tier × defense_multiplier
```

General Moves are the "safe play" — no element synergy bonus, but no penalty either. Against a hard counter matchup (effectiveness 0.75×) a General Move outperforms an elemental one.

`effectiveness` is calculated as:
  - `effectiveness = (f(DOM_A vs DOM_B) + 0.33 × f(PAS_A vs DOM_B)) × g(DOM_A vs PAS_A)`
  - `f()` maps the external matchup score (attacker vs defender) to a multiplier
  - `g()` maps the internal conflict score (attacker's own DOM vs PAS) to a multiplier — same scale as `f()`
  - A Golem's `g()` value is a fixed property of its build, not the matchup

| Element Score | f(score) / g(score) |
|:---:|:---:|
| +2 | 1.250 |
| +1 | 1.125 |
|  0 | 1.000 |
| -1 | 0.875 |
| -2 | 0.750 |

  The scale mirrors the attack tier range intentionally — a -2 matchup hurts as much as dropping one full attack tier. Cards can shift outcomes within this range but cannot override it outright.

**Internal conflict notes:**
- **Purebreed (T1):** DOM vs PAS score is always 0 (self vs self), so `g() = 1.0` — no conflict penalty, no bonus
- **Crossbreed (T2):** DOM and PAS are in the same Architype, so internal score is typically low — `g()` near 1.0
- **Hybrid (T3):** DOM and PAS may oppose each other significantly — a FRE/WTR Hybrid has `g(FRE vs WTR) = f(-2) = 0.75`, capping its elemental ceiling at 75% regardless of matchup

---

## Round Order Of Operations
Players build their teams before the match starts. Once the match starts, players will have a set amount of time to deploy their Golems, draw cards, and choose their actions for the round. Once both players have flagged as ready, the round will begin and all actions will be revealed and resolved simultaneously. Damage is calculated and applied in batch at the end of the round after all actions have been declared. The next round then begins, repeating this process until one player has no more Golems left.

---

**Preround begins - Nonsequential actions**

- Players Deploy their Golems and draw cards to fill their hand to 5 cards.
- Players can choose to redraw their hand once per round, but they must keep the second hand regardless.
- Players choose their Enchanting cards and apply them to their chosen Golems.
- Players choose their Cursing cards and apply them to their chosen opponent's Golems.
- Players choose their Item cards to use on their chosen Golems.
- Players choose their Special cards if applicable.
- Players choose their actions (attacks and/or defenses) against their opponent's Golems.
- Players flag as Ready.

**Preround ends**

---

**Round begins - Sequential declaration, batch resolution**

- All cards are revealed.
- Curses, Enchantments, Items, and Special cards are applied.
- Actions are declared in A1, B1, A2, B2, A3, B3 slot order.
- All damage is calculated and applied simultaneously after all actions are declared.

**Round ends**

---

Repeat until one player has no more Golems left.

---

## Win Condition

A Golem is **destroyed** when its HP reaches 0. A player **loses the match** when all 3 of their Golems have been destroyed. All 3 Golems are present on the field for the entire match — there is no swapping or replacement. A Golem that reaches 0 HP remains on the field but cannot act and cannot be targeted.

<!-- TODO: decide whether a destroyed Golem's slot still counts for A1/B1 ordering, or whether slots collapse -->

---

## Cards

Each player draws cards per round up to their hand size limit (determined by Breed Tier). Players may redraw their full hand once per round but must keep the second draw. Unplayed cards do not carry over between rounds.

### Hand Size by Breed Tier
| Tier | Hand Size |
|---|:---:|
| T1 — Purebreed | 5 |
| T2 — Crossbreed | 6 |
| T3 — Hybrid | 7 |

### Card Types
There are four card types, each with a distinct role and scope:

| Type | Target | Timing | Quantity | Role |
|---|---|---|---|---|
| **Curse** | One enemy Golem | Preround | Common | Targeted debuff applied to an opponent's Golem |
| **Enchantment** | One own Golem | Preround | Common | Targeted buff applied to your own Golem |
| **Item** | One own Golem | Preround | Moderate | Equipment or consumable; persists by durability |
| **Special** | Multi-Golem or round-wide | Preround | Rare | Wildcard — affects multiple Golems or modifies round structure itself |

#### Items
Each Golem has three Item slots assignable from the hand:
- **Primary** — offensive (weapons)
- **Secondary** — utility / off-hand / consumables
- **Armour** — defensive (damage reduction, DEF modifiers); independent of Primary/Secondary

Items persist across rounds based on their durability:

| Persistence | `durability` value | Examples |
|---|:---:|---|
| **Consumable** | 1 | Heals, one-round buffs |
| **Durable** | 2–5 | Weapons, Armour with wear |
| **Permanent** | -1 | Rare relics, match-long equipment |

**Dual-slot Items** occupy both the Primary and Secondary slots simultaneously (not Armour) but grant a special bonus beyond what either slot alone provides. Only one dual-slot Item can be equipped per Golem at a time.

Cards also have an **affinity scope**:
- **Element cards** — narrow and powerful; tied to a specific element
- **Archetype cards** — broad and moderate; apply to any Golem of a matching Architype

### Draw Weighting
A player's draw pool is weighted by their team's net Architype composition. A team with 2 Volatile and 1 Stable Golem draws from a pool that skews Volatile.

Within each Golem's **Elemental Haploid**, the card draw ratio is **3:1 Dominant to Passive**:
- 75% of drawn cards relate to the Golem's Dominant Element or Architype
- 25% of drawn cards relate to the Passive Element or Architype

**Special cards** are rare in all pools. T1 Purebreed draw pools are rare-weighted — higher chance of Specials and Pure Bond cards despite the smaller hand size.

<!-- TODO: define Modifier deck composition (ratio per card type, element vs archetype cards, deck size) -->
<!-- TODO: define whether multiple cards of the same type can be applied to the same Golem in one round -->

### Card Power Budget
To preserve the integrity of the element matrix, individual card effects are bounded:
- **Effectiveness shift** — no single Curse/Enchantment/Item may alter `f()` output by more than ±0.125 (one tier)
- **AP modification** — no single card may grant or drain more than ±2 AP
- **ATK/DEF modification** — no single card may shift a stat by more than ±2
- **Special cards** are exempt from these bounds but are limited by rarity

Cards are the tactical layer — they tip the scales, they do not flip them.

See [Curses](./Curses.md), [Enchantments](./Enchantments.md), and [Items](./Items.md) for card definitions.
