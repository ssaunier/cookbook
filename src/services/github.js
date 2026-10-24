import { parseRecipe, flattenIngredients, RecipeMDError } from './recipemd.js'
import { formatAmount } from './units.js'
import { recipesRepo } from '../config.js'

const { owner, repo, branch, directory } = recipesRepo
const API = `https://api.github.com/repos/${owner}/${repo}`
const RAW = `https://raw.githubusercontent.com/${owner}/${repo}`

/** A trailing slash unless the recipes sit at the repository root. */
const PREFIX = directory ? `${directory.replace(/^\/+|\/+$/g, '')}/` : ''

const ESCAPED_PREFIX = PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Recipes live under this directory in the source repository. */
const RECIPE_PATH = new RegExp(`^${ESCAPED_PREFIX}.+\\.md$`, 'i')

/**
 * Optional per-recipe metadata sitting next to `recipe.md`, e.g.
 * `recipes/pain-pita/meta.yml`. It is picked up from the same repository tree
 * as the recipes, so reading it costs no extra API call.
 */
const META_PATH = new RegExp(`^${ESCAPED_PREFIX}.+/meta\\.ya?ml$`, 'i')

/** Yield units that describe a number of eaters rather than a volume. */
const SERVING_UNITS = /^(servings?|portions?|persons?|people|personnes?|pers\.?|parts?|couverts?)$/i

async function githubFetch(url) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${url}`)
  }
  return response.json()
}

export async function getLatestSha() {
  const commit = await githubFetch(`${API}/commits/${branch}`)
  return commit.sha
}

/**
 * How many raw-file fetches run at once. Any change anywhere in the source
 * repository moves its HEAD sha, and without a cap a large collection would
 * fire one simultaneous `fetch` per recipe — exactly the burst pattern
 * GitHub's abuse detection throttles, independent of the documented
 * requests-per-hour quota.
 */
export const RAW_FETCH_CONCURRENCY = 6

async function mapWithConcurrency(items, limit, fn) {
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++]
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/**
 * Downloads every recipe file as of commit `sha`, reusing `previousFiles`
 * for anything whose git blob sha hasn't changed. Without this, any change
 * anywhere in the repository (even one unrelated to recipes) would
 * re-download every recipe file on the next visit, since the only thing
 * tracked before was the repository's own HEAD commit sha, not each file's
 * own sha.
 *
 * Everything is addressed by that commit sha rather than by branch name, and
 * on purpose: GitHub serves both the API and raw.githubusercontent.com with
 * a public max-age (60s and 300s respectively), so a URL naming the branch
 * can come back from the browser's or GitHub's own cache showing the tree or
 * a file as it was *before* the commit `getLatestSha()` just reported. That
 * left a new recipe missing, or a modified one stale, while the cache was
 * stamped as up to date with the new HEAD. A sha-addressed URL never changes
 * meaning, so a cached response for it is always the right one.
 *
 * Returns `files`, a map keyed by path rather than a flat array so a caller
 * can pass it straight back in as next time's `previousFiles` (see
 * `filesToRecipes()` for the flat list the rest of the app actually
 * consumes), and `complete`, false when at least one file could not be
 * fetched and is either missing from `files` or still sitting there as its
 * previous entry. A caller should not record such a result as being at
 * `sha`, or the missing file would not be tried again until the repository
 * next changes.
 */
export async function downloadRecipes(sha, previousFiles = {}) {
  const tree = await githubFetch(`${API}/git/trees/${sha}?recursive=1`)
  if (tree.truncated) {
    throw new Error('GitHub returned a truncated repository tree. The source repository is too large for this client-side loader.')
  }

  const entries = tree.tree
    .filter(item => item.type === 'blob' && (RECIPE_PATH.test(item.path) || META_PATH.test(item.path)))
    .map(item => ({ path: item.path, sha: item.sha }))

  const files = {}
  const toFetch = []
  for (const entry of entries) {
    const previous = previousFiles[entry.path]
    if (previous && previous.sha === entry.sha) files[entry.path] = previous
    else toFetch.push(entry)
  }
  // A path that stayed in `previousFiles` without being visited above has
  // left the tree (deleted or renamed upstream) and is dropped by simply
  // never being copied into `files`.

  let complete = true
  await mapWithConcurrency(toFetch, RAW_FETCH_CONCURRENCY, async ({ path, sha: blobSha }) => {
    let text
    try {
      const response = await fetch(`${RAW}/${sha}/${encodeURI(path)}`)
      if (!response.ok) throw new Error(`Unable to download ${path}`)
      text = await response.text()
    } catch (error) {
      // A file that fails to fetch keeps its previous entry — under its OLD
      // sha, not this tree's — so it stays on the site with its last-known
      // content and is tried again on the next refresh, rather than either
      // vanishing or failing every other recipe's load too. Stamping the new
      // sha here instead would mark unverified content as up to date and
      // stop it from ever being retried.
      complete = false
      const stale = previousFiles[path]
      if (stale) {
        console.warn(`Keeping the cached copy of ${path}: ${error.message}`)
        files[path] = stale
      } else {
        console.warn(`Skipping ${path}: ${error.message}`)
      }
      return
    }
    files[path] = META_PATH.test(path)
      ? { sha: blobSha, meta: toMeta(text, path) }
      : { sha: blobSha, recipe: toRecipe(text, path) }
  })

  return { files, complete }
}

/**
 * The flat list of recipes a files map actually holds, in no particular
 * order — a file that failed to parse (see `toRecipe`) leaves a `null` entry
 * behind, filtered out here. Ordering is locale-dependent, so it lives in
 * useRecipes() rather than here: the locale can change without a re-download.
 */
export function filesToRecipes(files) {
  const entries = Object.values(files)
  const toTest = new Set(entries.filter(file => file.meta?.toTest).map(file => file.meta.slug))
  return entries
    .map(file => file.recipe)
    .filter(Boolean)
    .map(recipe => (toTest.has(recipe.slug) ? { ...recipe, toTest: true } : recipe))
}

/**
 * Reads a `meta.yml`. Only flat `key: value` lines are understood, which is
 * all the file holds: `to_test: true` marks a recipe not cooked yet.
 */
export function toMeta(yaml, path) {
  return {
    slug: toSlug(path),
    toTest: /^to_test:\s*(?:true|yes)\s*(?:#.*)?$/im.test(yaml)
  }
}

/**
 * Turn a RecipeMD document into the shape the views consume. A recipe that
 * does not follow the specification is skipped rather than failing the whole
 * download, so one bad file cannot take the cookbook down.
 */
export function toRecipe(markdown, path) {
  let parsed
  try {
    parsed = parseRecipe(markdown)
  } catch (error) {
    if (error instanceof RecipeMDError) {
      console.warn(`Skipping ${path}: ${error.message}`)
      return null
    }
    throw error
  }

  const { steps, stepGroups, sources } = splitInstructions(parsed.instructions)

  return {
    slug: toSlug(path),
    title: parsed.title,
    description: parsed.description || '',
    tags: parsed.tags,
    yields: parsed.yields.map(amount => ({ ...amount, label: formatAmount(amount.factor, amount.unit) })),
    servings: toServings(parsed.yields),
    ingredients: flattenIngredients(parsed).map(toIngredient),
    steps,
    stepGroups,
    sources
  }
}

/** `recipes/pate-a-tartiner/recipe.md` becomes `pate-a-tartiner`. */
function toSlug(path) {
  return path
    .replace(new RegExp(`^${ESCAPED_PREFIX}`, 'i'), '')
    .replace(/\.(?:md|ya?ml)$/i, '')
    .replace(/\/(?:recipe|meta)$/i, '')
    .replace(/\//g, '-')
}

function toIngredient(ingredient) {
  return {
    name: ingredient.name,
    quantity: ingredient.amount ? ingredient.amount.factor : null,
    unit: ingredient.amount?.unit || '',
    link: ingredient.link,
    group: ingredient.group
  }
}

/** The first yield expressed in eaters, e.g. `4 Servings`, if there is one. */
function toServings(yields) {
  const serving = yields.find(amount => amount.unit && SERVING_UNITS.test(amount.unit))
  return serving ? serving.factor : null
}

/**
 * The spec keeps the instructions as one markdown blob. Split it into steps for
 * display, and peel off a trailing `Source:` block if the recipe has one.
 *
 * `steps` is the flat list of every step in reading order; `stepGroups` is the
 * same steps arranged under the headings that introduced them, so a recipe
 * written as `## Pâte` / `## Cuisson` keeps those stages apart. A recipe with
 * no headings yields a single untitled group.
 */
