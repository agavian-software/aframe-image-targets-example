const clamp = value => Math.max(0, Math.min(1, value))
const mix = (a, b, p) => a + (b - a) * p
const smooth = (start, end, time) => {
  const p = clamp((time - start) / (end - start))
  return p * p * (3 - 2 * p)
}
const getCupidFrame = (elapsed, options) => {
  const time = Math.max(0, elapsed) * options.speed
  const hitAt = 3 + 0.5 / options.arrowSpeed
  const breakAt = hitAt + 0.5, revealAt = breakAt + options.breakDuration
  const split = smooth(breakAt, revealAt, time)
  return {time, hitAt, breakAt, revealAt, endAt: revealAt + 2,
    entrance: smooth(0, 2, time), alpha: smooth(0, 0.25, time),
    aim: smooth(2, 2.25, time), shot: smooth(3, hitAt, time),
    impact: smooth(hitAt, hitAt + 0.04, time) * (1 - smooth(hitAt + 0.15, hitAt + 0.45, time)),
    crack: smooth(hitAt, hitAt + 0.08, time), split, videoOpacity: split,
    celebration: smooth(revealAt, revealAt + 0.5, time),
    depart: smooth(revealAt + 0.5, revealAt + 2, time),
    shake: time >= hitAt && time < breakAt ? Math.sin((time - hitAt) * 85) * (1 - smooth(hitAt, breakAt, time)) * 0.018 : 0,
  }
}
const getCupidPose = (frame, options, bounds) => {
  const w = options.cupidSize * options.size
  let x = options.cupidX, y = options.cupidY
  if (Math.hypot(x, y) < 0.4) x = -0.7
  x -= (1 - frame.entrance) * 1.1
  y += (1 - frame.entrance) * 0.65 + Math.sin(frame.entrance * Math.PI) * 0.23
  y += Math.sin(frame.time * 1.8) * 0.012 * frame.entrance
  const leave = smooth(frame.breakAt, frame.revealAt, frame.time)
  x = mix(x, bounds.left - w * 0.7 - 0.12, leave) - frame.depart * 0.75
  y += frame.depart * 0.7
  const rotation = Math.atan2(-y, -x) * (1 - frame.depart * 0.7)
  const bx = w * 0.36, by = w * 0.02
  return {x, y, rotation, width: w, alpha: frame.alpha * (1 - frame.depart),
    bow: {x: x + Math.cos(rotation) * bx - Math.sin(rotation) * by,
      y: y + Math.sin(rotation) * bx + Math.cos(rotation) * by}}
}
// The arrow's visible tip (rather than its center) lands at exactly (0, 0).
const getArrowPose = (progress, origin, width) => {
  const rotation = Math.atan2(-origin.y, -origin.x)
  const tip = {x: mix(origin.x, 0, progress), y: mix(origin.y, 0, progress)}
  return {x: tip.x - Math.cos(rotation) * width * 0.47,
    y: tip.y - Math.sin(rotation) * width * 0.47, rotation, tip}
}
const getHalfPose = (side, progress, heartWidth, halfAspect, bounds) => {
  const sign = side === 'left' ? -1 : 1
  const heartHeight = heartWidth * 241 / 294
  const width = heartHeight * halfAspect
  // A half-diagonal margin clears the complete rotated plane, not just its center.
  const radius = Math.hypot(width, heartHeight) / 2
  const end = side === 'left' ? bounds.left - radius - 0.10 : bounds.right + radius + 0.10
  return {x: mix(sign * heartWidth * 0.23, end, progress), y: -Math.sin(progress * Math.PI) * 0.14,
    width: width * mix(1, 0.68, progress), height: heartHeight * mix(1, 0.68, progress),
    rotation: sign * progress * 0.95, alpha: 1 - smooth(0.8, 1, progress)}
}
const getCupidParticle = (index, frame, bounds, kind) => {
  const seed = ((index * 73 + 17) % 101) / 101, scatter = ((index * 37 + 11) % 89) / 89
  const age = frame.time - frame.breakAt
  if (kind === 'fragment') {
    const p = clamp(age / (frame.revealAt - frame.breakAt))
    const angle = seed * Math.PI * 2
    return {x: Math.cos(angle) * p * (0.5 + scatter), y: Math.sin(angle) * p * 0.7 - p * p * 0.4,
      width: 0.045 + scatter * 0.065, rotation: seed * 6 + p * 5,
      alpha: age >= 0 && p < 1 ? Math.sin(p * Math.PI) : 0}
  }
  const idle = frame.time >= frame.endAt
  const cycle = (frame.time + index * 0.37) % (kind === 'petal' ? 5 : 3.5)
  const x = index % 2 ? bounds.right + 0.08 + scatter * 0.23 : bounds.left - 0.08 - scatter * 0.23
  const y = mix(bounds.bottom, bounds.top, seed) + Math.sin(frame.time + index) * 0.035 -
    (kind === 'petal' ? cycle * cycle * 0.025 : 0)
  return {x, y, width: kind === 'petal' ? 0.10 + scatter * 0.08 : 0.06 + scatter * 0.06,
    rotation: seed * 6 + frame.time * (kind === 'petal' ? 0.55 : 0.15),
    alpha: kind === 'petal' ? frame.celebration * (cycle < 2 ? Math.sin(cycle / 2 * Math.PI) * 0.7 : 0) :
      frame.alpha * (cycle < 1.1 && (!idle || index < 10) ? Math.sin(cycle / 1.1 * Math.PI) * 0.75 : 0)}
}
module.exports = {mix, smooth, getCupidFrame, getCupidPose, getArrowPose, getHalfPose, getCupidParticle}
