import { describe, expect, it } from 'vitest'
import { splitIngredientName } from '../../src/services/ingredientNames.js'

describe('splitIngredientName', () => {
  it('leaves a plain name alone', () => {
    expect(splitIngredientName('malt diastatique')).toEqual({ base: 'malt diastatique', tags: [] })
  })

  it('sets a parenthetical apart from the name', () => {
    expect(splitIngredientName('malt diastatique (facultatif)')).toEqual({
      base: 'malt diastatique',
      tags: ['facultatif']
    })
  })

  it('makes one tag per comma-separated item', () => {
    expect(splitIngredientName('fromage râpé (emmental, comté)')).toEqual({
      base: 'fromage râpé',
      tags: ['emmental', 'comté']
    })
  })

  it('collects the tags of every parenthetical, wherever it sits', () => {
    expect(splitIngredientName('farine (T65) de blé (bio)')).toEqual({
      base: 'farine de blé',
      tags: ['T65', 'bio']
    })
  })

  it('does not mistake the destination of a markdown link for a qualifier', () => {
    const name = "boite d'[agent _Slider_](https://example.com/a-b.html)"
    expect(splitIngredientName(name)).toEqual({ base: name, tags: [] })
  })

  it('keeps the text of a name that is only a parenthetical', () => {
    expect(splitIngredientName('(facultatif)')).toEqual({ base: '(facultatif)', tags: [] })
  })

  it('ignores empty items', () => {
    expect(splitIngredientName('sel ( , )')).toEqual({ base: 'sel', tags: [] })
  })
})
