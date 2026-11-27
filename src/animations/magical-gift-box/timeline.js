const {clamp, mix, smooth} = require('../shared/easing')

const DURATION = 4.2
const getEntranceEnd = duration => duration / DURATION

const getGiftBoxLayout = options => {
  const {width, pictureHeight, size, offsetX, offsetY, boundsTop} = options
  const scale = Math.min(width, pictureHeight) * Math.min(size, 1.4)
  const fit = (value, limit) => Math.max(-limit, Math.min(limit, value))
  return {
    scale,
    x: fit(width * offsetX / scale, width / (2 * scale) - 0.30),
    y: fit(-0.10 - width * offsetY / scale, pictureHeight / (2 * scale) - 0.29),
    top: (boundsTop + width * 0.035) / scale,
    halfHeight: pictureHeight / (2 * scale),
  }
}

const getGiftBoxFrame = (elapsed, duration = DURATION) => {
  const time = Math.max(0, elapsed) * DURATION / duration
  const entrance = smooth(0, 1, time)
  const opening = smooth(1.22, 1.44, time)
  const hearts = smooth(1.58, 1.84, time)
  const stars = smooth(1.91, 2.15, time)
  const settled = smooth(2.22, 2.48, time)
  const lid = smooth(1, 1.46, time)
  const gifts = smooth(1.5, 2.58, time)
  const closed = 1 - smooth(1, 1.13, time)
  return {
    time,
    entranceScale: mix(0.28, 1, entrance) + Math.sin(entrance * Math.PI) * 0.055,
    entranceY: mix(-0.44, 0, entrance),
    entranceOpacity: smooth(0, 0.22, time),
    closed,
    closedBody: (1 - closed) * (1 - opening),
    lidOpacity: smooth(1, 1.13, time) * (1 - smooth(1.29, 1.48, time)),
    lidY: mix(0.12, 0.57, lid),
    lidRotation: lid * -0.32,
    lidScale: mix(0.65, 0.81, lid),
    explosion: opening * (1 - hearts),
    hearts: opening * hearts * (1 - stars),
    stars: opening * hearts * stars * (1 - settled),
    openBody: opening * hearts * stars * settled,
    pulse: 1 + Math.sin(clamp((time - 1.25) / 0.62) * Math.PI) * 0.065,
    giftSpread: gifts,
    giftsOpacity: smooth(1.52, 1.82, time),
    artOpacity: 1 - smooth(2.91, 3.78, time),
    bannerOpacity: smooth(2.33, 2.60, time),
    bannerLift: smooth(2.91, DURATION, time),
    videoReady: elapsed >= duration,
  }
}

const getSparkleFrame = (index, time) => {
  const seed = ((index * 73 + 19) % 101) / 101
  const age = time - 1.44 - seed * 0.72
  const lifetime = 0.68 + seed * 0.86
  const progress = clamp(age / lifetime)
  const angle = seed * Math.PI * 2.4
  return {
    x: Math.sin(angle) * progress * 0.61,
    y: -0.04 + progress * (0.42 + seed * 0.40) - progress * progress * 0.12,
    z: 0.025 + seed * 0.04,
    size: 0.012 + seed * 0.022,
    opacity: age > 0 && age < lifetime ? Math.sin(progress * Math.PI) * 0.9 : 0,
    spin: angle + age * 0.7,
    tint: index % 5 === 0 ? 1 : 0,
  }
}

module.exports = {DURATION, getEntranceEnd, getGiftBoxLayout, getGiftBoxFrame, getSparkleFrame}
