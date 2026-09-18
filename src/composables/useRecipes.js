import { computed, ref } from 'vue'
import { getLatestSha, downloadRecipes, filesToRecipes } from '../services/github.js'
import { loadRecipeCache, saveRecipeCache } from '../services/storage.js'
import { useLocale } from './useLocale.js'
import { i18n } from '../i18n/index.js'

const { collator } = useLocale()

const downloaded = ref([])
const loading = ref(false)
const error = ref('')
const cachedSha = ref('')

/**
 * Each recipe file's own git blob sha, alongside its parsed content — not a
 * ref, since nothing renders it directly. Passed back into `downloadRecipes`
 * so it only re-fetches files whose blob sha actually changed, rather than
 * every recipe whenever anything in the repository changes.
 */
let cachedFiles = {}

// Sorting happens on read, not at download time, so the order follows the
// current locale rather than whichever one was active when the cache was built.
const recipes = computed(() =>
  [...downloaded.value].sort((a, b) => collator.value.compare(a.title, b.title))
)

// Hydrate from the cache once, at import, like useShoppingList does. This is
// the only read: from here on `downloaded` and `cachedSha` are what the cache
// holds, so refresh() compares against them rather than reading it again.
//
// A cache written by an older version of this app is still shown, but not
// trusted for incremental work: leaving `cachedFiles` empty forces the next
// refresh to re-fetch and re-parse every file, which is how a fix to the
// parser reaches someone whose upstream sha has not moved. Showing it anyway
// is what keeps a failed refresh - GitHub rate-limiting the browser, say -
// from replacing a complete cookbook with an error page.
const cached = loadRecipeCache()
if (cached?.files && Object.keys(cached.files).length) {
  downloaded.value = filesToRecipes(cached.files)
  cachedSha.value = cached.sha || ''
  if (cached.version === __APP_VERSION__) cachedFiles = cached.files
}

export function useRecipes() {
  async function refresh() {
    if (loading.value) return
    loading.value = true
    error.value = ''

    try {
      const latestSha = await getLatestSha()

      // `cachedFiles` is empty when what is on screen came from a cache an
      // older version of this app wrote, which has to be re-downloaded even
      // though the repository itself has not moved.
      if (latestSha === cachedSha.value && downloaded.value.length && Object.keys(cachedFiles).length) {
        return
      }

      const { files, complete } = await downloadRecipes(latestSha, cachedFiles)
      cachedFiles = files
      downloaded.value = filesToRecipes(files)
      // A download that skipped a file, or kept a stale copy of one, is not
      // recorded as being at `latestSha`: the sha stays where it was, so the
      // next refresh sees a mismatch and calls downloadRecipes again, which
      // then only fetches what is still missing. Stamping it anyway would
      // short-circuit every refresh until the repository next changed, and a
      // recipe whose very first fetch failed would stay invisible until then.
      if (complete) cachedSha.value = latestSha
      saveRecipeCache({ sha: cachedSha.value, files, version: __APP_VERSION__ })
    } catch (err) {
      if (!downloaded.value.length) {
        error.value = err?.message || i18n.global.t('app.unknownError')
      }
    } finally {
      loading.value = false
    }
  }

  return { recipes, loading, error, refresh, cachedSha }
}
