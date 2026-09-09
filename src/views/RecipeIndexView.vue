<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useLocale } from '../composables/useLocale.js'
import RecipeCard from '../components/RecipeCard.vue'

const props = defineProps({ recipes: { type: Array, required: true } })
const { t } = useI18n()
const { collator } = useLocale()
const route = useRoute()
const router = useRouter()
const searchInput = ref(null)

/**
 * A value as a plain string. A query-string field is only one when it is
 * present exactly once: an absent key reads as undefined and a repeated one as
 * an array, neither of which a filter can be compared or bound against.
 */
function asText(value) {
  return String(value ?? '')
}

/**
 * Tags are compared in one normal form, because the same accented tag has two
 * encodings: the `é` of `végétarien` is either one code point or an `e`
 * followed by a combining accent. The two render identically and compare
 * unequal, so a link whose accents were decomposed somewhere along the way
 * (macOS does that) matches no recipe at all. Only accented tags can disagree
 * this way, so the symptom looked specific to accented tags.
 */
function sameTag(a, b) {
  return asText(a).normalize('NFC') === asText(b).normalize('NFC')
}

const query = ref(asText(route.query.q))
const tag = ref(asText(route.query.tag))

/**
 * The URL is the source of truth for both filters, and is re-read on every
 * navigation rather than only at setup. Changing just the query string keeps
 * this component mounted, so a shared link followed while the index is already
 * on screen, or a back/forward step between two filtered views, used to move
 * the URL while leaving the filters on whatever they showed before.
 *
 * Guarded on the route name because the query also changes on the way out to
 * another view, where clearing the filters would write this component's state
 * over the query string of a page it no longer owns.
 */
watch(() => route.query, ({ q, tag: tg }) => {
  if (route.name !== 'recipes') return
  query.value = asText(q)
  tag.value = asText(tg)
})

/**
 * Mirror the search into the URL's query string. vue-router's history entries
 * carry it, so navigating to a recipe and back restores the search instead of
 * losing it — `replace` (not `push`) keeps every keystroke from adding its own
 * back-button stop.
 */
watch([query, tag], ([q, tg]) => {
  router.replace({ query: { ...route.query, q: q || undefined, tag: tg || undefined } })
})

const tags = computed(() => [...new Set(props.recipes.flatMap(recipe => recipe.tags || []))].sort(collator.value.compare))

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return props.recipes.filter(recipe => {
    const haystack = `${recipe.title} ${recipe.description} ${(recipe.tags || []).join(' ')} ${recipe.ingredients.map(ingredient => ingredient.name).join(' ')}`
    const matchesText = !needle || haystack.toLowerCase().includes(needle)
    const matchesTag = !tag.value || (recipe.tags || []).some(item => sameTag(item, tag.value))
    return matchesText && matchesTag
  })
})

/**
 * `/` is a common "jump to search" shortcut (Slack, GitHub…). It is ignored
 * while another field already has focus, so it still types a literal slash
 * there instead of stealing it.
 */
function focusOnSlash(event) {
  if (event.key !== '/') return
  const { tagName, isContentEditable } = document.activeElement || {}
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || isContentEditable) return
  event.preventDefault()
  searchInput.value?.focus()
}

// Autofocusing on mobile pops the keyboard and covers the page before the
// user asked for it, so only do it on desktop-sized viewports (matches the
// `sm` breakpoint already used below to switch the header layout).
onMounted(() => {
  if (window.matchMedia('(min-width: 640px)').matches) searchInput.value?.focus()
  window.addEventListener('keydown', focusOnSlash)
})
onUnmounted(() => window.removeEventListener('keydown', focusOnSlash))
</script>

<template>
  <section>
    <div class="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <!-- Shares the nav label on purpose: one string, one translation. -->
      <h1 class="text-4xl font-black tracking-tight text-slate-950">{{ t('nav.recipes') }}</h1>
      <div class="w-full sm:max-w-sm">
        <label class="sr-only" for="recipe-search">{{ t('index.searchLabel') }}</label>
        <input id="recipe-search" ref="searchInput" v-model="query" type="search" :placeholder="t('index.searchPlaceholder')" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none ring-blue-200 transition focus:ring-4" />
      </div>
    </div>

    <div v-if="tags.length" class="mb-6 flex flex-wrap gap-2">
      <button @click="tag = ''" :class="['rounded-full px-3 py-1.5 text-sm font-semibold', !tag ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-900']">{{ t('index.all') }}</button>
      <button v-for="item in tags" :key="item" @click="tag = item" :class="['rounded-full px-3 py-1.5 text-sm font-semibold', sameTag(tag, item) ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-900']">{{ item }}</button>
    </div>

    <div v-if="filtered.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RecipeCard v-for="recipe in filtered" :key="recipe.slug" :recipe="recipe" />
    </div>

    <div v-else class="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <div class="text-4xl">🔎</div>
      <h2 class="mt-4 font-bold text-slate-900">{{ t('index.emptyTitle') }}</h2>
      <p class="mt-1 text-sm text-slate-500">{{ t('index.emptyHint') }}</p>
    </div>
  </section>
</template>