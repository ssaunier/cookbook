export default {
  common: {
    browseRecipes: 'Browse recipes',
    remove: 'Remove',
    cancel: 'Cancel',
    close: 'Close',
    clearAll: 'Clear all',
    shoppingList: 'Shopping list',
    servings: '{n} serving | {n} servings'
  },

  app: {
    title: 'Cookbook',
    tagline: 'Recipes & Shopping List',
    loading: 'Loading recipes…',
    loadingHint: 'Checking GitHub for the latest cookbook.',
    errorTitle: 'Couldn’t load the recipes',
    tryAgain: 'Try again',
    unknownError: 'Unknown error',
    language: 'Language',
    viewSource: 'View source on GitHub',
    viewRecipes: 'View the recipes on GitHub'
  },

  nav: {
    recipes: 'Recipes',
    menu: 'Menu',
    list: 'List'
  },

  index: {
    toTest: 'To try',
    searchLabel: 'Search recipes',
    searchPlaceholder: 'Search recipes…',
    all: 'All',
    ingredients: '{n} ingredient | {n} ingredients',
    viewRecipe: 'View recipe',
    emptyTitle: 'No recipes found',
    emptyHint: 'Try another search or clear the filter.'
  },

  recipe: {
    back: 'All recipes',
    makes: 'Makes {yields}',
    addToList: 'Add to shopping list',
    ingredients: 'Ingredients',
    noIngredients: 'This recipe lists no ingredients.',
    method: 'Method',
    noInstructions: 'This recipe has no instructions.',
    source: 'Source | Sources',
    notFound: 'Recipe not found',
    backToRecipes: 'Back to recipes'
  },

  list: {
    heading: 'Shopping list',
    remaining: '{n} remaining | {n} remaining',
    total: '{n} total',
    emptyTitle: 'Your cart is empty',
    emptyHint: 'Add a recipe and scale it for the number of people you’re feeding.',
    check: 'Check item',
    confirmRemove: 'Remove {name} from the shopping list?',
    confirmClear: 'Clear the whole shopping list?',
    uncheck: 'Uncheck item',
    addItem: 'Add'
  },

  addItem: {
    title: 'Add an item',
    intro: 'For something to buy that no recipe on your menu calls for.',
    name: 'Item',
    namePlaceholder: 'Olive oil',
    quantity: 'Quantity',
    quantityHint: 'A number, or a number and a unit: 2, 100 g, 3 bottles.',
    invalidQuantity: 'Start the quantity with a number, or leave it empty.',
    add: 'Add to list'
  },

  menu: {
    heading: 'Menu',
    count: '{n} meal planned | {n} meals planned',
    openRecipe: 'Open recipe',
    open: 'View',
    stale: 'Recipe is no longer present in the source repository.',
    confirmRemove: 'Remove {name} from the menu?',
    confirmClear: 'Clear the whole menu and the shopping list?',
    emptyTitle: 'No recipes in your menu',
    emptyHint: 'When you add a recipe to your shopping list, it will appear here.'
  },

  dialog: {
    scale: 'Scale {title}',
    servingsKnown: 'The recipe is written for {n} serving. | The recipe is written for {n} servings.',
    servingsUnknown: 'This recipe does not declare a serving count, so enter the multiplier directly.',
    people: 'People',
    multiplier: 'Multiplier',
    example: 'For example, {factor} turns {from} into {to}.',
    add: 'Add to list'
  }
}
