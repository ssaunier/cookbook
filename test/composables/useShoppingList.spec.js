import { beforeEach, describe, expect, it, vi } from 'vitest'
import { filesOf, ingredient, makeRecipe } from '../helpers.js'
import { saveRecipeCache } from '../../src/services/storage.js'

// The store is a module singleton, so it must be rebuilt for every test.
beforeEach(() => {
  vi.resetModules()
})

/**
 * Seeds the recipe cache the way `useRecipes` hydrates it at import, then
 * returns a fresh `useShoppingList` whose ingredient lookups resolve against
 * it without a network call. `useShoppingList` never stores a recipe's own
 * ingredients — it only looks them up live by slug — so every test that
 * reads `shoppingList.value` needs the recipe it adds to also be seeded here.
 */
async function withRecipes(recipes) {
  saveRecipeCache({ sha: 'sha1', files: filesOf(recipes), version: __APP_VERSION__ })
  const { useShoppingList } = await import('../../src/composables/useShoppingList.js')
  return useShoppingList()
}

describe('addRecipe', () => {
  it('adds one unchecked row per ingredient and counts them', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 1)

    expect(list.shoppingList.value).toHaveLength(3)
    expect(list.totalCount.value).toBe(3)
    expect(list.itemCount.value).toBe(3)
    expect(list.shoppingList.value.every(item => !item.checked)).toBe(true)
  })

  it('scales measurable quantities by the multiplier', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 2.5)

    const byName = name => list.shoppingList.value.find(item => item.name === name)
    expect(byName('avocado').quantity).toBe(2.5)
    expect(byName('salt').quantity).toBe(1.25)
    expect(byName('lemon juice').quantity).toBeNull()
  })

  it('gives every row a unique id', async () => {
    const soup = makeRecipe({ slug: 'soup', title: 'Soup' })
    const list = await withRecipes([makeRecipe(), soup])
    list.addRecipe(makeRecipe(), 1)
    list.addRecipe(soup, 1)

    const ids = list.shoppingList.value.map(item => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('records the recipe on the menu', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 2)

    expect(list.menuCount.value).toBe(1)
    expect(list.state.menu[0]).toMatchObject({ recipeId: 'guacamole', multiplier: 2 })
  })

  it('accumulates the multiplier when a recipe is added twice', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 2)
    list.addRecipe(makeRecipe(), 1.5)

    expect(list.state.menu).toHaveLength(1)
    expect(list.state.menu[0].multiplier).toBe(3.5)
  })

  it('merges the second addition into the rows of the first', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 2)
    list.addRecipe(makeRecipe(), 1.5)

    // Three ingredients, still three rows, each scaled to the combined 3.5.
    expect(list.shoppingList.value).toHaveLength(3)
    expect(list.shoppingList.value.map(item => [item.name, item.quantity])).toEqual([
      ['avocado', 3.5], ['salt', 1.75], ['lemon juice', null]
    ])
  })

  it('merges an ingredient shared by two different recipes onto one row', async () => {
    const curry = makeRecipe({ slug: 'curry', title: 'Curry', ingredients: [ingredient('beurre', 50, 'g')] })
    const canneles = makeRecipe({ slug: 'canneles', title: 'Cannelés', ingredients: [ingredient('beurre', 30, 'g')] })
    const list = await withRecipes([curry, canneles])
    list.addRecipe(curry, 1)
    list.addRecipe(canneles, 2)

    const butter = list.shoppingList.value.filter(item => item.name === 'beurre')
    expect(butter).toHaveLength(1)
    expect(butter[0].quantity).toBe(110)
  })

  it('merges an ingredient the two recipes measure in different units', async () => {
    // Crêpes writes milk as "500 g", Cannelés writes it as "500 cL"; both
    // mean the same trip to the same shelf, so they belong on one row.
    const crepes = makeRecipe({ slug: 'crepes', title: 'Crêpes', ingredients: [ingredient('lait', 500, 'g')] })
    const canneles = makeRecipe({ slug: 'canneles', title: 'Cannelés', ingredients: [ingredient('lait', 500, 'cL')] })
    const list = await withRecipes([crepes, canneles])
    list.addRecipe(crepes, 1)
    list.addRecipe(canneles, 1)

    // 500 cL of milk is 5 L, and milk weighs 1.03 g/mL, so it contributes
    // 5150 g rather than the 5000 g a water-density approximation would give.
    expect(list.shoppingList.value).toEqual([
      expect.objectContaining({ name: 'lait', quantity: 5650, unit: 'g' })
    ])
  })

  it('weighs a volume of oil at its own density, not water’s', async () => {
    // Colza rather than olive: olive oil is a staple no recipe puts on the list.
    const recipe = makeRecipe({ ingredients: [ingredient('huile de colza', 1, 'L')] })
    const list = await withRecipes([recipe])
    list.addRecipe(recipe, 1)

    expect(list.shoppingList.value[0].quantity).toBe(915)
  })

  it('sums a quantity onto a row that started without one', async () => {
    // Both key to "farine g", so the second addition lands on the first's
    // row, which has no running total to add to yet.
    const a = makeRecipe({ slug: 'a', ingredients: [ingredient('farine', null, 'g')] })
    const b = makeRecipe({ slug: 'b', ingredients: [ingredient('farine', 5, 'g')] })
    const list = await withRecipes([a, b])
    list.addRecipe(a, 1)
    list.addRecipe(b, 1)

    expect(list.shoppingList.value).toEqual([
      expect.objectContaining({ name: 'farine', quantity: 5, unit: 'g' })
    ])
  })

  it('leaves a row quantity untouched when a later ingredient has none', async () => {
    // Both key to "farine g", but the second addition has no amount of its
    // own, so it must not zero out or otherwise touch the running total.
    const a = makeRecipe({ slug: 'a', ingredients: [ingredient('farine', 5, 'g')] })
    const b = makeRecipe({ slug: 'b', ingredients: [ingredient('farine', null, 'g')] })
    const list = await withRecipes([a, b])
    list.addRecipe(a, 1)
    list.addRecipe(b, 1)

    expect(list.shoppingList.value).toEqual([
      expect.objectContaining({ name: 'farine', quantity: 5, unit: 'g' })
    ])
  })

  it('keeps an item ticked off when the recipe is added again', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 1)
    const salt = list.shoppingList.value.find(item => item.name === 'salt')
    list.toggleItem(salt.id)

    list.addRecipe(makeRecipe(), 1)

    expect(list.shoppingList.value.find(item => item.name === 'salt')).toMatchObject({
      checked: true,
      quantity: 1
    })
    expect(list.shoppingList.value.filter(item => item.checked)).toHaveLength(1)
  })

  it('always excludes pantry staples like water, salt, pepper and olive oil', async () => {
    const recipe = makeRecipe({
      ingredients: [
        ingredient('avocado', 1),
        ingredient('Eau', 200, 'ml'),
        ingredient(' sel ', 5, 'g'),
        ingredient('POIVRE', 1, 'pincée'),
        ingredient("huile d'olive", 20, 'g'),
        // The apostrophe a phone keyboard types, not the one recipes use.
        ingredient('Huile d’olive', 3, 'cuillères à soupe')
      ]
    })
    const list = await withRecipes([recipe])
    list.addRecipe(recipe, 1)

    expect(list.shoppingList.value.map(item => item.name)).toEqual(['avocado'])
  })

  it('keeps the rows of other recipes untouched', async () => {
    const soup = makeRecipe({ slug: 'soup', title: 'Soup' })
    const list = await withRecipes([makeRecipe(), soup])
    list.addRecipe(soup, 1)
    list.addRecipe(makeRecipe(), 1)
    list.addRecipe(makeRecipe(), 1)

    // The two additions of the same recipe merge into its three rows, and
    // the unrelated soup recipe's three rows are untouched by that merge.
    expect(list.shoppingList.value).toHaveLength(3)
    expect(list.state.menu.find(entry => entry.recipeId === 'soup').multiplier).toBe(1)
  })
})

