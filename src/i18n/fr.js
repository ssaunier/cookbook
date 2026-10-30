export default {
  common: {
    browseRecipes: 'Parcourir les recettes',
    remove: 'Retirer',
    cancel: 'Annuler',
    close: 'Fermer',
    clearAll: 'Tout effacer',
    shoppingList: 'Liste de courses',
    servings: '{n} personne | {n} personnes'
  },

  app: {
    title: 'Cookbook',
    tagline: 'Recettes & liste de courses',
    loading: 'Chargement des recettes…',
    loadingHint: 'Recherche de la dernière version sur GitHub.',
    errorTitle: 'Impossible de charger les recettes',
    tryAgain: 'Réessayer',
    unknownError: 'Erreur inconnue',
    language: 'Langue',
    viewSource: 'Voir le code source sur GitHub',
    viewRecipes: 'Voir les recettes sur GitHub'
  },

  nav: {
    recipes: 'Recettes',
    menu: 'Menu',
    list: 'Liste'
  },

  index: {
    toTest: 'À tester',
    searchLabel: 'Rechercher des recettes',
    searchPlaceholder: 'Rechercher des recettes…',
    all: 'Toutes',
    ingredients: '{n} ingrédient | {n} ingrédients',
    viewRecipe: 'Voir la recette',
    emptyTitle: 'Aucune recette trouvée',
    emptyHint: 'Essayez une autre recherche ou effacez le filtre.'
  },

  recipe: {
    back: 'Toutes les recettes',
    makes: 'Pour {yields}',
    addToList: 'Ajouter à la liste de courses',
    addIngredient: 'Ajouter {name} à la liste de courses',
    ingredientAdded: 'Ajouté à la liste de courses',
    ingredients: 'Ingrédients',
    noIngredients: 'Cette recette ne liste aucun ingrédient.',
    method: 'Préparation',
    noInstructions: 'Cette recette n’a pas d’instructions.',
    source: 'Source | Sources',
    notFound: 'Recette introuvable',
    backToRecipes: 'Retour aux recettes'
  },

  list: {
    heading: 'Liste de courses',
    remaining: '{n} restant | {n} restants',
    total: '{n} au total',
    emptyTitle: 'Votre panier est vide',
    emptyHint: 'Ajoutez une recette et ajustez-la au nombre de convives.',
    check: 'Cocher l’article',
    confirmRemove: 'Retirer {name} de la liste de courses ?',
    confirmClear: 'Effacer toute la liste de courses ?',
    uncheck: 'Décocher l’article',
    addItem: 'Ajouter'
  },

  addItem: {
    title: 'Ajouter un article',
    intro: 'Pour quelque chose à acheter qu’aucune recette de votre menu ne demande.',
    name: 'Article',
    namePlaceholder: 'Huile d’olive',
    quantity: 'Quantité',
    quantityHint: 'Un nombre, ou un nombre et une unité : 2, 100 g, 3 bouteilles.',
    invalidQuantity: 'Commencez la quantité par un nombre, ou laissez le champ vide.',
    add: 'Ajouter à la liste'
  },

  menu: {
    heading: 'Menu',
    count: '{n} repas prévu | {n} repas prévus',
    openRecipe: 'Voir la recette',
    open: 'Voir',
    stale: 'Cette recette n’est plus présente dans le dépôt source.',
    confirmRemove: 'Retirer {name} du menu ?',
    confirmClear: 'Effacer tout le menu et la liste de courses ?',
    emptyTitle: 'Aucune recette à votre menu',
    emptyHint: 'Lorsque vous ajoutez une recette à votre liste de courses, elle apparaît ici.'
  },

  dialog: {
    scale: 'Ajuster « {title} »',
    servingsKnown: 'La recette est prévue pour {n} personne. | La recette est prévue pour {n} personnes.',
    servingsUnknown: 'Cette recette n’indique pas de nombre de portions, saisissez directement le multiplicateur.',
    people: 'Convives',
    multiplier: 'Multiplicateur',
    example: 'Par exemple, {factor} transforme {from} en {to}.',
    add: 'Ajouter à la liste'
  }
}
