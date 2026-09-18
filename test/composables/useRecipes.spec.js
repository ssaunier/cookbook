import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRecipe } from '../helpers.js'

vi.mock('../../src/services/github.js', async () => {
  const actual = await vi.importActual('../../src/services/github.js')
  return { ...actual, getLatestSha: vi.fn(), downloadRecipes: vi.fn() }
})

let useRecipes, github, i18n

beforeEach(async () => {
  vi.resetModules()
  github = await import('../../src/services/github.js')
  github.getLatestSha.mockReset()
  github.downloadRecipes.mockReset()
  ;({ useRecipes } = await import('../../src/composables/useRecipes.js'))
  ;({ i18n } = await import('../../src/i18n/index.js'))
})

const alpha = makeRecipe({ slug: 'a', title: 'Alpha' })
const zulu = makeRecipe({ slug: 'z', title: 'Zulu' })

/** A files-map entry, the shape both the cache and `downloadRecipes()` use. */
const fileEntry = (recipe, sha = 'sha') => ({ sha, recipe })

/** What `downloadRecipes()` resolves to: a files map, complete unless said otherwise. */
const download = (files, complete = true) => ({ files, complete })

/**
 * Seeds the cache and re-imports the composable, the way a page load finds
 * it. The cache is read once at import, so a test that writes to
 * localStorage after importing would be seeding a store nobody re-reads.
 * Re-importing hands back a fresh github mock too, which the caller arms.
 */
async function reloadWithCache(cache, version = __APP_VERSION__) {
  localStorage.setItem('cookbook:recipe-cache:v3', JSON.stringify({ version, ...cache }))
  vi.resetModules()
  const composable = await import('../../src/composables/useRecipes.js')
  const mocked = await import('../../src/services/github.js')
  return { store: composable.useRecipes(), github: mocked }
}

/** The cache a previous deploy left behind, stamped with its version. */
const reloadWithStaleCache = cache => reloadWithCache(cache, 'old-build')

describe('refresh', () => {
  it('downloads and caches when there is no cache', async () => {
    github.getLatestSha.mockResolvedValue('sha1')
    github.downloadRecipes.mockResolvedValue(download({ z: fileEntry(zulu), a: fileEntry(alpha) }))

    const { recipes, refresh, cachedSha } = useRecipes()
    await refresh()

    expect(recipes.value.map(r => r.title)).toEqual(['Alpha', 'Zulu'])
    expect(cachedSha.value).toBe('sha1')
    expect(JSON.parse(localStorage.getItem('cookbook:recipe-cache:v3')).sha).toBe('sha1')
  })

  it('does not re-download when the cached sha still matches', async () => {
    const { store, github: gh } = await reloadWithCache({ sha: 'sha1', files: { a: fileEntry(alpha) } })
    gh.getLatestSha.mockResolvedValue('sha1')

    await store.refresh()
    expect(gh.downloadRecipes).not.toHaveBeenCalled()
  })

  it('re-downloads when the remote sha has moved on', async () => {
    const { store, github: gh } = await reloadWithCache({ sha: 'old', files: { a: fileEntry(alpha) } })
    gh.getLatestSha.mockResolvedValue('new')
    gh.downloadRecipes.mockResolvedValue(download({ z: fileEntry(zulu) }))

    await store.refresh()

    expect(gh.downloadRecipes).toHaveBeenCalled()
    expect(store.recipes.value.map(r => r.title)).toEqual(['Zulu'])
  })

  it('passes the new sha and the previously cached files to downloadRecipes so it can diff blob shas', async () => {
    const previousFiles = { a: fileEntry(alpha, 'sha-a') }
    const { store, github: gh } = await reloadWithCache({ sha: 'old', files: previousFiles })
    gh.getLatestSha.mockResolvedValue('new')
    gh.downloadRecipes.mockResolvedValue(download(previousFiles))

    await store.refresh()
    expect(gh.downloadRecipes).toHaveBeenCalledWith('new', previousFiles)
  })

  it('shows a cache from an older app version while re-downloading it in full', async () => {
    const { store, github: gh } = await reloadWithStaleCache({ sha: 'sha1', files: { a: fileEntry(alpha) } })
    gh.getLatestSha.mockResolvedValue('sha1')
    gh.downloadRecipes.mockResolvedValue(download({ z: fileEntry(zulu) }))

    expect(store.recipes.value.map(r => r.title)).toEqual(['Alpha'])

    await store.refresh()

    // Re-downloaded despite the unchanged sha, and without the stale files,
    // so every recipe is fetched and parsed again by this version's parser.
    expect(gh.downloadRecipes).toHaveBeenCalledWith('sha1', {})
    expect(store.recipes.value.map(r => r.title)).toEqual(['Zulu'])
  })

  it('will not run two refreshes at once', async () => {
    github.getLatestSha.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('sha1'), 5)))
    github.downloadRecipes.mockResolvedValue(download({ a: fileEntry(alpha) }))

    const { refresh } = useRecipes()
    await Promise.all([refresh(), refresh()])
    expect(github.getLatestSha).toHaveBeenCalledTimes(1)
  })
})