describe('addExtraItem', () => {
  it('adds a row for something no recipe calls for', async () => {
    const list = await withRecipes([])
    list.addExtraItem('huile d’olive', 2, 'bouteilles')

    expect(list.shoppingList.value).toEqual([
      expect.objectContaining({ name: 'huile d’olive', quantity: 2, unit: 'bouteilles', checked: false })
    ])
  })

  it('leaves the row without an amount when no quantity is given', async () => {
    const list = await withRecipes([])
    list.addExtraItem('huile d’olive', null, '')

    expect(list.shoppingList.value[0].quantity).toBeNull()
  })

  it('trims the name and ignores one that is only whitespace', async () => {
    const list = await withRecipes([])
    list.addExtraItem('  beurre  ', 1, '')
    list.addExtraItem('   ', 1, '')

    expect(list.shoppingList.value.map(item => item.name)).toEqual(['beurre'])
  })

  it('sums repeated adds of the same thing onto one row', async () => {
    const list = await withRecipes([])
    list.addExtraItem('huile d’olive', 2, 'bouteilles')
    list.addExtraItem('huile d’olive', 1, 'bouteilles')

    expect(list.shoppingList.value).toHaveLength(1)
    expect(list.shoppingList.value[0].quantity).toBe(3)
  })

  it('merges with the same ingredient coming from a recipe', async () => {
    const recipe = makeRecipe({ ingredients: [ingredient('beurre', 100, 'g')] })
    const list = await withRecipes([recipe])
    list.addRecipe(recipe, 1)
    list.addExtraItem('beurre', 250, 'g')

    expect(list.shoppingList.value).toHaveLength(1)
    expect(list.shoppingList.value[0].quantity).toBe(350)
  })

  it('converts to the canonical unit, so 1 kg lands on the gram row', async () => {
    const recipe = makeRecipe({ ingredients: [ingredient('farine', 500, 'g')] })
    const list = await withRecipes([recipe])
    list.addRecipe(recipe, 1)
    list.addExtraItem('farine', 1, 'kg')

    expect(list.shoppingList.value).toHaveLength(1)
    expect(list.shoppingList.value[0]).toMatchObject({ quantity: 1500, unit: 'g' })
  })

  it('lists a staple a recipe would have hidden, since it was asked for by name', async () => {
    // `sel` is on the always-excluded list: nobody shops for the salt a
    // recipe mentions, but someone typing it into the form means it.
    const list = await withRecipes([])
    list.addExtraItem('sel', 1, '')

    expect(list.shoppingList.value.map(item => item.name)).toEqual(['sel'])
  })

  it('brings back something that had been removed from the list', async () => {
    const recipe = makeRecipe({ ingredients: [ingredient('beurre', 100, 'g')] })
    const list = await withRecipes([recipe])
    list.addRecipe(recipe, 1)
    list.removeItem(list.shoppingList.value[0].id)
    expect(list.shoppingList.value).toEqual([])

    list.addExtraItem('beurre', 250, 'g')

    expect(list.state.excluded).toEqual([])
    expect(list.shoppingList.value[0].quantity).toBe(350)
  })
})

