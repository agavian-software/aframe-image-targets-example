const clamp = value => Math.max(0, Math.min(1, value))
const smooth = (start, end, time) => {
  const value = clamp((time - start) / (end - start))
  return value * value * (3 - 2 * value)
}
const mix = (start, end, value) => start + (end - start) * value

// All movement is in picture-width units, with the bottom edge at local Y = 0.
// duration scales the complete five-second reveal, including every stage boundary.
const getGiftBoxFrame = (elapsed, duration = 5) => {
  const time = Math.max(0, elapsed) * 5 / duration
  const entrance = smooth(0, 1.5, time)
  const opening = smooth(1.9, 2.2, time)
  const hearts = smooth(2.85, 3.1, time)
  const stars = smooth(3.3, 3.55, time)
  const settled = smooth(3.8, 4, time)
  const lid = smooth(1.5, 2.15, time)
  const gifts = smooth(2.5, 3.65, time)
  const banner = smooth(4, 5, time)
  const float = Math.sin(Math.max(0, time - 5) * 1.6) * 0.012
  const closed = 1 - smooth(1.5, 1.65, time)
  return {
    time,
    entranceScale: mix(0.18, 1, entrance) + Math.sin(entrance * Math.PI) * 0.035,
    giftY: mix(0.1, -0.85, entrance) + Math.sin(entrance * Math.PI * 4) *
      Math.sin(entrance * Math.PI) * 0.025 + float,
    closed,
    closedBody: (1 - closed) * (1 - opening),
    lidOpacity: smooth(1.5, 1.62, time) * (1 - smooth(1.95, 2.2, time)),
    lidY: mix(-0.73, -0.34, lid),
    lidRotation: lid * -0.32,
    lidScale: mix(0.65, 0.8, lid),
    // A partition of unity: the composite art never stacks multiple solid boxes.
    explosion: opening * (1 - hearts),
    hearts: opening * hearts * (1 - stars),
    stars: opening * hearts * stars * (1 - settled),
    openBody: opening * hearts * stars * settled,
    pulse: 1 + Math.sin(clamp((time - 1.9) / 0.6) * Math.PI) * 0.065,
    expansion: 1 + smooth(2.5, 4, time) * 0.035,
    giftSpread: gifts,
    giftsOpacity: smooth(2.5, 2.85, time),
    bannerY: mix(-0.97, -0.38, banner) + float,
    bannerOpacity: smooth(4, 4.35, time),
    float,
  }
}

const getSparkleFrame = (index, time) => {
  const seed = ((index * 73 + 19) % 101) / 101
  const burst = time >= 2.5 && time < 5
  const age = burst ? time - 2.5 - seed * 0.5 : (time - 5 + index * 0.31) % 3.8
  const lifetime = burst ? 1.15 + seed * 0.65 : 0.85
  const active = (burst || (time >= 5 && index < 10)) && age >= 0 && age < lifetime
  const progress = clamp(age / lifetime)
  const angle = seed * Math.PI * 2.4
  return {
    x: Math.sin(angle) * progress * (burst ? 0.65 : 0.35),
    y: -0.89 + progress * (0.42 + seed * 0.4) - progress * progress * 0.12,
    z: 0.025 + seed * 0.04,
    size: (0.012 + seed * 0.022) * (burst ? 1 : 0.7),
    opacity: active ? Math.sin(progress * Math.PI) * (burst ? 0.9 : 0.65) : 0,
    spin: angle + age * 0.7,
    tint: index % 5 === 0 ? 1 : 0,
  }
}

module.exports = {getGiftBoxFrame, getSparkleFrame}
