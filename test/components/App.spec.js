import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { filesOf, makeRecipe } from '../helpers.js'
import { repositoryUrl } from '../config.fixture.js'

vi.mock('../../src/services/github.js', async () => {
  const actual = await vi.importActual('../../src/services/github.js')
  return { ...actual, getLatestSha: vi.fn(), downloadRecipes: vi.fn() }
})

let App, github, i18n, routes

// The whole tree is re-imported per test so useRecipes starts empty. Everything
// mounted must come from this same registry, or the component tree and
// useLocale would end up holding two different i18n instances.
beforeEach(async () => {
  vi.resetModules()
  github = await import('../../src/services/github.js')
  github.getLatestSha.mockReset().mockResolvedValue('abc1234def')
  github.downloadRecipes.mockReset().mockResolvedValue(filesOf([makeRecipe()]))
  ;({ i18n } = await import('../../src/i18n/index.js'))
  ;({ routes } = await import('../../src/router.js'))
  App = (await import('../../src/App.vue')).default
})

async function mountApp(route = '/') {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(route)
  await router.isReady()

  const app = mount(App, { global: { plugins: [i18n, router] } })
  await flushPromises()
  return app
}

describe('App', () => {
  it('loads recipes on mount and renders the index', async () => {
    const app = await mountApp()
    expect(github.getLatestSha).toHaveBeenCalled()
    expect(app.text()).toContain('Guacamole')
  })

  it('renders the navigation and the cache marker', async () => {
    const app = await mountApp()
    expect(app.text()).toContain('Recipes')
    expect(app.text()).toContain('Menu')
    expect(app.text()).toContain('abc1234')
  })

  it('shows the recipe count in the nav, in grey rather than the counter blue', async () => {
    const app = await mountApp()
    const badge = app.find('nav a[href="/"] span')

    expect(badge.text()).toBe('1')
    expect(badge.classes()).toContain('text-slate-400')
    expect(badge.classes()).not.toContain('text-blue-600')
  })

  it('keeps only the brand mark in the header on a narrow screen', async () => {
    const app = await mountApp()
    const brand = app.find('header a[href="/"]')

    expect(brand.attributes('aria-label')).toBe('Cookbook')
    // The wordmark is hidden below the `sm` breakpoint so the counters fit.
    expect(brand.find('div.hidden.sm\\:block').text()).toContain('Cookbook')
  })

  it('shows an error banner and can retry', async () => {
    github.getLatestSha.mockRejectedValueOnce(new Error('network down'))
    const app = await mountApp()

    expect(app.text()).toContain('Couldn’t load the recipes')
    expect(app.text()).toContain('network down')

    await app.findAll('button').find(b => b.text() === 'Try again').trigger('click')
    await flushPromises()
    expect(app.text()).toContain('Guacamole')
  })

  it('links the source repository from the footer', async () => {
    const app = await mountApp()
    const link = app.findAll('a').find(a => a.attributes('href') === repositoryUrl)

    expect(link.attributes('rel')).toBe('noreferrer')
  })

  it('links the cache marker to the commit on GitHub', async () => {
    const app = await mountApp()
    const link = app.findAll('a').find(a => a.text() === 'abc1234')

    expect(link.attributes('href')).toBe(`${repositoryUrl}/commit/abc1234def`)
    expect(link.attributes('target')).toBe('_blank')
  })

  it('switches locale from the footer and persists it', async () => {
    const app = await mountApp()
    const fr = app.findAll('button').find(b => b.text() === 'fr')

    await fr.trigger('click')
    await flushPromises()

    expect(app.text()).toContain('Recettes')
    expect(localStorage.getItem('cookbook:locale:v1')).toBe('fr')
    expect(document.documentElement.lang).toBe('fr')
  })

  it('shows a badge once the shopping list has items', async () => {
    const app = await mountApp()
    const { useShoppingList } = await import('../../src/composables/useShoppingList.js')
    const list = useShoppingList()
    list.clearList()
    list.addRecipe(makeRecipe(), 1)
    await app.vm.$nextTick()

    expect(app.find('nav').text()).toMatch(/List\s*3/)
    list.clearList()
  })

  it('navigates to the shopping list route', async () => {
    const app = await mountApp('/shopping-list')
    expect(app.text()).toContain('Shopping list')
  })
})
