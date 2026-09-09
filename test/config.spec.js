import { describe, expect, it, vi } from 'vitest'

// The one spec that opts out of the pinned fixture test/setup.js mocks in for
// every other file, because src/config.js is exactly what it is about: this is
// the single file a fork edits, and these checks are what catch a bad edit.
// The four values are interpolated straight into GitHub URLs, where a missing
// or blank one surfaces as a 404 that gives no hint of where it came from.
vi.unmock('../src/config.js')

const { recipesRepo } = await import('../src/config.js')

describe('config', () => {
  it.each(['owner', 'repo', 'branch'])('has a non-empty %s', key => {
    expect(recipesRepo[key]).toEqual(expect.any(String))
    expect(recipesRepo[key]).not.toBe('')
  })

  it('has a directory, which may be empty to scan the whole repository', () => {
    expect(recipesRepo.directory).toEqual(expect.any(String))
  })
})
