/**
 * Unit handling for the shopping list.
 *
 * Recipes measure the same ingredient in whichever unit their author found
 * convenient: one writes "500 g lait", another "500 cL". A shopping list wants
 * a single line per thing to buy, so every metric amount is converted to one
 * canonical unit before the rows are merged.
 *
 * That canonical unit is the gram, and a millilitre is treated as a gram. It
 * is not true in physics — a litre of oil is not a kilo — but it is what a
 * cook means when they write milk as either, and it is the only way to put
 * two differently-measured lines of the same ingredient onto one row.
 *
 * Where a real density is known (densities.js), it is used instead of that
 * approximation, in both directions: a volume becomes the mass it actually
 * weighs, and a mass is shown back as the volume a shop sells it in.
 */
import { WATER_DENSITY } from './densities.js'


/** How many grams one of each metric mass unit is worth. */
const GRAMS_PER_MASS_UNIT = {
  mg: 0.001,
  g: 1,
  kg: 1000
}

/**
 * How many millilitres one of each metric volume unit is worth. These reach
 * grams through a density rather than a fixed factor, so "50 cL of oil" is
 * stored as the 458 g it actually weighs.
 */
const ML_PER_VOLUME_UNIT = {
  ml: 1,
  cl: 10,
  dl: 100,
  l: 1000
}

/** Spellings that mean one of the units above. Lower-cased before lookup. */
const ALIASES = {
  gr: 'g',
  gram: 'g',
  grams: 'g',
  gramme: 'g',
  grammes: 'g',
  kilo: 'kg',
  kilos: 'kg',
  kilogramme: 'kg',
  kilogrammes: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  milligramme: 'mg',
  milligrammes: 'mg',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  centilitre: 'cl',
  centilitres: 'cl',
  decilitre: 'dl',
  decilitres: 'dl',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml'
}

/** Above this many grams, the amount reads better in kilos. */
const KILO_THRESHOLD = 1000

/**
 * Above this many millilitres, the amount reads better in litres. It is the
 * same figure as KILO_THRESHOLD and stays a separate constant on purpose:
 * they mean different things, and the gram-per-millilitre equivalence this
 * file is built on is the only reason they coincide.
 */
const LITRE_THRESHOLD = 1000

function canonicalUnit(unit) {
  const key = (unit || '').trim().toLowerCase()
  return ALIASES[key] || key
}

/**
 * The amount as it is stored and merged: metric units collapse to grams, and
 * anything else — spoons, pinches, "4 oeufs" — is left exactly as written,
 * since there is no sensible conversion for it.
 *
 * A volume reaches grams through `density` (see densities.js), which defaults
 * to water. That default is what makes an ingredient nobody has a density for
 * behave exactly as it did when a millilitre was simply called a gram.
 */
export function toBaseAmount(quantity, unit, { density = WATER_DENSITY } = {}) {
  const key = canonicalUnit(unit)

  const grams = GRAMS_PER_MASS_UNIT[key]
  if (grams) {
    if (quantity == null) return { quantity, unit: 'g' }
    return { quantity: quantity * grams, unit: 'g' }
  }

  const millilitres = ML_PER_VOLUME_UNIT[key]
  if (millilitres) {
    if (quantity == null) return { quantity, unit: 'g' }
    return { quantity: quantity * millilitres * density, unit: 'g' }
  }

  return { quantity, unit }
}

/**
 * The amount as it is shown: a gram figure past the kilo threshold reads
 * better in kilos, so 1200 g becomes 1.2 kg while 200 g stays as it is.
 *
 * Passing a `density` switches the same figure to the volume scale a shop
 * sells by: 915 g of olive oil is a litre of it, not 915 mL. Only the
 * canonical gram unit is rescaled; anything left in its own unit — spoons,
 * "4 oeufs" — is passed through untouched.
 */
export function toDisplayAmount(quantity, unit, { density = null } = {}) {
  if (unit !== 'g' || quantity == null) return { quantity, unit }

  if (density) {
    const millilitres = quantity / density
    if (Math.abs(millilitres) >= LITRE_THRESHOLD) return { quantity: millilitres / LITRE_THRESHOLD, unit: 'L' }
    return { quantity: millilitres, unit: 'mL' }
  }

  if (Math.abs(quantity) >= KILO_THRESHOLD) return { quantity: quantity / KILO_THRESHOLD, unit: 'kg' }
  return { quantity, unit }
}

/** Decimals kept when an amount is written out. */
const PRECISION = 1000

/**
 * An amount as a recipe writes it: a rounded figure followed by its unit, if
 * it has one. A missing quantity formats as nothing at all, so a caller can
 * pass one straight through without a guard of its own.
 */
export function formatAmount(quantity, unit) {
  if (quantity == null) return ''
  const figure = unit ? Math.round(quantity * PRECISION) / PRECISION : toFraction(quantity)
  return [figure, unit].filter(value => value || value === 0).join(' ')
}

const FRACTIONS = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']]
const FRACTION_TOLERANCE = 0.005

/**
 * A count of things ("½ aubergine", "1½ oignon") reads better with a vulgar
 * fraction than with a decimal. Only the usual fractions are used, and only
 * when the figure is within rounding distance of one; anything else keeps its
 * rounded decimal form. Meant for amounts without a unit.
 */
export function toFraction(quantity) {
  const rounded = Math.round(quantity * PRECISION) / PRECISION
  if (!Number.isFinite(quantity) || quantity < 0) return rounded
  const whole = Math.floor(quantity + FRACTION_TOLERANCE)
  const rest = quantity - whole
  const match = FRACTIONS.find(([value]) => Math.abs(rest - value) < FRACTION_TOLERANCE)
  if (!match) return rounded
  return whole ? `${whole}${match[1]}` : match[1]
}
