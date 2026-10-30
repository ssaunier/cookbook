<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AddToShoppingListDialog from '../components/AddToShoppingListDialog.vue'
import { useShoppingList } from '../composables/useShoppingList.js'
import { renderInline, stripInline } from '../services/markdown.js'
import { formatAmount } from '../services/units.js'
import { pluralizeIngredientName, shouldPluralize } from '../services/pluralize.js'

const props = defineProps({ recipes: { type: Array, required: true } })
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { addRecipe, addExtraItem } = useShoppingList()
const showDialog = ref(false)

const recipe = computed(() => props.recipes.find(item => item.slug === route.params.slug))

// Post-flush so a locale switch, which resets the title in useLocale, is
// followed by this one rather than the other way round.
watch([recipe, () => t('app.title')], ([current, appTitle]) => {
  document.title = current ? `${current.title} - ${appTitle}` : appTitle
}, { immediate: true, flush: 'post' })

// Which ingredient just went onto the list, so its button can show a check
// for a moment. Keyed by position: the same name can appear in two groups.
const justAdded = ref(null)
let justAddedTimer

onBeforeUnmount(() => {
  document.title = t('app.title')
  clearTimeout(justAddedTimer)
})

/** Keep the parser's order, but bundle consecutive ingredients of one group. */
const groups = computed(() => {
  const result = []
  for (const ingredient of recipe.value?.ingredients || []) {
    const title = ingredient.group || ''
    const last = result[result.length - 1]
    if (last && last.title === title) last.items.push(ingredient)
    else result.push({ title, items: [ingredient] })
  }
  return result
})

function displayName(ingredient) {
  return shouldPluralize(ingredient.quantity, ingredient.unit) ? pluralizeIngredientName(ingredient.name) : ingredient.name
}

/**
 * Adds one ingredient exactly as the recipe states it: no dialog, no scaling.
 * It goes in as a hand-added extra, which the list already merges with the
 * same ingredient coming from a recipe on the menu.
 */
function addIngredient(ingredient, key) {
  addExtraItem(ingredient.name, ingredient.quantity, ingredient.unit)
  justAdded.value = key
  clearTimeout(justAddedTimer)
  justAddedTimer = setTimeout(() => { justAdded.value = null }, 1500)
}

function added(multiplier) {
  addRecipe(recipe.value, multiplier)
  showDialog.value = false
  router.push('/shopping-list')
}
</script>

