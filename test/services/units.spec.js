import { describe, expect, it } from 'vitest'
import { formatAmount, toBaseAmount, toDisplayAmount } from '../../src/services/units.js'

describe('toBaseAmount', () => {
  it('leaves grams alone', () => {
    expect(toBaseAmount(500, 'g')).toEqual({ quantity: 500, unit: 'g' })
  })

  it('converts the other metric mass units to grams', () => {
    expect(toBaseAmount(1.5, 'kg')).toEqual({ quantity: 1500, unit: 'g' })
    expect(toBaseAmount(200, 'mg')).toEqual({ quantity: 0.2, unit: 'g' })
  })

  it('treats a millilitre as a gram, so volumes merge with masses', () => {
    expect(toBaseAmount(500, 'ml')).toEqual({ quantity: 500, unit: 'g' })
    expect(toBaseAmount(500, 'cL')).toEqual({ quantity: 5000, unit: 'g' })
    expect(toBaseAmount(2, 'dl')).toEqual({ quantity: 200, unit: 'g' })
    expect(toBaseAmount(1.5, 'L')).toEqual({ quantity: 1500, unit: 'g' })
  })

  it('accepts spelled-out unit names', () => {
    expect(toBaseAmount(250, 'grammes')).toEqual({ quantity: 250, unit: 'g' })
    expect(toBaseAmount(2, 'Litres')).toEqual({ quantity: 2000, unit: 'g' })
  })

  it('weighs a volume at the ingredient density it is given', () => {
    expect(toBaseAmount(1, 'L', { density: 0.915 })).toEqual({ quantity: 915, unit: 'g' })
    expect(toBaseAmount(50, 'cl', { density: 0.915 })).toEqual({ quantity: 457.5, unit: 'g' })
  })

  it('leaves a mass alone whatever the density', () => {
    expect(toBaseAmount(500, 'g', { density: 0.915 })).toEqual({ quantity: 500, unit: 'g' })
    expect(toBaseAmount(1.5, 'kg', { density: 0.915 })).toEqual({ quantity: 1500, unit: 'g' })
  })

  it('leaves a unit it cannot convert exactly as written', () => {
    expect(toBaseAmount(2, 'cuillères à soupe')).toEqual({ quantity: 2, unit: 'cuillères à soupe' })
    expect(toBaseAmount(4, '')).toEqual({ quantity: 4, unit: '' })
  })

  it('keeps a missing quantity missing', () => {
    expect(toBaseAmount(null, '')).toEqual({ quantity: null, unit: '' })
    expect(toBaseAmount(null, 'g')).toEqual({ quantity: null, unit: 'g' })
  })
})

describe('toDisplayAmount', () => {
  it('promotes a large gram figure to kilos', () => {
    expect(toDisplayAmount(1200, 'g')).toEqual({ quantity: 1.2, unit: 'kg' })
    expect(toDisplayAmount(5500, 'g')).toEqual({ quantity: 5.5, unit: 'kg' })
  })

  it('keeps a figure below the threshold in grams', () => {
    expect(toDisplayAmount(999, 'g')).toEqual({ quantity: 999, unit: 'g' })
  })

  it('leaves other units alone', () => {
    expect(toDisplayAmount(4, '')).toEqual({ quantity: 4, unit: '' })
    expect(toDisplayAmount(2000, 'oeufs')).toEqual({ quantity: 2000, unit: 'oeufs' })
  })

  it('shows a liquid by volume, at its own density', () => {
    // A litre of olive oil weighs 915 g, so that mass is exactly 1 L of it.
    expect(toDisplayAmount(915, 'g', { density: 0.915 })).toEqual({ quantity: 1, unit: 'L' })
    expect(toDisplayAmount(457.5, 'g', { density: 0.915 })).toEqual({ quantity: 500, unit: 'mL' })
  })

  it('keeps a small liquid amount in millilitres', () => {
    expect(toDisplayAmount(100, 'g', { density: 1 })).toEqual({ quantity: 100, unit: 'mL' })
  })

  it('ignores a density on a unit that was never converted to grams', () => {
    expect(toDisplayAmount(2, 'cuillères', { density: 0.915 })).toEqual({ quantity: 2, unit: 'cuillères' })
  })

  it('falls back to weight when there is no density', () => {
    expect(toDisplayAmount(1200, 'g', { density: null })).toEqual({ quantity: 1.2, unit: 'kg' })
  })
})

describe('formatAmount', () => {
  it.each([
    [200, 'g', '200 g'],
    [1, null, '1'],
    [4, '', '4'],
    [0, 'g', '0 g'],
    [1 / 3, 'l', '0.333 l'],
    [null, 'g', ''],
    [0.5, null, '½'],
    [1.5, '', '1½'],
    [0.25, undefined, '¼'],
    [0.75, '', '¾'],
    [0.33, '', '⅓'],
    [0.67, '', '⅔'],
    [2.5, '', '2½'],
    [0.5, 'kg', '0.5 kg'],
    [0.4, '', '0.4'],
    [0.99, '', '0.99']
  ])('formats %s %s', (quantity, unit, expected) => {
    expect(formatAmount(quantity, unit)).toBe(expected)
  })
})
