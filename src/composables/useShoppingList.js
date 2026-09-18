import { computed, reactive } from 'vue'
import { loadAppState, saveAppState } from '../services/storage.js'
import { toBaseAmount } from '../services/units.js'
import { densityOf } from '../services/densities.js'
import { isAlwaysExcludedIngredient, normalizeIngredientName } from '../services/ingredientExclusions.js'
import { useRecipes } from './useRecipes.js'

const state = reactive(loadAppState())

function persist() {
  saveAppState({
    menu: state.menu,
    checked: state.checked,
    excluded: state.excluded,
    extras: state.extras
  })
}

/** Identifies the same thing to buy across recipes: two recipes that both want butter share one row. */
const itemKey = (name, unit) => `${name} ${unit}`

/**
 * Removing a row means "I already have this", which is about the ingredient
 * and not about how the recipe measured it. So exclusions are keyed by the
 * name alone, not by the row id: olive oil removed while a recipe wanted
 * "3 cuillères à soupe" of it stays gone when the next one wants "20 g",
 * even though those two land on different rows.
 */
const isExcluded = name => state.excluded.includes(normalizeIngredientName(name))

/**
 * Folds one ingredient into the rows being built, summing it onto the
 * existing row when something else already asked for the same thing in the
 * same unit. Both recipes and hand-added extras go through here, which is
 * what lets "2 bottles of olive oil" typed by hand land on the olive oil row
 * a recipe already opened rather than beside it.
 */
function mergeRow(rows, name, quantity, unit) {
  if (isExcluded(name)) return

  // A volume of oil weighs less than the same volume of water, so the
  // ingredient's own density is what turns "50 cL" into the grams every row
  // is merged in.
  const amount = toBaseAmount(quantity, unit, { density: densityOf(name) ?? undefined })
  const key = itemKey(name, amount.unit)

  const existing = rows.get(key)
  if (existing) {
    if (amount.quantity != null) existing.quantity = (existing.quantity ?? 0) + amount.quantity
    return
  }

  rows.set(key, {
    id: key,
    name,
    unit: amount.unit,
    quantity: amount.quantity,
    checked: Boolean(state.checked[key]),
    checkedAt: state.checked[key] || null
  })
}

export function useShoppingList() {
  const { recipes } = useRecipes()

  /**
   * The list is rebuilt from the menu's recipes on every read instead of
   * being stored as its own snapshot. That is what lets two different
   * recipes that both need butter collapse onto a single row with the
   * summed quantity — a snapshot-per-recipe only ever merged an ingredient
   * against itself, so the same ingredient coming from two recipes produced
   * two separate lines.
   *
   * Ingredients are looked up on `recipes` rather than kept on the menu
   * entry itself: GitHub is the only source of truth for a recipe's content,
   * so the menu only remembers which recipe it wants and by how much. This
   * also means a recipe's ingredients update on the shopping list the moment
   * a fresh fetch changes them, instead of waiting for someone to re-add it.
   * A recipe gone from `recipes` (deleted upstream, or not loaded yet)
   * simply contributes nothing.
   *
   * Amounts are converted to a canonical unit before they are keyed, so the
   * same ingredient measured two different ways — "500 g lait" in one recipe,
   * "500 cL" in another — merges rather than splitting into two rows that
   * each read in their own unit.
   *
   * Hand-added extras are folded in after the menu, through the same merge:
   * they are things to buy like any other, and nothing about them depends on
   * a recipe still existing upstream.
   */
  const shoppingList = computed(() => {
    const rows = new Map()

    for (const entry of state.menu) {
      const recipe = recipes.value.find(item => item.slug === entry.recipeId)
      if (!recipe) continue
      for (const ingredient of recipe.ingredients) {
        if (isAlwaysExcludedIngredient(ingredient.name)) continue
        const scaled = ingredient.quantity == null ? null : ingredient.quantity * entry.multiplier
        mergeRow(rows, ingredient.name, scaled, ingredient.unit)
      }
    }

    // No `isAlwaysExcludedIngredient` guard here: that list hides staples a
    // recipe happens to mention, but someone who types "sel" into the form is
    // saying they need to buy salt.
    for (const extra of state.extras) {
      mergeRow(rows, extra.name, extra.quantity, extra.unit)
    }

    return [...rows.values()]
  })

  const itemCount = computed(() => shoppingList.value.filter(item => !item.checked).length)
  const totalCount = computed(() => shoppingList.value.length)
  const menuCount = computed(() => state.menu.length)

  /** Adding a recipe that is already on the menu raises its multiplier instead of listing it twice. */
  function addRecipe(recipe, multiplier) {
    const entry = state.menu.find(item => item.recipeId === recipe.slug)

    if (entry) {
      entry.multiplier += multiplier
      entry.addedAt = new Date().toISOString()
    } else {
      state.menu.push({
        recipeId: recipe.slug,
        multiplier,
        addedAt: new Date().toISOString()
      })
    }

    persist()
  }

  /**
   * Adds something no recipe calls for. Repeated adds are kept as separate
   * entries rather than being accumulated here: the list already sums rows
   * that share a key, so two bottles added twice read as four without this
   * needing to know how amounts combine.
   */
  function addExtraItem(name, quantity, unit) {
    const trimmed = String(name ?? '').trim()
    if (!trimmed) return

    state.extras.push({
      name: trimmed,
      quantity: Number.isFinite(quantity) ? quantity : null,
      unit: unit || '',
      addedAt: new Date().toISOString()
    })

    // Typing something in is an explicit answer to having removed it before,
    // so it stops being excluded rather than being added back invisibly.
    const key = normalizeIngredientName(trimmed)
    state.excluded = state.excluded.filter(excluded => excluded !== key)

    persist()
  }

  function toggleItem(id) {
    if (state.checked[id]) delete state.checked[id]
    else state.checked[id] = Date.now()
    persist()
  }

  /** Excludes the row's ingredient from the derived list, e.g. because it's already in the pantry. */
  function removeItem(id) {
    const row = shoppingList.value.find(item => item.id === id)
    if (row && !isExcluded(row.name)) state.excluded.push(normalizeIngredientName(row.name))
    delete state.checked[id]
    persist()
  }

  function clearList() {
    state.menu = []
    state.checked = {}
    state.excluded = []
    state.extras = []
    persist()
  }

  function removeRecipe(recipeId) {
    state.menu = state.menu.filter(item => item.recipeId !== recipeId)
    persist()
  }

  return {
    state,
    shoppingList,
    itemCount,
    totalCount,
    menuCount,
    addRecipe,
    addExtraItem,
    toggleItem,
    removeItem,
    clearList,
    removeRecipe
  }
}