describe('an incomplete download', () => {
  // The case a new recipe hit in production: the head sha moved, the tree
  // listed the new file, but its raw fetch failed. Recording the new sha
  // regardless would have every later refresh return early, hiding the
  // recipe until the repository next changed for any reason at all.
  it('keeps the previous sha so the next refresh tries the missing file again', async () => {
    const { store, github: gh } = await reloadWithCache({ sha: 'old', files: { a: fileEntry(alpha) } })
    gh.getLatestSha.mockResolvedValue('new')
    gh.downloadRecipes.mockResolvedValue(download({ a: fileEntry(alpha) }, false))

    await store.refresh()

    expect(store.cachedSha.value).toBe('old')
    expect(JSON.parse(localStorage.getItem('cookbook:recipe-cache:v3')).sha).toBe('old')

    gh.downloadRecipes.mockResolvedValue(download({ a: fileEntry(alpha), z: fileEntry(zulu) }))
    await store.refresh()

    expect(gh.downloadRecipes).toHaveBeenCalledTimes(2)
    expect(gh.downloadRecipes).toHaveBeenLastCalledWith('new', { a: fileEntry(alpha) })
    expect(store.cachedSha.value).toBe('new')
    expect(store.recipes.value.map(r => r.title)).toEqual(['Alpha', 'Zulu'])
  })

  it('still shows and caches whatever did download', async () => {
    github.getLatestSha.mockResolvedValue('sha1')
    github.downloadRecipes.mockResolvedValue(download({ a: fileEntry(alpha) }, false))

    const { recipes, refresh, cachedSha } = useRecipes()
    await refresh()

    expect(recipes.value.map(r => r.title)).toEqual(['Alpha'])
    expect(cachedSha.value).toBe('')
    expect(JSON.parse(localStorage.getItem('cookbook:recipe-cache:v3')).files).toEqual({ a: fileEntry(alpha) })
  })
})

describe('failure handling', () => {
  it('surfaces the error when there is nothing to show', async () => {
    github.getLatestSha.mockRejectedValue(new Error('offline'))

    const { error, refresh, recipes } = useRecipes()
    await refresh()

    expect(error.value).toBe('offline')
    expect(recipes.value).toEqual([])
  })

  it('stays quiet when cached recipes are already on screen', async () => {
    const { store, github: gh } = await reloadWithCache({ sha: 'old', files: { a: fileEntry(alpha) } })
    gh.getLatestSha.mockRejectedValue(new Error('offline'))

    await store.refresh()

    expect(store.error.value).toBe('')
    expect(store.recipes.value).toHaveLength(1)
  })

  it('keeps showing a cache from an older app version when the refresh fails', async () => {
    const { store, github: gh } = await reloadWithStaleCache({ sha: 'sha1', files: { a: fileEntry(alpha) } })
    gh.getLatestSha.mockRejectedValue(new Error('GitHub returned 403'))

    await store.refresh()

    expect(store.error.value).toBe('')
    expect(store.recipes.value.map(r => r.title)).toEqual(['Alpha'])
  })

  it('falls back to a translated message when the error has none', async () => {
    github.getLatestSha.mockRejectedValue({})

    const { error, refresh } = useRecipes()
    await refresh()

    expect(error.value).toBe('Unknown error')
  })
})

describe('ordering', () => {
  it('re-sorts when the locale changes, without re-downloading', async () => {
    github.getLatestSha.mockResolvedValue('sha1')
    github.downloadRecipes.mockResolvedValue(download({
      c: fileEntry(makeRecipe({ slug: 'c', title: 'Cote' })),
      b: fileEntry(makeRecipe({ slug: 'b', title: 'Côte' })),
      a: fileEntry(makeRecipe({ slug: 'a', title: 'Ananas' }))
    }))

    const { recipes, refresh } = useRecipes()
    await refresh()

    expect(recipes.value[0].title).toBe('Ananas')
    const calls = github.downloadRecipes.mock.calls.length

    i18n.global.locale.value = 'en'
    expect(recipes.value[0].title).toBe('Ananas')
    expect(github.downloadRecipes.mock.calls.length).toBe(calls)
  })

  it('sorts cached recipes on read, not at download time', async () => {
    const { store } = await reloadWithCache({ sha: 'sha1', files: { z: fileEntry(zulu), a: fileEntry(alpha) } })

    expect(store.recipes.value.map(r => r.title)).toEqual(['Alpha', 'Zulu'])
  })
})
