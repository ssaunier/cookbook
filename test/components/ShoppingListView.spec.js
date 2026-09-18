import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShoppingListView from '../../src/views/ShoppingListView.vue'
import { useShoppingList } from '../../src/composables/useShoppingList.js'
import { useRecipes } from '../../src/composables/useRecipes.js'
import * as github from '../../src/services/github.js'
import { i18n } from '../../src/i18n/index.js'
import { filesOf, ingredient, makeRecipe, mountView } from '../helpers.js'

vi.mock('../../src/services/github.js', async () => {
  const actual = await vi.importActual('../../src/services/github.js')
  return { ...actual, getLatestSha: vi.fn(), downloadRecipes: vi.fn() }
})

const list = useShoppingList()
const { refresh } = useRecipes()

/** Three ingredients whose names sort differently from their written order. */
const greengrocer = [ingredient('zucchini', 2), ingredient('échalote', 1), ingredient('ail', 3)]

let nextSha = 0

/**
 * `useShoppingList` looks ingredients up on `useRecipes`'s live list rather
 * than storing its own copy, so a test has to publish the recipe it wants to
 * add there first — the way a real fetch would — before adding it to the menu.
 */
async function addRecipe(recipe, multiplier) {
  github.getLatestSha.mockResolvedValue(`sha${nextSha++}`)
  github.downloadRecipes.mockResolvedValue({ files: filesOf([recipe]), complete: true })
  await refresh()
  list.addRecipe(recipe, multiplier)
}

beforeEach(() => list.clearList())