function splitInstructions(instructions) {
  if (!instructions) return { steps: [], stepGroups: [], sources: [] }

  const lines = instructions.split('\n')
  const divider = lines.findIndex(line => /^\s*sources?\s*:?\s*$/i.test(line))
  const body = divider >= 0 ? lines.slice(0, divider) : lines
  const tail = divider >= 0 ? lines.slice(divider + 1) : []

  const stepGroups = toStepGroups(body)

  return {
    steps: stepGroups.flatMap(group => group.steps),
    stepGroups,
    sources: toSources(tail)
  }
}

const LIST_ITEM = /^\s*(?:[-+*]|\d{1,9}[.)])\s+(.*)$/
const HEADING = /^ {0,3}#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/
/** A divider inside the instructions separates sections; it is never content. */
const DIVIDER = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/

/** Cut the instructions at each heading, then read the steps of every section. */
function toStepGroups(lines) {
  const sections = [{ title: null, lines: [] }]

  for (const line of lines) {
    const heading = line.match(HEADING)
    if (heading) sections.push({ title: heading[1].trim(), lines: [] })
    else sections[sections.length - 1].lines.push(line)
  }

  return sections
    .map(section => ({ title: section.title, steps: toSteps(section.lines) }))
    .filter(section => section.steps.length)
}

function toSteps(allLines) {
  const lines = allLines.filter(line => !DIVIDER.test(line))
  const items = []

  for (const line of lines) {
    const match = line.match(LIST_ITEM)
    if (match) {
      items.push(match[1].trim())
    } else if (line.trim() && items.length) {
      // A wrapped continuation of the previous step.
      items[items.length - 1] += ` ${line.trim()}`
    }
  }

  if (items.length) return items

  // No list: fall back to one step per paragraph.
  return lines
    .join('\n')
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim().replace(/\s*\n\s*/g, ' '))
    .filter(Boolean)
}

const MARKDOWN_LINK = /\[([^\]]*)\]\(\s*<?([^\s>)]+)>?[^)]*\)/

function toSources(lines) {
  return lines
    .map(line => line.replace(LIST_ITEM, '$1').trim())
    .filter(Boolean)
    .map(text => {
      const link = text.match(MARKDOWN_LINK)
      if (link) return { title: link[1].trim() || link[2], url: link[2] }
      if (/^https?:\/\//i.test(text)) return { title: text, url: text }
      return { title: text, url: null }
    })
}
