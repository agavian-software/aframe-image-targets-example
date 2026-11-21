const clamp = value => Math.max(0, Math.min(1, value))
const mix = (a, b, p) => a + (b - a) * p
const smooth = (start, end, time) => {
  const p = clamp((time - start) / (end - start))
  return p * p * (3 - 2 * p)
}

// Canonical seconds let duration/speed rescale all six phases together.
const getProposalFrame = (elapsed, duration = 8, speed = 1) => {
  const time = Math.max(0, elapsed) * 8 / duration * speed
  const p = clamp(time / 1.5), back = p - 1
  return {
    time, entrance: 1 + 2.4 * back ** 3 + 1.4 * back ** 2,
    boxAlpha: smooth(0, 0.2, time), opening: smooth(1.5, 2.25, time),
    ringRise: smooth(2.1, 3, time), ringAlpha: smooth(2.1, 2.5, time),
    heart: smooth(3, 4.5, time), heartAlpha: smooth(3.1, 4.25, time),
    message: smooth(4.5, 6, time),
    celebration: smooth(6, 6.15, time) * (1 - smooth(6.6, 7.35, time)),
    hearts: smooth(6, 7.25, time), bob: Math.sin(time * 1.8) * 0.012,
  }
}

// Everything is below the bottom anchor. Gap and size changes retain clearance.
const getProposalLayout = (options, aspects = {}) => {
  const bannerHeight = options.bannerSize * (aspects.banner ?? 1 / 3)
  const heartWidth = Math.max(0.58, options.ringSize * 1.85)
  const heartHeight = heartWidth * (aspects.heart ?? 1)
  const ringHeight = options.ringSize * (aspects.ring ?? 1)
  const boxHeight = options.boxSize * Math.max(aspects.closed ?? 1, aspects.open ?? 1)
  const bannerY = -0.06 - bannerHeight / 2
  const ringY = -0.06 - bannerHeight - 0.065 - Math.max(heartHeight, ringHeight) / 2
  const boxY = ringY - Math.max(ringHeight / 2 + 0.07, heartHeight / 2) - boxHeight / 2 - 0.06
  return {bannerY, bannerHeight, ringY, heartWidth, boxY, boxHeight}
}

const heartPoint = progress => {
  const a = progress * Math.PI * 2
  return {x: Math.sin(a) ** 3 / 2,
    y: (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a) + 2) / 32}
}

const getProposalSparkle = (index, frame, layout) => {
  const seed = ((index * 73 + 17) % 101) / 101
  const scatter = ((index * 37 + 11) % 89) / 89
  const t = frame.time
  let x, y, alpha = 0
  if (t >= 3 && t < 4.5) {
    const a = seed * Math.PI * 2 + t * 4 * (1 - frame.heart)
    const heart = heartPoint(seed)
    x = mix(Math.cos(a) * layout.heartWidth * 0.28, heart.x * layout.heartWidth, frame.heart)
    y = layout.ringY + mix(Math.sin(a) * layout.heartWidth * 0.28, heart.y * layout.heartWidth, frame.heart)
    alpha = smooth(3, 3.2, t) * (0.4 + scatter * 0.6)
  } else {
    const idle = t >= 8
    const age = (t + index * 0.39) % (idle ? 4.8 : 2.2)
    const p = age / 1.1
    const heart = heartPoint(seed + Math.sin(t * 0.2) * 0.015)
    x = heart.x * layout.heartWidth * (idle ? 1.05 : 0.8)
    y = layout.ringY + heart.y * layout.heartWidth + age * 0.012
    alpha = t >= 2.5 && p < 1 && (!idle || index < 10) ? Math.sin(p * Math.PI) * 0.8 : 0
  }
  return {x, y, alpha, size: 0.009 + scatter * 0.014, rotation: t * 0.7 + seed * Math.PI}
}

// Analytic ballistic motion is stable across frame rates and deterministic on replay.
const getProposalPetal = (index, frame, layout) => {
  const seed = ((index * 41 + 13) % 97) / 97
  const scatter = ((index * 67 + 7) % 89) / 89
  const age = frame.time - 6 - seed * 0.45
  const lifetime = 1.25 + scatter * 0.5
  return {
    x: (scatter - 0.5) * age * 1.4 + Math.sin(age * 4 + seed * 6) * age * 0.035,
    y: layout.ringY + (0.25 + seed * 0.32) * age - (0.38 + scatter * 0.25) * age * age,
    alpha: age >= 0 && age < lifetime ? smooth(0, 0.12, age) * (1 - smooth(lifetime - 0.4, lifetime, age)) : 0,
    size: 0.025 + seed * 0.032, rotation: seed * 6 + age * (1.5 + scatter * 4),
    flutter: 0.5 + 0.5 * Math.abs(Math.cos(age * 4 + seed * 6)),
  }
}

module.exports = {mix, smooth, getProposalFrame, getProposalLayout, heartPoint, getProposalSparkle, getProposalPetal}
