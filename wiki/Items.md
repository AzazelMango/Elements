# Items

Item cards are applied during the Preround to **your own Golem** and equipped into one of three Item slots. Unlike Curses and Enchantments, Items persist across rounds based on their `durability` value.

## Item Slots

Each Golem has three Item slots:

| Slot | Role |
|---|---|
| **Primary** | Offensive — weapons, ATK modifiers |
| **Secondary** | Utility — off-hand gear, consumables, heals |
| **Armour** | Defensive — DEF modifiers, damage reduction; independent of Primary/Secondary |

## Item Subtypes

| Subtype | Slot | Examples |
|---|---|---|
| **Weapon** | Primary | Iron Edge, Flame Blade |
| **Off-hand / Consumable** | Secondary | Minor Salve, Aqua Mend |
| **Armour** | Armour | Stone Plate, Frost Mail |
| **Dual-slot** | Primary + Secondary | Warband Blade — occupies both, grants a special bonus |

## Durability

| Value | Persistence | Notes |
|:---:|---|---|
| `1` | Consumable | Used once, removed after the round |
| `2–5` | Durable | Decrements each round; removed when reaches 0 |
| `-1` | Permanent | Lasts the entire match |

## Rarity & Scope

| Rarity | Scope | Effect strength |
|---|---|---|
| Common | Global | Flat stat boosts (e.g. +2 ATK/DEF, +15 HP) |
| Moderate | Archetype or Element | Stronger effects, may include secondary tags |
| Rare | Element-specific | Powerful or permanent effects |

See `app/src/data/cards.js` for all Item definitions (`type: 'item'`). Canonical fields: `id`, `name`, `itemSlot`, `durability`, `dualBonus`, `scope`, `element`, `archetype`, `rarity`, `tags`.

## Dual-slot Conflict Rule

If a Dual-slot Item is equipped while the Secondary slot is already occupied, the existing Secondary Item is **displaced back to the player's hand**. If the hand is full, the displaced Item is discarded.

<!-- TODO: expand item list per element and archetype -->
