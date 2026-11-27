const {clamp, mix, smooth} = require('../shared/easing')
const {ASSET_BASE} = require('./assets')

const ARTWORK_YEAR = '2027'
const TIMINGS = {clockEntrance: 1.5, countdownSequence: 4, midnightFlash: 1, yearReveal: 1.3, bannerReveal: 1.2}
const POSITIONS = {clockX: 0, clockY: 0, countdownX: 0, countdownY: 0, yearX: 0, yearY: 0,
  bannerX: 0, bannerY: 0, fireworksX: 0, fireworksY: 0, confettiX: 0, confettiY: 0}
const SCALES = {size: 1, clockScale: 1, haloScale: 1, yearScale: 1, bannerScale: 1,
  fireworksScale: 1, confettiScale: 1}
const MAX_PARTICLES = 36
const DEFAULTS = Object.freeze({
  enabled: true, assetBase: ASSET_BASE, year: ARTWORK_YEAR, recipientName: '', familyName: '',
  width: 1, pictureHeight: 1, boundsLeft: -0.5, boundsRight: 0.5, boundsBottom: -0.5, boundsTop: 0.5,
  particleCount: 24, confettiOpacity: 0.74, ...TIMINGS, ...POSITIONS, ...SCALES,
})

const normalizeYear = value => /^\d{4}$/.test(String(value).trim()) ? String(value).trim() : ARTWORK_YEAR
const getNewYearMessage = ({year, messageLines} = {}) => Array.isArray(messageLines)
  ? messageLines.map(line => String(line ?? '')).join('\n')
  : `Happy New Year ${normalizeYear(year)}\nWishing You Joy, Health & Success`

const number = (value, fallback, min, max) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

const normalizeOptions = (options = {}) => {
  const input = {...options.positions, ...options.timings, ...options.scales, ...options}
  const o = {...DEFAULTS}
  const enabled = typeof input.enabled === 'string' ? input.enabled.trim().toLowerCase() : input.enabled
  o.enabled = enabled == null || [true, 1, 'true', '1'].includes(enabled)
  o.assetBase = String(input.assetBase ?? '').trim().replace(/\/+$/, '') || ASSET_BASE
  o.year = normalizeYear(input.year)
  o.message = String(input.message ?? getNewYearMessage(input))
  for (const key of ['recipientName', 'familyName']) o[key] = String(input[key] ?? '').trim()
  o.width = number(input.width, 1, 0.001, Infinity)
  o.pictureHeight = number(input.pictureHeight, 1, 0.001, Infinity)
  for (const [key, fallback] of Object.entries({boundsLeft: -o.width / 2, boundsRight: o.width / 2,
    boundsBottom: -o.pictureHeight / 2, boundsTop: o.pictureHeight / 2})) {
    o[key] = number(input[key], fallback, -Infinity, Infinity)
  }
  for (const key of Object.keys(TIMINGS)) o[key] = number(input[key], TIMINGS[key], 0.1, 60)
  for (const key of Object.keys(POSITIONS)) o[key] = number(input[key], POSITIONS[key], -3, 3)
  for (const key of Object.keys(SCALES)) o[key] = number(input[key], SCALES[key], 0.1, 3)
  o.particleCount = Math.round(number(input.particleCount, DEFAULTS.particleCount, 0, MAX_PARTICLES))
  o.confettiOpacity = number(input.confettiOpacity, DEFAULTS.confettiOpacity, 0, 1)
  return o
}

const getLayout = o => {
  const left = o.boundsLeft / o.width, right = o.boundsRight / o.width
  const top = o.boundsTop / o.width, bottom = o.boundsBottom / o.width
  const scale = o.size * Math.min(1, 0.72 + 0.4 * o.pictureHeight / o.width)
  const gap = 0.038
  const clockWidth = 0.39 * scale * o.clockScale
  const haloWidth = 0.48 * scale * o.haloScale
  const yearWidth = 0.77 * scale * o.yearScale
  const bannerWidth = 0.94 * scale * o.bannerScale
  return {
    left, right, top, bottom, scale, clockWidth, haloWidth, yearWidth, bannerWidth,
    clockY: top + gap + clockWidth * 0.54 + o.clockY,
    countdownY: top + gap + haloWidth * 0.54 + o.countdownY,
    yearY: top + gap + yearWidth * 0.28 + o.yearY,
    bannerY: bottom - gap - bannerWidth * 0.51 + o.bannerY,
    fireworkWidth: 0.68 * scale * o.fireworksScale,
    confettiWidth: 0.58 * scale * o.confettiScale,
  }
}

const getFrame = (time, o) => {
  const entrance = time / o.clockEntrance
  const countdown = (time - o.clockEntrance) / o.countdownSequence
  const midnightAt = o.clockEntrance + o.countdownSequence
  const yearAt = midnightAt + o.midnightFlash
  const bannerAt = yearAt + o.yearReveal
  const midnight = (time - midnightAt) / o.midnightFlash
  const year = (time - yearAt) / o.yearReveal
  const banner = (time - bannerAt) / o.bannerReveal
  const loop = Math.max(0, time - (bannerAt + o.bannerReveal))
  const counting = time >= o.clockEntrance && time < midnightAt
  const struck = time >= midnightAt
  const step = countdown * 5 + 1e-9
  const phase = step % 1
  return {
    clock: smooth(0, 0.34, entrance) * (1 - smooth(0.12, 0.72, midnight)),
    rise: 1 - (1 - clamp(entrance)) ** 3,
    clockShift: smooth(0, 0.095, countdown),
    halo: smooth(-0.001, 0.075, countdown) * (1 - smooth(0.10, 0.68, midnight)),
    digit: counting ? Math.max(1, 5 - Math.floor(step)) : struck && midnight < 0.24 ? 0 : null,
    digitAlpha: counting ? mix(0.72, 1, smooth(0, 0.25, phase)) : 1 - smooth(0.06, 0.24, midnight),
    pulse: counting ? 1 + 0.15 * (1 - phase) ** 2 : 1 + 0.31 * smooth(0, 0.23, midnight),
    midnight: Math.max(0, midnight),
    flash: struck ? 1 - smooth(0, 0.36, midnight) : 0,
    fireworks: smooth(-0.001, 0.13, midnight) * (1 - smooth(0.47, 1.05, midnight)),
    fireworkScale: mix(0.25, 1, 1 - (1 - clamp(midnight / 0.72)) ** 3),
    year: smooth(0, 0.22, year),
    yearScale: mix(0.60, 1, smooth(0, 0.62, year)) + 0.15 * Math.sin(Math.PI * smooth(0.14, 0.80, year)),
    yearRise: smooth(0, 0.7, year),
    banner: smooth(0, 1, banner),
    countdownTrail: counting ? 0.72 * (1 - smooth(0.02, 0.32, phase)) : 0,
    countdownSweep: counting ? smooth(0, 0.36, phase) : 0,
    yearTrail: smooth(0, 0.20, year) * (1 - smooth(0.45, 1.04, year)),
    yearSweep: clamp(year),
    confetti: smooth(0, 0.58, loop),
    loop,
  }
}

module.exports = {ARTWORK_YEAR, DEFAULTS, MAX_PARTICLES, getNewYearMessage, normalizeOptions, getLayout, getFrame}
