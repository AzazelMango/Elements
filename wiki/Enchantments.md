# Enchantments

Enchantment cards are applied during the Preround to **your own Golem**. They take effect at the start of the round before Actions resolve. Enchantments are Common or Moderate rarity and are drawn from the player's weighted deck.

Enchantment effects are bounded by the Card Power Budget: no single Enchantment may grant more than ±2 AP, ±2 ATK/DEF, or shift effectiveness by more than ±0.125 per round.

Each Golem also has **Enchantment Slots** assigned in the Golem Builder (T1: 1 slot, T2–T3: 2 slots). These are permanent passive Enchantments active for the entire match, separate from the cards drawn each round.

See `app/src/data/cards.js` for all Enchantment definitions (`type: 'enchantment'`). Canonical fields: `id`, `name`, `scope`, `element`, `archetype`, `rarity`, `tags`.

<!-- TODO: expand enchantment list per element and archetype -->