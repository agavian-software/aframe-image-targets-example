const {clamp, mix, smooth} = require('../shared/easing')
const {DEFAULT_MESSAGE, getDefaultMessage} = require('./text')

const DEFAULT_TIMINGS = Object.freeze({flyIn: 2.2, giftDropPose: 1, giftDrop: 1, giftOpen: 1.2, bannerReveal: 1.6})
const DEFAULTS = Object.freeze({
  enabled: true, message: DEFAULT_MESSAGE, recipientName: '', familyName: '', textColor: '#fff4d4',
  width: 1, pictureHeight: 1, boundsLeft: -0.5, boundsRight: 0.5, boundsBottom: -0.5, boundsTop: 0.5,
  size: 1, speed: 1, santaScale: 1, giftScale: 1, bannerScale: 1,
  santaX: 0.30, santaY: 0, giftX: 0.35, giftY: 0, bannerX: -0.19, bannerY: 0,
  snowCount: 14, snowOpacity: 0.64,
  ...DEFAULT_TIMINGS,
})

const number = (value, fallback, min, max) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

const normalizeOptions = (options = {}) => {
  const input = {...options.positions, ...options.timings, ...options}
  const result = {...DEFAULTS}
  const enabled = typeof input.enabled === 'string' ? input.enabled.trim().toLowerCase() : input.enabled
  result.enabled = enabled == null || [true, 1, 'true', '1'].includes(enabled)
  result.message = String(input.message ?? getDefaultMessage(input.messageLines))
  for (const key of ['recipientName', 'familyName', 'textColor']) {
    result[key] = String(input[key] ?? DEFAULTS[key]).trim()
  }
  for (const key of ['width', 'pictureHeight']) result[key] = number(input[key], 1, 0.001, Infinity)
  const {width, pictureHeight} = result
  for (const [key, fallback] of Object.entries({boundsLeft: -width / 2, boundsRight: width / 2,
    boundsBottom: -pictureHeight / 2, boundsTop: pictureHeight / 2})) {
    result[key] = number(input[key], fallback, -Infinity, Infinity)
  }
  for (const key of ['santaX', 'santaY', 'giftX', 'giftY', 'bannerX', 'bannerY']) {
    result[key] = number(input[key], DEFAULTS[key], -3, 3)
  }
  for (const key of ['size', 'speed', 'santaScale', 'giftScale', 'bannerScale']) {
    result[key] = number(input[key], DEFAULTS[key], 0.1, 3)
  }
  for (const key of Object.keys(DEFAULT_TIMINGS)) result[key] = number(input[key], DEFAULTS[key], 0.1, 30)
  result.snowCount = Math.round(number(input.snowCount, DEFAULTS.snowCount, 0, 24))
  result.snowOpacity = number(input.snowOpacity, DEFAULTS.snowOpacity, 0, 1)
  return result
}

const getSantaLayout = o => {
  const bounds = {left: o.boundsLeft / o.width, right: o.boundsRight / o.width,
    bottom: o.boundsBottom / o.width, top: o.boundsTop / o.width}
  const ratio = o.pictureHeight / o.width
  const scale = o.size * Math.min(1, 0.78 + ratio * 0.31)
  const santaWidth = 0.75 * scale * o.santaScale
  const closedWidth = 0.21 * scale * o.giftScale
  const openWidth = 0.41 * scale * o.giftScale
  const bannerWidth = 0.69 * scale * o.bannerScale
  return {
    bounds, santaWidth, closedWidth, openWidth, bannerWidth,
    santaFrom: bounds.left - 0.56 * santaWidth,
    santaTo: Math.max(bounds.right, o.santaX) + santaWidth * 0.78,
    santaY: bounds.top + 0.43 * santaWidth + 0.025 + o.santaY,
    giftGround: bounds.bottom - 0.028 - openWidth * 0.96 + o.giftY,
    bannerY: bounds.bottom - 0.34 * bannerWidth - 0.028 + o.bannerY,
  }
}

const idleSway = time => Math.sin(time * 4.4) * 0.012

const getSantaFrame = (time, o, layout) => {
  const flyEnd = o.flyIn
  const release = flyEnd + o.giftDropPose
  const land = release + o.giftDrop
  const opened = land + o.giftOpen
  const end = opened + o.bannerReveal
  const fly = clamp(time / flyEnd)
  const drop = clamp((time - release) / o.giftDrop)
  const open = clamp((time - land) / o.giftOpen)
  const departureStart = mix(release, land, 0.42)
  const departure = smooth(departureStart, mix(opened, end, 0.28), time)
  const santaAlpha = 1 - smooth(0.59, 1, departure)
  const leanIn = smooth(mix(flyEnd, release, 0.1), mix(flyEnd, release, 0.64), time)
  const turn = leanIn * (1 - smooth(0, 0.18, drop))
  const santaX = mix(layout.santaFrom, o.santaX, 1 - (1 - fly) ** 1.7) +
    (layout.santaTo - o.santaX) * departure
  const santaY = layout.santaY + 0.08 * (1 - fly) + 0.086 * Math.sin(Math.PI * fly) +
    idleSway(time) + 0.26 * departure
  const santaRotation = mix(0.025, -0.072, turn) + Math.sin(time * 3.2) * 0.017 + 0.14 * departure
  const giftWidth = layout.closedWidth * mix(0.59, 1, smooth(0, 0.45, drop))
  const releaseX = o.santaX - 0.41 * layout.santaWidth
  const releaseY = layout.santaY + idleSway(release) - 0.29 * layout.santaWidth
  const fall = clamp(drop / 0.78) ** 2
  const rebound = clamp((drop - 0.78) / 0.22)
  const bounce = Math.sin(Math.PI * rebound) * layout.closedWidth * 0.26
  const bloom = smooth(0.05, 0.70, open)
  return {
    santaX, santaY, santaRotation, santaAlpha, turn,
    trail: santaAlpha * smooth(0, 0.14, fly) * (0.8 - 0.48 * smooth(0.76, 1, fly) + 0.48 * departure),
    giftAlpha: smooth(0, 0.14, drop) * (1 - smooth(0.04, 0.32, open)),
    giftX: mix(releaseX, o.giftX, smooth(0, 0.78, drop)),
    giftY: mix(releaseY, layout.giftGround + 0.407 * layout.closedWidth, fall) + bounce,
    giftWidth, giftRotation: mix(-0.24, 0, fall) + Math.sin(drop * 9) * 0.13 * (1 - fall),
    openAlpha: smooth(0.06, 0.36, open), openScale: mix(0.54, 1, bloom) + 0.20 * Math.sin(Math.PI * bloom),
    burst: smooth(0, 0.095, open) * (1 - smooth(0.29, 0.95, open)),
    burstScale: mix(0.34, 1.80, 1 - (1 - open) ** 3),
    banner: smooth(opened, end, time),
    snow: smooth(end, end + 0.8, time), snowTime: Math.max(0, time - end),
  }
}

module.exports = {DEFAULTS, normalizeOptions, getSantaLayout, getSantaFrame}
