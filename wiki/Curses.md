# Curses

Curse cards are applied during the Preround to an **opponent's Golem**. They take effect at the start of the round before Actions resolve. Curses are Common or Moderate rarity and are drawn from the player's weighted deck.

Curse effects are bounded by the Card Power Budget: no single Curse may drain more than ±2 AP, ±2 ATK/DEF, or shift effectiveness by more than ±0.125 per round.

See `app/src/data/cards.js` for all Curse definitions (`type: 'curse'`). Canonical fields: `id`, `name`, `scope`, `element`, `archetype`, `rarity`, `tags`.

<!-- TODO: expand curse list per element and archetype -->