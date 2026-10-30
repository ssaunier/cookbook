import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useShoppingList } from '../../src/composables/useShoppingList.js'
import { flushPromises } from '@vue/test-utils'
import RecipeShowView from '../../src/views/RecipeShowView.vue'
import { toRecipe } from '../../src/services/github.js'
import { ingredient, makeRecipe, mountView } from '../helpers.js'

const show = (recipes, slug) =>
  mountView(RecipeShowView, { props: { recipes }, route: `/r/${slug}` })

describe('RecipeShowView', () => {
  it('renders the recipe matching the route', async () => {
    const view = await show([makeRecipe()], 'guacamole')
    expect(view.text()).toContain('Guacamole')
    expect(view.text()).toContain('Some people call it guac.')
  })

  it('puts the recipe name in the document title, and restores it on leaving', async () => {
    const view = await show([makeRecipe()], 'guacamole')
    expect(document.title).toBe('Guacamole - Cookbook')
    view.unmount()
    expect(document.title).toBe('Cookbook')
  })

  it('shows quantities, units and the yield', async () => {
    const view = await show([makeRecipe()], 'guacamole')
    expect(view.text()).toContain('0.5 teaspoon')
    expect(view.text()).toContain('Makes 4 Servings')
  })

  it('pluralizes a counted ingredient with no unit', async () => {
    const recipe = makeRecipe({ ingredients: [ingredient('egg', 4)] })
    const view = await show([recipe], 'guacamole')
    expect(view.find('ul li').text()).toBe('4eggs')
  })

  it('does not pluralize a single count, or a count carrying a unit', async () => {
    const recipe = makeRecipe({ ingredients: [ingredient('egg', 1), ingredient('flour', 200, 'g')] })
    const view = await show([recipe], 'guacamole')
    const [egg, flour] = view.findAll('ul li')
    expect(egg.text()).toBe('1egg')
    expect(flour.text()).toBe('200 gflour')
  })

  it('shows an ingredient with no quantity by its name alone', async () => {
    const view = await show([makeRecipe()], 'guacamole')
    expect(view.text()).toContain('lemon juice')
    expect(view.text()).not.toContain('Selon le goût')
  })

  it('numbers the steps', async () => {
    const view = await show([makeRecipe()], 'guacamole')
    const steps = view.findAll('ol li').map(item => item.text())
    expect(steps).toHaveLength(2)
    expect(steps[0]).toContain('Mash the avocado.')
  })

  it('numbers the steps from one again inside each instruction group', async () => {
    const markdown = '# Cake\n\n---\n\n- *1* egg\n\n---\n\n## Batter\n\n1. Whisk\n1. Rest\n\n## Baking\n\n1. Bake\n'
    const view = await show([toRecipe(markdown, 'recipes/cake/recipe.md')], 'cake')
    const lists = view.findAll('ol')

    expect(view.text()).toContain('Batter')
    expect(view.text()).toContain('Baking')
    expect(lists).toHaveLength(2)
    expect(lists[1].findAll('li')).toHaveLength(1)
    expect(lists[1].text()).toContain('1Bake')
  })

  it('renders the markdown of a step, linking out to a new tab', async () => {
    const markdown = '# Cake\n\n---\n\n- *1* egg\n\n---\n\n1. Use **cold** [butter](https://example.org/b)\n'
    const view = await show([toRecipe(markdown, 'recipes/cake/recipe.md')], 'cake')
    const link = view.find('ol a')

    expect(view.find('ol strong').text()).toBe('cold')
    expect(link.attributes('href')).toBe('https://example.org/b')
    expect(link.attributes('target')).toBe('_blank')
  })

  it('renders the markdown of an ingredient whose line is more than a link', async () => {
    const markdown = "# Cake\n\n---\n\n- *1* boite d'[agent _Slider_](https://example.org/s)\n"
    const view = await show([toRecipe(markdown, 'recipes/cake/recipe.md')], 'cake')
    const link = view.find('ul a')

    expect(view.text()).not.toContain('](')
    expect(link.text()).toBe('agent Slider')
    expect(link.attributes('href')).toBe('https://example.org/s')
    expect(link.attributes('target')).toBe('_blank')
  })

  it('opens an ingredient link in a new tab', async () => {
    const markdown = '# Cake\n\n---\n\n- *1* [egg](https://example.org/e)\n'
    const view = await show([toRecipe(markdown, 'recipes/cake/recipe.md')], 'cake')
    const link = view.find('ul a')

    expect(link.attributes('href')).toBe('https://example.org/e')
    expect(link.attributes('target')).toBe('_blank')
  })

  it('groups ingredients under their group heading', async () => {
    const markdown = '# Cake\n\n---\n\n- *1 pinch* salt\n\n## Sponge\n\n- *200 g* flour\n'
    const view = await show([toRecipe(markdown, 'recipes/cake/recipe.md')], 'cake')

    expect(view.text()).toContain('Sponge')
    expect(view.text()).toContain('200 g')
  })

  it('renders source links', async () => {
    const recipe = makeRecipe({ sources: [{ title: 'Blog', url: 'https://example.org/a' }] })
    const view = await show([recipe], 'guacamole')

    const link = view.findAll('a').find(a => a.text() === 'Blog')
    expect(link.attributes('href')).toBe('https://example.org/a')
  })

  it('links an ingredient that points at another recipe', async () => {
    const recipe = makeRecipe({
      ingredients: [{ ...ingredient('pesto'), link: './pesto.md' }]
    })
    const view = await show([recipe], 'guacamole')
    expect(view.findAll('a').some(a => a.attributes('href') === './pesto.md')).toBe(true)
  })

  it('says so when the slug matches nothing', async () => {
    const view = await show([makeRecipe()], 'missing')
    expect(view.text()).toContain('Recipe not found')
  })

  it('handles a recipe with no ingredients or instructions', async () => {
    const view = await show([makeRecipe({ ingredients: [], steps: [] })], 'guacamole')
    expect(view.text()).toContain('This recipe lists no ingredients.')
    expect(view.text()).toContain('This recipe has no instructions.')
  })

  it('opens the scaling dialog', async () => {
    const view = await show([makeRecipe()], 'guacamole')
    expect(view.text()).not.toContain('Multiplier')

    await view.findAll('button').find(b => b.text().includes('Add to shopping list')).trigger('click')
    expect(view.text()).toContain('Multiplier')
  })

  it('goes to the shopping list once the recipe is added', async () => {
    const view = await show([makeRecipe()], 'guacamole')

    await view.findAll('button').find(b => b.text().includes('Add to shopping list')).trigger('click')
    await view.findAll('button').find(b => b.text() === 'Add to list').trigger('click')
    await flushPromises()

    expect(view.vm.$route.path).toBe('/shopping-list')
  })

  describe('adding a single ingredient', () => {
    beforeEach(() => {
      localStorage.clear()
      useShoppingList().clearList()
    })

    it('adds the ingredient as shown, without opening the dialog', async () => {
      const view = await show([makeRecipe()], 'guacamole')
      const { state } = useShoppingList()

      await view.find('button[aria-label="Add salt to shopping list"]').trigger('click')

      expect(state.extras).toMatchObject([{ name: 'salt', quantity: 0.5, unit: 'teaspoon' }])
      expect(state.menu).toHaveLength(0)
      expect(view.text()).not.toContain('Multiplier')
      expect(view.vm.$route.path).toBe('/r/guacamole')
    })

    it('confirms the add on the button, then goes back to a plus', async () => {
      vi.useFakeTimers()
      try {
        const view = await show([makeRecipe()], 'guacamole')
        const button = view.find('button[aria-label="Add avocado to shopping list"]')

        await button.trigger('click')
        expect(button.find('path').attributes('d')).toBe('M4 10.5l4 4 8-9')
        expect(view.find('[role="status"]').text()).toBe('Added to shopping list')

        await vi.advanceTimersByTimeAsync(1500)
        expect(button.find('path').attributes('d')).toBe('M10 4v12M4 10h12')
        expect(view.find('[role="status"]').text()).toBe('')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
