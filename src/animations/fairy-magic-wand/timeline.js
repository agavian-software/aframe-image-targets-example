const {clamp, mix, smooth} = require('../shared/easing')

const BURST_PEAK = 3.12

const getFairyFrame = (elapsed, duration = 5, speed = 1) => {
  const time = Math.max(0, elapsed) * 5 / duration * speed
  const entrance = smooth(0, 1.5, time)
  const wave = smooth(1.5, 1.7, time) * (1 - smooth(2.8, 3, time)) *
    Math.sin((time - 1.5) * Math.PI * 3) +
    smooth(4, 4.15, time) * (1 - smooth(4.7, 5, time)) * Math.sin((time - 4) * Math.PI * 3)
  return {
    time, entrance, wave,
    alpha: smooth(0, 0.35, time),
    hover: smooth(1.5, 1.95, time),
    rotation: (1 - entrance) * -0.18 + Math.sin(time * 1.4) * 0.025 + wave * 0.12,
    scale: mix(0.65, 1, entrance) * (1 + Math.sin(time * 3.4) * 0.008 * entrance),
    bob: Math.sin(time * 1.65) * 0.014 * entrance,
    circle: smooth(1.5, 3, time),
    circleAlpha: smooth(1.5, 1.65, time) * (1 - smooth(3.25, 4, time)),
    trailAlpha: smooth(1.5, 1.7, time) * (1 - smooth(2.85, 3.15, time)) +
      smooth(4, 4.15, time) * (1 - smooth(4.6, 4.9, time)) * 0.65,
    burstAlpha: smooth(3, BURST_PEAK, time) * (1 - smooth(3.25, 4, time)),
    burstScale: mix(0.08, 0.5, smooth(3, 3.65, time)),
    videoReady: time >= BURST_PEAK,
    messageAlpha: smooth(4, 4.6, time),
    messageScale: mix(0.75, 1, smooth(4, 5, time)),
  }
}

const getFairyPose = (frame, {pictureRatio, size, fairySize, useHoverPose,
  origin = {x: 0, y: -pictureRatio / (2 * size)}}) => {
  const hover = useHoverPose ? frame.hover : 0
  const width = fairySize * frame.scale
  const height = width * mix(1100 / 1005, 1100 / 940, hover)
  const x = mix(origin.x, 0.5 / size + fairySize * 0.55 + 0.07, frame.entrance)
  const y = mix(origin.y, -pictureRatio / size * 0.37 + 0.065, frame.entrance) +
    Math.sin(frame.entrance * Math.PI) * 0.24 + frame.bob
  // Art is mirrored toward the picture; normalized painted star centers differ
  // slightly between poses. Rotate this point with the complete sprite.
  const tipX = -0.34 * width
  const tipY = mix(0.39, 0.40, hover) * height
  const c = Math.cos(frame.rotation), s = Math.sin(frame.rotation)
  return {x, y, width, height, hover, rotation: frame.rotation,
    tip: {x: x + c * tipX - s * tipY, y: y + s * tipX + c * tipY}}
}

// This ellipse encloses every corner of the picture rather than cutting across
// rectangular video. Its center is at the picture's center, below the top anchor.
const getOrbitPoint = (progress, pictureRatio) => {
  const angle = Math.PI / 4 - progress * Math.PI * 2
  return {x: (0.5 + 0.065) * 1.45 * Math.cos(angle),
    y: -pictureRatio / 2 + (pictureRatio / 2 + 0.065) * 1.45 * Math.sin(angle)}
}

const getMagicParticle = (index, frame, pictureRatio, tip) => {
  const seed = ((index * 73 + 17) % 101) / 101
  const scatter = ((index * 37 + 11) % 89) / 89
  const time = frame.time
  let x = tip.x, y = tip.y, alpha = 0
  if (time >= 5) {
    const age = (time - 5 + index * 0.39) % 3.8
    const p = age / 0.85
    x += Math.cos(seed * Math.PI * 2) * p * 0.12
    y += Math.sin(seed * Math.PI * 2) * p * 0.12
    alpha = index < 8 && p >= 0 && p < 1 ? Math.sin(p * Math.PI) * 0.75 : 0
  } else if (index % 3 === 0) {
    const p = seed
    const orbit = getOrbitPoint(p, pictureRatio)
    x = orbit.x; y = orbit.y
    alpha = frame.circle >= p ? frame.circleAlpha * (0.35 + scatter * 0.5) : 0
  } else if (index % 3 === 1) {
    const age = (time - 1.5 + scatter * 0.4) % 0.6
    const p = clamp(age / 0.6)
    const head = getOrbitPoint(frame.circle, pictureRatio)
    x = mix(tip.x, head.x, p) + Math.sin(seed * Math.PI * 2) * p * 0.035
    y = mix(tip.y, head.y, p) + Math.sin(p * Math.PI) * 0.08
    alpha = time >= 1.5 && time < 3 ? Math.sin(p * Math.PI) * 0.8 : 0
  } else {
    const p = smooth(3, 3.8 + scatter * 0.2, time)
    const destination = getOrbitPoint(seed, pictureRatio)
    x = mix(tip.x, destination.x * (1 + scatter * 0.15), p)
    y = mix(tip.y, destination.y + (scatter - 0.5) * 0.15, p)
    alpha = time >= 3 && time < 4.3 ? Math.sin(p * Math.PI) * 0.9 : 0
  }
  return {x, y, alpha, size: 0.012 + scatter * 0.018, rotation: time * 0.8 + seed * Math.PI}
}

module.exports = {smooth, mix, getFairyFrame, getFairyPose, getOrbitPoint, getMagicParticle}
