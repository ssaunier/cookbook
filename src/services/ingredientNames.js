/**
 * A recipe may qualify an ingredient in parentheses: "malt diastatique
 * (facultatif)", "fromage râpé (emmental, comté)". What is in the parentheses
 * says how to use the ingredient, not what to buy, so it is set apart from
 * the name: "malt diastatique" is one thing to buy whether or not a recipe
 * calls it optional.
 *
 * The "(" of a markdown link destination, "[farine](https://…)", is not a
 * qualifier and is left alone: it always follows a "]".
 */
const PARENTHETICAL = /\s*(?<!\])\(([^()]*)\)/g

/**
 * Splits an ingredient name into the name proper and the comma-separated
 * items found in its parentheses. A name that is nothing but a parenthetical
 * keeps its text as the name, so it never ends up empty.
 */
export function splitIngredientName(name) {
  const source = String(name ?? '')
  const tags = []
  const base = source
    .replace(PARENTHETICAL, (_, inner) => {
      tags.push(...inner.split(',').map(tag => tag.trim()).filter(Boolean))
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return base ? { base, tags } : { base: source.trim(), tags: [] }
}
