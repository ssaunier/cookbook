import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { downloadRecipes, filesToRecipes, getLatestSha, RAW_FETCH_CONCURRENCY, toRecipe } from '../../src/services/github.js'

const FIXTURES = resolve(process.cwd(), 'test/fixtures/recipemd')
const fullRecipe = readFileSync(resolve(FIXTURES, 'full-recipe.md'), 'utf8')
const groups = readFileSync(resolve(FIXTURES, 'groups.md'), 'utf8')
const groupedInstructions = readFileSync(resolve(FIXTURES, 'grouped-instructions.md'), 'utf8')

/** Routes fetch by URL so each test only declares the responses it cares about. */
function stubFetch(routes) {
  const fetch = vi.fn(async url => {
    const match = Object.keys(routes).find(key => String(url).includes(key))
    if (!match) return { ok: false, status: 404 }
    const value = routes[match]
    if (value instanceof Error) throw value
    return {
      ok: true,
      status: 200,
      json: async () => value,
      text: async () => (typeof value === 'string' ? value : JSON.stringify(value))
    }
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

/**
 * A tree entry can be given as a bare path (its blob sha then just defaults
 * to the path itself, which is enough for tests that don't care about sha
 * equality) or as `{ path, sha }` for tests that need to control it.
 */
const tree = (...entries) => ({
  truncated: false,
  tree: entries.map(entry => (typeof entry === 'string' ? { path: entry, type: 'blob', sha: entry } : { type: 'blob', ...entry }))
})

describe('toRecipe', () => {
  it('maps a RecipeMD document onto the view shape', () => {
    const recipe = toRecipe(fullRecipe, 'recipes/guacamole/recipe.md')

    expect(recipe).toMatchObject({
      slug: 'guacamole',
      title: 'Guacamole',
      description: 'Some people call it guac.',
      tags: ['sauce', 'vegan'],
      servings: 4
    })
    expect(recipe.yields[0]).toMatchObject({ factor: 4, unit: 'Servings', label: '4 Servings' })
    expect(recipe.steps).toEqual(['Remove flesh from avocado and roughly mash with fork.'])
  })

  it('flattens ingredients and records their group', () => {
    const recipe = toRecipe(groups, 'recipes/cake/recipe.md')
    expect(recipe.ingredients.map(item => [item.name, item.group])).toEqual([
      ['salt', null], ['flour', 'Sponge'], ['eggs', 'Sponge'],
      ['water', 'Sponge › Syrup'], ['sugar', 'Sponge › Glaze'], ['butter', 'Frosting']
    ])
  })

  it('exposes the quantity and unit of every ingredient', () => {
    const [avocado, salt, , lemon] = toRecipe(fullRecipe, 'recipes/guacamole/recipe.md').ingredients
    expect(avocado).toMatchObject({ name: 'avocado', quantity: 1, unit: '' })
    expect(salt).toMatchObject({ name: 'salt', quantity: 0.5, unit: 'teaspoon' })
    expect(lemon).toMatchObject({ name: 'lemon juice', quantity: null, unit: '' })
  })

  it.each([
    ['recipes/pate-a-tartiner/recipe.md', 'pate-a-tartiner'],
    ['recipes/desserts/tarte/recipe.md', 'desserts-tarte'],
    ['recipes/quick.md', 'quick']
  ])('derives the slug of %s', (path, slug) => {
    expect(toRecipe(fullRecipe, path).slug).toBe(slug)
  })

  it('reads servings only from a yield expressed in eaters', () => {
    const noServings = toRecipe('# X\n\n**600 g de pâte**\n\n---\n\n- *1* egg\n', 'recipes/x.md')
    expect(noServings.servings).toBeNull()
    expect(noServings.yields[0].label).toBe('600 g de pâte')

    const french = toRecipe('# X\n\n**4 personnes**\n\n---\n\n- *1* egg\n', 'recipes/x.md')
    expect(french.servings).toBe(4)
  })

  it('splits a trailing Source block off the instructions', () => {
    const markdown = '# X\n\n---\n\n- *1* egg\n\n---\n\n1. Beat it\n1. Cook it\n\nSource:\n- [Blog](https://example.org/a)\n- https://example.org/b\n'
    const recipe = toRecipe(markdown, 'recipes/x.md')

    expect(recipe.steps).toEqual(['Beat it', 'Cook it'])
    expect(recipe.sources).toEqual([
      { title: 'Blog', url: 'https://example.org/a' },
      { title: 'https://example.org/b', url: 'https://example.org/b' }
    ])
  })

  it('groups the steps under the headings of the instructions', () => {
    const recipe = toRecipe(groupedInstructions, 'recipes/canneles-t80/recipe.md')

    expect(recipe.stepGroups.map(group => [group.title, group.steps.length]))
      .toEqual([['Pâte', 5], ['Cuisson', 3]])
    expect(recipe.stepGroups[1].steps[0]).toBe('Préchauffer le four à 250°C')
    expect(recipe.steps).toHaveLength(8)
    // The divider before the sources is a separator, not the tail of a step.
    expect(recipe.steps.at(-1)).toBe('Baisser à 175°C et cuire 1h')
    expect(recipe.sources.map(source => source.title))
      .toEqual(['Boulangerie Pas à Pas', 'Youtube Video'])
  })

  it('keeps the markdown of an ingredient whose link is only part of the line', () => {
    const recipe = toRecipe(groupedInstructions, 'recipes/canneles-t80/recipe.md')
    const slider = recipe.ingredients.at(-1)

    expect(slider.link).toBeNull()
    expect(slider.name).toContain('[agent de graîssage _Slider_](https://www.laboetgato.fr/')
  })

  it('puts ungrouped instructions in a single untitled group', () => {
    const recipe = toRecipe(fullRecipe, 'recipes/guacamole/recipe.md')
    expect(recipe.stepGroups).toEqual([{ title: null, steps: recipe.steps }])
  })

  it('falls back to paragraphs when instructions are not a list', () => {
    const recipe = toRecipe('# X\n\n---\n\n- *1* egg\n\n---\n\nFirst do this.\n\nThen do that.\n', 'recipes/x.md')
    expect(recipe.steps).toEqual(['First do this.', 'Then do that.'])
  })

  it('returns null for a document that is not valid RecipeMD', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(toRecipe('not a recipe', 'recipes/bad.md')).toBeNull()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('source repository configuration', () => {
  // The whole point of src/config.js: a fork edits it and nothing else. Every
  // other spec runs against the fixture test/setup.js pins in its place; this
  // block is where a config actually reaching the GitHub URLs is proven, by
  // mocking in a fork that shares no value with either.
  const forked = {
    recipesRepo: { owner: 'octocat', repo: 'dishes', branch: 'trunk', directory: 'plats' },
    repositoryUrl: 'https://github.com/octocat/dishes'
  }

  async function withForkedConfig() {
    vi.resetModules()
    vi.doMock('../../src/config.js', () => forked)
    return import('../../src/services/github.js')
  }

  it('builds the API and raw URLs from it', async () => {
    const fetch = stubFetch({
      '/git/trees/': tree('plats/a/recipe.md', 'recipes/ignored.md'),
      'plats/a/recipe.md': fullRecipe
    })
    const github = await withForkedConfig()

    const recipes = github.filesToRecipes(await github.downloadRecipes())
    const urls = fetch.mock.calls.map(([url]) => String(url))

    expect(urls[0]).toBe('https://api.github.com/repos/octocat/dishes/git/trees/trunk?recursive=1')
    expect(urls[1]).toBe('https://raw.githubusercontent.com/octocat/dishes/trunk/plats/a/recipe.md')
    // The configured directory drives both the filter and the slug.
    expect(recipes.map(item => item.slug)).toEqual(['a'])
  })

  it('follows the configured branch when reading the head sha', async () => {
    stubFetch({ '/commits/trunk': { sha: 'c0ffee' } })
    const github = await withForkedConfig()

    expect(await github.getLatestSha()).toBe('c0ffee')
  })

  it('scans the whole repository when no directory is configured', async () => {
    vi.resetModules()
    vi.doMock('../../src/config.js', () => ({
      ...forked,
      recipesRepo: { ...forked.recipesRepo, directory: '' }
    }))
    stubFetch({ '/git/trees/': tree('anywhere/a.md'), 'anywhere/a.md': fullRecipe })
    const github = await import('../../src/services/github.js')

    const recipes = github.filesToRecipes(await github.downloadRecipes())
    expect(recipes.map(item => item.slug)).toEqual(['anywhere-a'])
  })
})

describe('getLatestSha', () => {
  it('returns the head commit sha', async () => {
    stubFetch({ '/commits/main': { sha: 'deadbeef' } })
    expect(await getLatestSha()).toBe('deadbeef')
  })

  it('throws on a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
    await expect(getLatestSha()).rejects.toThrow(/503/)
  })
})

describe('downloadRecipes', () => {
  it('downloads every markdown file under recipes/', async () => {
    stubFetch({
      '/git/trees/': tree('README.md', 'recipes/a/recipe.md', 'recipes/b/recipe.md', 'LICENSE'),
      'recipes/a/recipe.md': fullRecipe,
      'recipes/b/recipe.md': groups
    })

    const recipes = filesToRecipes(await downloadRecipes())
    expect(recipes.map(item => item.slug).sort()).toEqual(['a', 'b'])
  })

  it('ignores files outside recipes/', async () => {
    stubFetch({ '/git/trees/': tree('README.md', 'docs/notes.md'), 'x': '' })
    expect(filesToRecipes(await downloadRecipes())).toEqual([])
  })

  it('skips a malformed recipe instead of failing the batch', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch({
      '/git/trees/': tree('recipes/good/recipe.md', 'recipes/bad/recipe.md'),
      'recipes/good/recipe.md': fullRecipe,
      'recipes/bad/recipe.md': 'no title here'
    })

    const recipes = filesToRecipes(await downloadRecipes())
    expect(recipes).toHaveLength(1)
    expect(recipes[0].slug).toBe('good')
  })

  it('refuses a truncated tree rather than showing a partial cookbook', async () => {
    stubFetch({ '/git/trees/': { truncated: true, tree: [] } })
    await expect(downloadRecipes()).rejects.toThrow(/truncated/i)
  })

  describe('incremental caching by blob sha', () => {
    it('reuses a cached recipe when its blob sha is unchanged', async () => {
      const fetch = stubFetch({ '/git/trees/': tree({ path: 'recipes/a/recipe.md', sha: 'blob-a' }) })
      const previousFiles = { 'recipes/a/recipe.md': { sha: 'blob-a', recipe: toRecipe(fullRecipe, 'recipes/a/recipe.md') } }

      const files = await downloadRecipes(previousFiles)

      expect(files['recipes/a/recipe.md']).toBe(previousFiles['recipes/a/recipe.md'])
      expect(fetch).toHaveBeenCalledTimes(1) // only the tree listing, no raw fetch
    })

    it('re-fetches only the files whose blob sha changed', async () => {
      const fetch = stubFetch({
        '/git/trees/': tree(
          { path: 'recipes/a/recipe.md', sha: 'blob-a' },
          { path: 'recipes/b/recipe.md', sha: 'blob-b-new' }
        ),
        'recipes/b/recipe.md': groups
      })
      const previousFiles = {
        'recipes/a/recipe.md': { sha: 'blob-a', recipe: toRecipe(fullRecipe, 'recipes/a/recipe.md') },
        'recipes/b/recipe.md': { sha: 'blob-b-old', recipe: toRecipe(fullRecipe, 'recipes/b/recipe.md') }
      }

      await downloadRecipes(previousFiles)

      const rawUrls = fetch.mock.calls.map(([url]) => String(url)).filter(url => !url.includes('git/trees'))
      expect(rawUrls).toEqual([expect.stringContaining('recipes/b/recipe.md')])
    })

    it('drops a recipe whose file left the tree', async () => {
      stubFetch({ '/git/trees/': tree({ path: 'recipes/a/recipe.md', sha: 'blob-a' }) })
      const previousFiles = {
        'recipes/a/recipe.md': { sha: 'blob-a', recipe: toRecipe(fullRecipe, 'recipes/a/recipe.md') },
        'recipes/gone/recipe.md': { sha: 'blob-gone', recipe: toRecipe(groups, 'recipes/gone/recipe.md') }
      }

      const files = await downloadRecipes(previousFiles)
      expect(Object.keys(files)).toEqual(['recipes/a/recipe.md'])
    })

    it('reuses a cached parse failure without re-fetching', async () => {
      const fetch = stubFetch({ '/git/trees/': tree({ path: 'recipes/bad/recipe.md', sha: 'blob-bad' }) })
      const previousFiles = { 'recipes/bad/recipe.md': { sha: 'blob-bad', recipe: null } }

      const files = await downloadRecipes(previousFiles)

      expect(files['recipes/bad/recipe.md']).toEqual({ sha: 'blob-bad', recipe: null })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(filesToRecipes(files)).toEqual([])
    })

    it('falls back to the previous cached entry when a re-fetch fails', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.stubGlobal('fetch', vi.fn(async url =>
        String(url).includes('/git/trees/')
          ? { ok: true, json: async () => tree({ path: 'recipes/a/recipe.md', sha: 'blob-a-new' }) }
          : { ok: false, status: 500 }))
      const staleEntry = { sha: 'blob-a-old', recipe: toRecipe(fullRecipe, 'recipes/a/recipe.md') }

      const files = await downloadRecipes({ 'recipes/a/recipe.md': staleEntry })

      // The OLD entry (old sha included) is kept, not a new one under the
      // tree's current sha — so it is tried again next time, rather than
      // being wrongly marked as verified against unfetched content.
      expect(files['recipes/a/recipe.md']).toBe(staleEntry)
      expect(console.warn).toHaveBeenCalled()
    })

    it('drops a file that fails to fetch when there is no cached copy', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.stubGlobal('fetch', vi.fn(async url =>
        String(url).includes('/git/trees/')
          ? { ok: true, json: async () => tree('recipes/a/recipe.md') }
          : { ok: false, status: 500 }))

      const files = await downloadRecipes()
      expect(files).toEqual({})
    })

    it('bounds concurrency to N simultaneous raw fetches', async () => {
      const paths = Array.from({ length: RAW_FETCH_CONCURRENCY * 2 }, (_, i) => `recipes/r${i}/recipe.md`)
      let inFlight = 0
      let maxInFlight = 0
      const pending = []

      vi.stubGlobal('fetch', vi.fn(url => {
        if (String(url).includes('/git/trees/')) {
          return Promise.resolve({ ok: true, json: async () => tree(...paths) })
        }
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        let release
        const held = new Promise(r => { release = r })
        pending.push(release)
        return held.then(() => { inFlight--; return { ok: true, text: async () => fullRecipe } })
      }))

      const done = downloadRecipes()

      // First wave: exactly the concurrency cap should be in flight at once.
      await vi.waitFor(() => expect(pending.length).toBe(RAW_FETCH_CONCURRENCY))
      expect(maxInFlight).toBe(RAW_FETCH_CONCURRENCY)

      // Releasing the first wave lets the pool refill to the same cap, not beyond it.
      pending.splice(0).forEach(release => release())
      await vi.waitFor(() => expect(pending.length).toBe(RAW_FETCH_CONCURRENCY))
      expect(maxInFlight).toBe(RAW_FETCH_CONCURRENCY)

      pending.splice(0).forEach(release => release())
      await done
    })
  })
})
