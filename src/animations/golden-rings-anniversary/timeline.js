const clamp = value => Math.max(0, Math.min(1, value))
const mix = (a, b, p) => a + (b - a) * p
const smooth = (start, end, time) => {
  const p = clamp((time - start) / (end - start))
  return p * p * (3 - 2 * p)
}
const getAnniversaryFrame = (elapsed, duration = 7.5, speed = 1) => {
  const time = Math.max(0, elapsed) * 7.5 / duration * speed
  return {time, entrance: smooth(0, 1.8, time), alpha: smooth(0, 0.3, time),
    join: smooth(1.8, 3.2, time), joined: smooth(2.95, 3.2, time),
    burst: smooth(2.95, 3.12, time) * (1 - smooth(3.35, 3.95, time)),
    burstScale: mix(0.18, 1.1, smooth(2.95, 3.7, time)),
    heart: smooth(3.2, 4.5, time), message: smooth(4.5, 6, time),
    celebration: smooth(6, 6.4, time),
    bob: Math.sin(time * 1.6) * 0.012 * smooth(1.8, 3.2, time)}
}
const getAnniversaryLayout = (options, aspects = {}) => {
  const bannerHeight = options.bannerSize * (aspects.banner ?? 1 / 3)
  const joinedWidth = options.ringSize * 1.65
  const heartWidth = joinedWidth * 1.40
  const heartHeight = heartWidth * (aspects.heart ?? 1)
  const joinedHeight = joinedWidth * (aspects.joined ?? 1)
  return {bannerY: 0.055 + bannerHeight / 2, bannerHeight, joinedWidth, heartWidth,
    ringY: 0.055 + bannerHeight + 0.08 + Math.max(heartHeight, joinedHeight) / 2}
}
const getRingPose = (side, frame, layout, options) => {
  const sign = side === 'left' ? -1 : 1
  const t = frame.entrance, inv = 1 - t
  const startX = sign * (0.5 / options.size + options.ringSize * 0.65 + 0.12)
  const startY = -options.pictureHeight / options.width / options.size * 0.35
  const endX = sign * mix(options.ringSize * 0.69, options.ringSize * 0.34, frame.join)
  // Cubic Bezier: lift at the sides before approaching the joining point.
  const x = inv ** 3 * startX + 3 * inv ** 2 * t * startX +
    3 * inv * t ** 2 * (sign * options.ringSize * 0.85) + t ** 3 * endX
  const y = inv ** 3 * startY + 3 * inv ** 2 * t * (layout.ringY + 0.22) +
    3 * inv * t ** 2 * (layout.ringY + 0.20) + t ** 3 * layout.ringY + frame.bob
  return {x, y, width: options.ringSize * mix(0.72, 1, t),
    rotation: sign * mix(0.18, -0.14, frame.join) * t + Math.sin(frame.time * 1.5 + sign) * 0.025,
    alpha: frame.alpha * (1 - frame.joined)}
}
const heartPoint = p => {
  const a = p * Math.PI * 2
  return {x: Math.sin(a) ** 3 / 2,
    y: (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a) + 2) / 32}
}
const getAnniversarySparkle = (index, frame, layout) => {
  const seed = ((index * 73 + 17) % 101) / 101, scatter = ((index * 37 + 11) % 89) / 89
  const t = frame.time, idle = t >= 7.5
  let x, y, alpha
  if (t >= 3.2 && t < 4.5) {
    const point = heartPoint(seed)
    x = point.x * layout.heartWidth; y = layout.ringY + point.y * layout.heartWidth
    alpha = frame.heart >= seed ? 0.4 + scatter * 0.6 : 0
  } else if (t >= 2.95 && t < 3.95) {
    const p = smooth(2.95, 3.95, t), angle = seed * Math.PI * 2
    x = Math.cos(angle) * p * 0.5; y = layout.ringY + Math.sin(angle) * p * 0.45
    alpha = Math.sin(p * Math.PI) * 0.9
  } else {
    const age = (t + index * 0.39) % (idle ? 4.8 : 2.4)
    const angle = seed * Math.PI * 2
    x = Math.cos(angle) * layout.heartWidth * (0.35 + scatter * 0.2)
    y = layout.ringY + Math.sin(angle) * layout.heartWidth * 0.45 + age * 0.008
    alpha = t >= 3.95 && age < 1 && (!idle || index < 8) ? Math.sin(age * Math.PI) * 0.7 : 0
  }
  return {x, y, alpha, width: 0.009 + scatter * 0.016, rotation: t * 0.7 + seed * Math.PI}
}
const getAnniversaryPetal = (index, frame, pictureRatio, size = 1) => {
  const seed = ((index * 41 + 13) % 97) / 97, scatter = ((index * 67 + 7) % 89) / 89
  const idle = frame.time >= 7.5
  const age = (frame.time - 6 + seed * 0.9) % (idle ? 6 : 2.4)
  const life = 1.5 + seed * 0.5
  const width = 0.024 + seed * 0.026
  return {x: (index % 2 ? 1 : -1) * (0.5 / size + 0.10 + scatter * 0.22) + Math.sin(age * 3 + index) * 0.035,
    y: 0.16 - seed * pictureRatio * 0.7 + age * 0.09 - age * age * (0.11 + scatter * 0.06),
    width: width * (0.4 + 0.6 * Math.abs(Math.cos(age * 4 + index))), height: width,
    rotation: index + age * (1 + scatter * 3),
    alpha: frame.time >= 6 && age >= 0 && age < life && (!idle || index < 4)
      ? frame.celebration * smooth(0, 0.15, age) * (1 - smooth(life - 0.4, life, age)) : 0}
}
module.exports = {mix, smooth, getAnniversaryFrame, getAnniversaryLayout, getRingPose, heartPoint, getAnniversarySparkle, getAnniversaryPetal}