describe('ShoppingListView', () => {
  it('shows the empty state', async () => {
    const view = await mountView(ShoppingListView)
    expect(view.text()).toContain('Your cart is empty')
  })

  it('lists every ingredient as one flat list', async () => {
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)

    expect(view.text()).toContain('Avocado')
    expect(view.text()).toContain('Lemon juice')
    expect(view.findAll('li')).toHaveLength(3)
  })

  it('counts what is left against the total', async () => {
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)
    expect(view.text()).toContain('3 remaining')
    expect(view.text()).toContain('3 total')
  })

  it('checks an item off, and only once', async () => {
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)

    // The row handler must not fire as well, or the item would toggle back.
    await view.find('[aria-label="Check item"]').trigger('click')
    expect(list.itemCount.value).toBe(2)
    expect(view.text()).toContain('2 remaining')
    expect(view.find('[aria-label="Uncheck item"]').exists()).toBe(true)
  })

  it('checks an item off by clicking anywhere on the row', async () => {
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)

    // The click handler lives on the row's content div, not the <li> itself,
    // since the <li> also hosts the swipe-to-delete overlay on mobile.
    await view.find('li > div').trigger('click')
    expect(list.itemCount.value).toBe(2)
  })

  it('removes an item once the confirmation is accepted', async () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)

    // The desktop text button asks for confirmation; the mobile swipe
    // button (below) does not, since the swipe itself is the confirmation.
    await view.find('button.sm\\:inline-block').trigger('click')

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Avocado'))
    expect(list.shoppingList.value).toHaveLength(2)
  })

  it('keeps the item, unchecked, when the confirmation is dismissed', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)

    await view.find('button.sm\\:inline-block').trigger('click')
    expect(list.shoppingList.value).toHaveLength(3)
    // The row's own click handler must not have fired behind the button.
    expect(list.itemCount.value).toBe(3)
  })

  it('removes an item on mobile with a tap, without confirmation', async () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)

    await view.find('button.sm\\:hidden').trigger('click')

    expect(confirm).not.toHaveBeenCalled()
    expect(list.shoppingList.value).toHaveLength(2)
  })

  it('adds an item nobody cooked from, through the dialog', async () => {
    const view = await mountView(ShoppingListView)
    await view.findAll('button').find(b => b.text() === 'Add').trigger('click')

    await view.find('#extra-name').setValue('huile d’olive')
    await view.find('#extra-quantity').setValue('2 bouteilles')
    await view.find('form').trigger('submit')

    expect(view.text()).toContain('Huile d’olive')
    expect(view.text()).toContain('2 bouteilles')
    // The dialog closes behind the item it just added.
    expect(view.find('form').exists()).toBe(false)
  })

  it('offers the dialog from the empty state too', async () => {
    const view = await mountView(ShoppingListView)
    expect(view.text()).toContain('Your cart is empty')

    await view.findAll('button').find(b => b.text() === 'Add').trigger('click')
    expect(view.find('#extra-name').exists()).toBe(true)
  })

  it('keeps the clear-all button off the phone header', async () => {
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)
    const clear = view.findAll('button').find(b => b.text() === 'Clear all')

    expect(clear.classes()).toContain('hidden')
    expect(clear.classes()).toContain('sm:block')
  })

  it('leads with the ingredient name and trails the quantity', async () => {
    await addRecipe(makeRecipe({ ingredients: [ingredient('flour', 200, 'g')] }), 1)
    const view = await mountView(ShoppingListView)
    const flour = view.find('li')

    expect(flour.find('span.font-bold').text()).toBe('Flour')
    expect(flour.find('span.text-slate-500').text()).toBe('200 g')
  })

  it('pluralizes a counted ingredient with no unit', async () => {
    await addRecipe(makeRecipe({ ingredients: [ingredient('zucchini', 3)] }), 1)
    const view = await mountView(ShoppingListView)

    expect(view.find('li span.font-bold').text()).toBe('Zucchinis')
  })

  it('does not pluralize a count that carries a unit', async () => {
    await addRecipe(makeRecipe({ ingredients: [ingredient('flour', 200, 'g')] }), 1)
    const view = await mountView(ShoppingListView)

    expect(view.find('li span.font-bold').text()).toBe('Flour')
  })

  it('orders each group alphabetically by ingredient name', async () => {
    await addRecipe(makeRecipe({ ingredients: greengrocer }), 1)
    const view = await mountView(ShoppingListView)
    const names = view.findAll('li span.font-bold').map(node => node.text())

    expect(names).toEqual(['Ails', 'Échalote', 'Zucchinis'])
  })

  it('sinks checked items to the bottom of their group, alphabetical within each half', async () => {
    await addRecipe(makeRecipe({ ingredients: greengrocer }), 1)
    list.toggleItem(list.shoppingList.value.find(item => item.name === 'zucchini').id)
    const view = await mountView(ShoppingListView)
    const names = view.findAll('li span.font-bold').map(node => node.text())

    expect(names).toEqual(['Ails', 'Échalote', 'Zucchinis'])

    await view.find('li > div').trigger('click')
    const reordered = view.findAll('li span.font-bold').map(node => node.text())
    expect(reordered).toEqual(['Échalote', 'Ails', 'Zucchinis'])
  })

  it('orders checked items by most recently checked first', async () => {
    await addRecipe(makeRecipe({ ingredients: greengrocer }), 1)
    // Both checks can land in the same millisecond on a fast machine, so pin
    // Date.now() explicitly rather than relying on real spacing between calls.
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValueOnce(1)
    list.toggleItem(list.shoppingList.value.find(item => item.name === 'zucchini').id)
    now.mockReturnValueOnce(2)
    list.toggleItem(list.shoppingList.value.find(item => item.name === 'ail').id)
    const view = await mountView(ShoppingListView)
    const names = view.findAll('li span.font-bold').map(node => node.text())

    expect(names).toEqual(['Échalote', 'Ails', 'Zucchinis'])
  })

  it('clears the whole list once the confirmation is accepted', async () => {
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)

    await view.findAll('button').find(b => b.text() === 'Clear all').trigger('click')

    expect(confirm).toHaveBeenCalledWith('Clear the whole shopping list?')
    expect(list.shoppingList.value).toHaveLength(0)
  })

  it('keeps the list when the clear confirmation is dismissed', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)

    await view.findAll('button').find(b => b.text() === 'Clear all').trigger('click')
    expect(list.shoppingList.value).toHaveLength(3)
  })

  it('scales the displayed quantity by the multiplier', async () => {
    await addRecipe(makeRecipe({ ingredients: [ingredient('flour', 0.5, 'g')] }), 3)
    const view = await mountView(ShoppingListView)
    expect(view.text()).toContain('1.5 g')
  })

  it('hides the quantity for spoon- and pinch-based units', async () => {
    await addRecipe(makeRecipe({
      ingredients: [
        ingredient('salt', 0.5, 'teaspoon'),
        ingredient('sugar', 2, 'cuillère à soupe'),
        ingredient('pepper', 1, 'pincée'),
        ingredient('flour', 200, 'g')
      ]
    }), 1)
    const view = await mountView(ShoppingListView)

    expect(view.text()).not.toContain('0.5')
    expect(view.text()).not.toContain('teaspoon')
    expect(view.text()).not.toContain('cuillère')
    expect(view.text()).not.toContain('pincée')
    expect(view.text()).toContain('200 g')
  })

  it('shows a large gram figure in kilos', async () => {
    await addRecipe(makeRecipe({ ingredients: [ingredient('flour', 1200, 'g')] }), 1)
    const view = await mountView(ShoppingListView)

    expect(view.text()).toContain('1.2 kg')
  })

  it('shows a liquid by volume, since that is how it is sold', async () => {
    // Milk is stored in grams like everything else, but nobody buys 1545 g of
    // it; at 1.03 g/mL that is the 1.5 L carton the shelf is stocked with.
    await addRecipe(makeRecipe({ ingredients: [ingredient('milk', 150, 'cl')] }), 1)
    const view = await mountView(ShoppingListView)

    expect(view.text()).toContain('1.5 L')
    expect(view.text()).not.toContain('kg')
  })

  it('keeps a small liquid amount in millilitres', async () => {
    await addRecipe(makeRecipe({ ingredients: [ingredient('huile de colza', 25, 'cl')] }), 1)
    const view = await mountView(ShoppingListView)

    expect(view.text()).toContain('250 mL')
  })

  it('still weighs a solid, however oily its name sounds', async () => {
    await addRecipe(makeRecipe({ ingredients: [ingredient('olives', 200, 'g')] }), 1)
    const view = await mountView(ShoppingListView)

    expect(view.text()).toContain('200 g')
  })

  // The row slides under a fixed reveal button: the button is translated by
  // REVEAL_WIDTH (80) plus the row's offset, so 80px is shut and 0px is open.
  describe('swipe to delete', () => {
    const touch = clientX => ({ touches: [{ clientX }] })
    const revealOf = row => row.find('button.sm\\:hidden').attributes('style')

    /** The row's own content div, which carries the touch handlers. */
    const rowsOf = view => view.findAll('li')

    async function drag(row, from, ...positions) {
      await row.find('div').trigger('touchstart', touch(from))
      for (const x of positions) await row.find('div').trigger('touchmove', touch(x))
    }

    it('opens the row when the drag passes the halfway point', async () => {
      await addRecipe(makeRecipe({ ingredients: [ingredient('flour', 200, 'g')] }), 1)
      const view = await mountView(ShoppingListView)
      const [row] = rowsOf(view)

      await drag(row, 200, 100)
      await row.find('div').trigger('touchend')

      expect(revealOf(row)).toContain('translateX(0px)')
    })

    it('snaps shut again when the drag stops short of it', async () => {
      await addRecipe(makeRecipe({ ingredients: [ingredient('flour', 200, 'g')] }), 1)
      const view = await mountView(ShoppingListView)
      const [row] = rowsOf(view)

      await drag(row, 200, 180)
      await row.find('div').trigger('touchend')

      expect(revealOf(row)).toContain('translateX(80px)')
    })

    it('tracks the finger mid-drag and clamps to the reveal width', async () => {
      await addRecipe(makeRecipe({ ingredients: [ingredient('flour', 200, 'g')] }), 1)
      const view = await mountView(ShoppingListView)
      const [row] = rowsOf(view)

      await drag(row, 200, 170)
      expect(revealOf(row)).toContain('translateX(50px)')

      // Dragging further than the button is wide must not tear it off the row.
      await row.find('div').trigger('touchmove', touch(-400))
      expect(revealOf(row)).toContain('translateX(0px)')

      // Nor may dragging the other way push it out past its resting place.
      await row.find('div').trigger('touchmove', touch(400))
      expect(revealOf(row)).toContain('translateX(80px)')
    })

    it('does not tick the item off at the end of a swipe', async () => {
      await addRecipe(makeRecipe({ ingredients: [ingredient('flour', 200, 'g')] }), 1)
      const view = await mountView(ShoppingListView)
      const [row] = rowsOf(view)

      await drag(row, 200, 100)
      await row.find('div').trigger('touchend')
      // The browser fires a click of its own once the finger lifts.
      await row.find('div').trigger('click')

      expect(list.itemCount.value).toBe(1)
    })

    it('spends the next tap closing the row rather than ticking it off', async () => {
      await addRecipe(makeRecipe({ ingredients: [ingredient('flour', 200, 'g')] }), 1)
      const view = await mountView(ShoppingListView)
      const [row] = rowsOf(view)

      await drag(row, 200, 100)
      await row.find('div').trigger('touchend')
      await row.find('div').trigger('click')

      await row.find('div').trigger('click')
      expect(revealOf(row)).toContain('translateX(80px)')
      expect(list.itemCount.value).toBe(1)

      // Only once it is shut does a tap mean what it usually means.
      await row.find('div').trigger('click')
      expect(list.itemCount.value).toBe(0)
    })

    it('closes an open row when another one is touched', async () => {
      await addRecipe(makeRecipe({
        ingredients: [ingredient('ail', 3), ingredient('basilic', 1)]
      }), 1)
      const view = await mountView(ShoppingListView)
      const [first, second] = rowsOf(view)

      await drag(first, 200, 100)
      await first.find('div').trigger('touchend')
      expect(revealOf(first)).toContain('translateX(0px)')

      await second.find('div').trigger('touchstart', touch(200))
      expect(revealOf(first)).toContain('translateX(80px)')
    })

    it('removes the item from the reveal button without confirming', async () => {
      const confirm = vi.fn(() => true)
      vi.stubGlobal('confirm', confirm)
      await addRecipe(makeRecipe({ ingredients: [ingredient('flour', 200, 'g')] }), 1)
      const view = await mountView(ShoppingListView)
      const [row] = rowsOf(view)

      await drag(row, 200, 100)
      await row.find('div').trigger('touchend')
      await row.find('button.sm\\:hidden').trigger('click')

      // The swipe was the confirmation.
      expect(confirm).not.toHaveBeenCalled()
      expect(list.shoppingList.value).toEqual([])
    })
  })

  it('follows the active locale', async () => {
    await addRecipe(makeRecipe(), 1)
    const view = await mountView(ShoppingListView)
    expect(view.text()).toContain('3 remaining')

    i18n.global.locale.value = 'fr'
    await view.vm.$nextTick()
    expect(view.text()).toContain('3 restants')
  })
})