describe('mutations', () => {
  it('toggles an item and updates the outstanding count', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 1)
    const [first] = list.shoppingList.value

    list.toggleItem(first.id)
    expect(list.shoppingList.value.find(item => item.id === first.id).checked).toBe(true)
    expect(list.itemCount.value).toBe(2)
    expect(list.totalCount.value).toBe(3)

    list.toggleItem(first.id)
    expect(list.shoppingList.value.find(item => item.id === first.id).checked).toBe(false)
  })

  it('ignores a toggle for an unknown id', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 1)
    expect(() => list.toggleItem('nope')).not.toThrow()
    expect(list.itemCount.value).toBe(3)
  })

  it('excludes a single item from the list', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 1)
    list.removeItem(list.shoppingList.value[0].id)
    expect(list.shoppingList.value).toHaveLength(2)
  })

  it('records an exclusion once, by name, however often it is asked for', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 1)
    const [{ id, name }] = list.shoppingList.value

    list.removeItem(id)
    list.removeItem(id)

    expect(list.shoppingList.value).toHaveLength(2)
    expect(list.state.excluded).toEqual([name])
  })

  it('keeps an ingredient excluded whatever unit the next recipe measures it in', async () => {
    // Spoons never convert to grams, so these two land on different rows;
    // removing one is still about the beurre, not about the spoon.
    const spoons = makeRecipe({ slug: 'spoons', ingredients: [ingredient('beurre', 3, 'cuillères à soupe')] })
    const grams = makeRecipe({ slug: 'grams', ingredients: [ingredient('beurre', 20, 'g')] })
    const list = await withRecipes([spoons, grams])
    list.addRecipe(spoons, 1)
    list.removeItem(list.shoppingList.value[0].id)

    list.addRecipe(grams, 1)

    expect(list.shoppingList.value).toEqual([])
  })

  it('matches an exclusion however the next recipe spells the name', async () => {
    const lower = makeRecipe({ slug: 'lower', ingredients: [ingredient("huile d'arachide", 10, 'g')] })
    const upper = makeRecipe({ slug: 'upper', ingredients: [ingredient('Huile d’arachide ', 10, 'g')] })
    const list = await withRecipes([lower, upper])
    list.addRecipe(lower, 1)
    list.removeItem(list.shoppingList.value[0].id)

    list.addRecipe(upper, 1)

    expect(list.shoppingList.value).toEqual([])
  })

  it('ignores a removal for an unknown id', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 1)

    list.removeItem('nope')

    expect(list.state.excluded).toEqual([])
    expect(list.shoppingList.value).toHaveLength(3)
  })

  it('clears the list, the menu and the hand-added items together', async () => {
    const list = await withRecipes([makeRecipe()])
    list.addRecipe(makeRecipe(), 1)
    list.addExtraItem('huile d’olive', 2, 'bouteilles')
    list.clearList()

    expect(list.shoppingList.value).toEqual([])
    expect(list.state.menu).toEqual([])
    expect(list.state.extras).toEqual([])
  })

  it('excludes a hand-added item like any other row', async () => {
    const list = await withRecipes([])
    list.addExtraItem('huile d’olive', 2, 'bouteilles')
    list.removeItem(list.shoppingList.value[0].id)

    expect(list.shoppingList.value).toEqual([])
  })

  it('removes one recipe from both the list and the menu', async () => {
    const other = makeRecipe({ slug: 'other', title: 'Other' })
    const list = await withRecipes([makeRecipe(), other])
    list.addRecipe(makeRecipe(), 1)
    list.addRecipe(other, 1)

    list.removeRecipe('guacamole')
    expect(list.state.menu.map(entry => entry.recipeId)).toEqual(['other'])
    expect(list.shoppingList.value).toHaveLength(3)
  })
})

describe('persistence', () => {
  it('survives a reload', async () => {
    const recipe = makeRecipe()
    saveRecipeCache({ sha: 'sha1', files: filesOf([recipe]), version: __APP_VERSION__ })
    ;(await import('../../src/composables/useShoppingList.js')).useShoppingList().addRecipe(recipe, 2)

    vi.resetModules()
    const reloaded = (await import('../../src/composables/useShoppingList.js')).useShoppingList()

    expect(reloaded.shoppingList.value).toHaveLength(3)
    expect(reloaded.state.menu[0].multiplier).toBe(2)
  })

  it('keeps hand-added items across a reload', async () => {
    saveRecipeCache({ sha: 'sha1', files: {}, version: __APP_VERSION__ })
    ;(await import('../../src/composables/useShoppingList.js')).useShoppingList()
      .addExtraItem('huile d’olive', 2, 'bouteilles')

    vi.resetModules()
    const reloaded = (await import('../../src/composables/useShoppingList.js')).useShoppingList()

    expect(reloaded.shoppingList.value).toEqual([
      expect.objectContaining({ name: 'huile d’olive', quantity: 2, unit: 'bouteilles' })
    ])
  })
})
