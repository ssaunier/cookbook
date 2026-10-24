<script setup>
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'

defineProps({ recipe: { type: Object, required: true } })
const { t } = useI18n()
</script>

<template>
  <RouterLink :to="`/r/${recipe.slug}`" class="group min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
    <div class="mb-5 flex items-start justify-between gap-3">
      <span v-if="recipe.toTest" class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{{ t('index.toTest') }}</span>
      <span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{{ t('index.ingredients', { n: recipe.ingredients.length }) }}</span>
      <span class="text-xl transition group-hover:rotate-6">🍽️</span>
    </div>
    <h2 class="text-xl font-black text-slate-900">{{ recipe.title }}</h2>
    <p v-if="recipe.description" class="mt-2 truncate text-sm leading-6 text-slate-500">{{ recipe.description }}</p>
    <div v-if="recipe.tags?.length" class="mt-4 flex flex-wrap gap-1.5">
      <span v-for="item in recipe.tags.slice(0, 3)" :key="item" class="text-xs font-semibold text-slate-400">#{{ item }}</span>
    </div>
    <div class="mt-5 text-sm font-bold text-blue-600 group-hover:text-blue-700">{{ t('index.viewRecipe') }} →</div>
  </RouterLink>
</template>
