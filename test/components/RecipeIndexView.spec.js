import { describe, expect, it, vi } from 'vitest'
import RecipeIndexView from '../../src/views/RecipeIndexView.vue'
import { i18n } from '../../src/i18n/index.js'
import { ingredient, makeRecipe, mountView } from '../helpers.js'

const recipes = [
  makeRecipe({ slug: 'guac', title: 'Guacamole', tags: ['sauce', 'vegan'] }),
  makeRecipe({
    slug: 'tarte',
    title: 'Tarte Tatin',
    tags: ['dessert'],
    description: 'Caramelised apples.',
    ingredients: [ingredient('apple', 6), ingredient('butter', 50, 'gram'), ingredient('sugar', 100, 'gram')]
  })
]

describe('RecipeIndexView', () => {
  it('lists every recipe', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    expect(view.text()).toContain('Guacamole')
    expect(view.text()).toContain('Tarte Tatin')
  })

  it('shows the ingredient count per card', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    expect(view.text()).toContain('3 ingredients')
  })

  it('filters by search text', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    await view.find('#recipe-search').setValue('tatin')

    expect(view.text()).toContain('Tarte Tatin')
    expect(view.text()).not.toContain('Guacamole')
  })

  it('searches the description and tags too', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    await view.find('#recipe-search').setValue('caramelised')
    expect(view.text()).toContain('Tarte Tatin')

    await view.find('#recipe-search').setValue('vegan')
    expect(view.text()).toContain('Guacamole')
    expect(view.text()).not.toContain('Tarte Tatin')
  })

  it('searches the ingredient list too', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    await view.find('#recipe-search').setValue('butter')

    expect(view.text()).toContain('Tarte Tatin')
    expect(view.text()).not.toContain('Guacamole')
  })

  it('filters by tag and offers every tag once, sorted', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    const labels = view.findAll('button').map(button => button.text())
    expect(labels).toEqual(['All', 'dessert', 'sauce', 'vegan'])

    await view.findAll('button')[1].trigger('click')
    expect(view.text()).toContain('Tarte Tatin')
    expect(view.text()).not.toContain('Guacamole')

    // "All" clears the filter again.
    await view.findAll('button')[0].trigger('click')
    expect(view.text()).toContain('Guacamole')
  })

  it('reads the tag out of the URL', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes }, route: '/?tag=dessert' })
    expect(view.text()).toContain('Tarte Tatin')
    expect(view.text()).not.toContain('Guacamole')
  })

  // Changing only the query string keeps this component mounted, so the tag
  // has to be re-read on navigation and not just at setup: this is a shared
  // link followed while the index is already on screen.
  it('applies a tag that arrives after the page is on screen', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    expect(view.text()).toContain('Guacamole')

    await view.vm.$router.push('/?tag=dessert')
    await view.vm.$nextTick()

    expect(view.text()).toContain('Tarte Tatin')
    expect(view.text()).not.toContain('Guacamole')
  })

  it('clears the filter when the tag leaves the URL again', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes }, route: '/?tag=dessert' })
    expect(view.text()).not.toContain('Guacamole')

    await view.vm.$router.push('/')
    await view.vm.$nextTick()

    expect(view.text()).toContain('Guacamole')
  })

  it('matches an accented tag however the URL spells its accents', async () => {
    const accented = [
      makeRecipe({ slug: 'lasagnes', title: 'Lasagnes', tags: ['végétarien'] }),
      makeRecipe({ slug: 'pita', title: 'Pain Pita', tags: ['boulangerie'] })
    ]
    // 'e' plus a combining accent, the decomposed spelling of the precomposed
    // 'é' the recipe itself carries. Both render as végétarien.
    const view = await mountView(RecipeIndexView, {
      props: { recipes: accented },
      route: '/?tag=ve%CC%81ge%CC%81tarien'
    })

    expect(view.text()).toContain('Lasagnes')
    expect(view.text()).not.toContain('Pain Pita')
  })

  it('shows the empty state when nothing matches', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    await view.find('#recipe-search').setValue('zzzz')
    expect(view.text()).toContain('No recipes found')
  })

  it('links each card to its recipe', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    const hrefs = view.findAll('a').map(link => link.attributes('href'))
    expect(hrefs).toContain('/r/guac')
  })

  it('titles the page once', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    const headings = view.findAll('h1')

    expect(headings).toHaveLength(1)
    expect(headings[0].text()).toBe('Recipes')
  })

  it('focuses the search field on load, on desktop', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes }, attachTo: document.body })
    expect(document.activeElement).toBe(view.find('#recipe-search').element)
    view.unmount()
  })

  it('leaves the search field unfocused on load, on mobile', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false })

    const view = await mountView(RecipeIndexView, { props: { recipes }, attachTo: document.body })
    expect(document.activeElement).not.toBe(view.find('#recipe-search').element)
    view.unmount()
  })

  it('focuses the search field when / is pressed elsewhere on the page', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes }, attachTo: document.body })
    document.body.focus()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', cancelable: true }))
    expect(document.activeElement).toBe(view.find('#recipe-search').element)
    view.unmount()
  })

  it('leaves / alone while a field already has focus, so it can still be typed', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes }, attachTo: document.body })
    const input = view.find('#recipe-search')
    await input.setValue('Tarte')
    input.element.focus()

    const event = new KeyboardEvent('keydown', { key: '/', cancelable: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    view.unmount()
  })

  it('follows the active locale', async () => {
    const view = await mountView(RecipeIndexView, { props: { recipes } })
    expect(view.text()).toContain('3 ingredients')

    i18n.global.locale.value = 'fr'
    await view.vm.$nextTick()
    expect(view.text()).toContain('3 ingrédients')
  })
})
