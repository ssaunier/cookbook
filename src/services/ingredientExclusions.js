/**
 * Ingredients that never belong on a shopping list, no matter which recipe
 * calls for them or how much of it: kitchen staples nobody actually shops
 * for, like tap water or the olive oil every recipe opens with.
 *
 * Add a name here to exclude another one; the check goes through
 * `normalizeIngredientName`, so it matches however a recipe happens to
 * spell it. Unlike a removal made from the list itself, an entry here
 * survives clearing the list.
 */
const ALWAYS_EXCLUDED_NAMES = ['eau', 'sel', 'poivre', "huile d'olive"]

/**
 * How an ingredient name is compared, wherever two spellings should count
 * as the same thing to buy: case, surrounding whitespace and the choice of
 * apostrophe ("huile d'olive" typed on a phone comes out as "huile d’olive")
 * do not make it a different ingredient.
 */
export function normalizeIngredientName(name) {
  return (name || '').trim().toLowerCase().replace(/[’‘]/g, "'")
}

export function isAlwaysExcludedIngredient(name) {
  return ALWAYS_EXCLUDED_NAMES.includes(normalizeIngredientName(name))
}