<template>
  <div v-if="recipe">
    <RouterLink to="/" class="text-sm font-bold text-slate-400 hover:text-slate-700">← {{ t('recipe.back') }}</RouterLink>

    <article class="mt-5 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <header class="border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-sky-50 p-6 sm:p-10">
        <div class="flex flex-wrap gap-2">
          <span v-if="recipe.toTest" class="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{{ t('index.toTest') }}</span>
          <span v-for="tag in recipe.tags" :key="tag" class="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200">{{ tag }}</span>
        </div>
        <!-- On desktop the button sits beside the title; on a phone that would
             push it above the servings line, so it moves below instead — the
             two buttons are the same action, one hidden per breakpoint. -->
        <div class="mt-4 flex items-center justify-between gap-5">
          <h1 class="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{{ recipe.title }}</h1>
          <button @click="showDialog = true" class="hidden shrink-0 rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-slate-800 sm:block">＋ {{ t('recipe.addToList') }}</button>
        </div>
        <p v-if="recipe.description" class="mt-3 max-w-2xl whitespace-pre-line text-lg leading-8 text-slate-600">{{ recipe.description }}</p>
        <p v-if="recipe.yields.length" class="mt-4 text-sm font-bold uppercase tracking-[0.14em] text-blue-700">
          {{ t('recipe.makes', { yields: recipe.yields.map(item => item.label).join(' · ') }) }}
        </p>
        <button @click="showDialog = true" class="mt-7 rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-slate-800 sm:hidden">＋ {{ t('recipe.addToList') }}</button>
      </header>

      <div class="grid gap-8 p-6 sm:p-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section>
          <h2 class="text-lg font-black text-slate-900">{{ t('recipe.ingredients') }}</h2>
          <p class="sr-only" role="status">{{ justAdded ? t('recipe.ingredientAdded') : '' }}</p>
          <p v-if="!recipe.ingredients.length" class="mt-3 text-sm text-slate-400">{{ t('recipe.noIngredients') }}</p>

          <div v-for="(group, groupIndex) in groups" :key="group.title" class="mt-4">
            <h3 v-if="group.title" class="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{{ group.title }}</h3>
            <ul class="divide-y divide-slate-100">
              <li v-for="(ingredient, index) in group.items" :key="index" class="group py-3">
                <div class="flex items-start gap-3">
                  <span class="mt-2 size-2 shrink-0 rounded-full bg-blue-500"></span>
                  <div class="min-w-0 flex-1">
                    <span v-if="ingredient.quantity != null" class="font-bold text-slate-900">{{ formatAmount(ingredient.quantity, ingredient.unit) }}</span>
                    <a v-if="ingredient.link" :href="ingredient.link" target="_blank" rel="noreferrer" :class="['markdown font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800', { 'ml-1': ingredient.quantity != null }]" v-html="renderInline(displayName(ingredient))"></a>
                    <span v-else :class="['markdown font-medium text-slate-700', { 'ml-1': ingredient.quantity != null }]" v-html="renderInline(displayName(ingredient))"></span>
                  </div>
                  <!-- Always visible, except where a pointer can hover: there it
                       appears with the row, and with keyboard focus. -->
                  <button
                    type="button"
                    @click="addIngredient(ingredient, `${groupIndex}-${index}`)"
                    :aria-label="t('recipe.addIngredient', { name: stripInline(ingredient.name) })"
                    :class="['grid size-8 shrink-0 place-items-center rounded-full transition focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100', justAdded === `${groupIndex}-${index}` ? 'bg-emerald-100 text-emerald-700 [@media(hover:hover)]:opacity-100' : 'bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-700']"
                  >
                    <svg v-if="justAdded === `${groupIndex}-${index}`" class="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg>
                    <svg v-else class="size-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
                  </button>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 class="text-lg font-black text-slate-900">{{ t('recipe.method') }}</h2>
          <p v-if="!recipe.steps.length" class="mt-3 text-sm text-slate-400">{{ t('recipe.noInstructions') }}</p>
          <div v-for="(group, groupIndex) in recipe.stepGroups" :key="groupIndex" class="mt-4">
            <h3 v-if="group.title" class="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{{ group.title }}</h3>
            <ol class="mt-3 space-y-4">
              <li v-for="(step, index) in group.steps" :key="index" class="flex gap-4">
                <span class="grid size-8 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-black text-blue-800">{{ index + 1 }}</span>
                <p class="markdown pt-1 font-medium leading-7 text-slate-700" v-html="renderInline(step)"></p>
              </li>
            </ol>
          </div>

          <div v-if="recipe.sources.length" class="mt-8 border-t border-slate-100 pt-5">
            <h3 class="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{{ t('recipe.source', recipe.sources.length) }}</h3>
            <ul class="mt-2 space-y-1 text-sm">
              <li v-for="(source, index) in recipe.sources" :key="index">
                <a v-if="source.url" :href="source.url" target="_blank" rel="noreferrer" class="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800">{{ source.title }}</a>
                <span v-else class="text-slate-500">{{ source.title }}</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </article>

    <AddToShoppingListDialog v-if="showDialog" :recipe="recipe" @cancel="showDialog = false" @add="added" />
  </div>

  <div v-else class="py-20 text-center">
    <h1 class="text-2xl font-black">{{ t('recipe.notFound') }}</h1>
    <RouterLink to="/" class="mt-3 inline-block font-bold text-blue-600">{{ t('recipe.backToRecipes') }}</RouterLink>
  </div>
</template>
