const clamp = value => Math.max(0, Math.min(1, value))
const mix = (a, b, p) => a + (b - a) * p
const smooth = (start, end, time) => {
  const p = clamp((time - start) / (end - start))
  return p * p * (3 - 2 * p)
}
const getFlowerArchFrame = (elapsed, cutAt = null, duration = 6.5, speed = 1, closedOpacity = 0) => {
  const time = Math.max(0, elapsed) * 6.5 / duration * speed
  const active = cutAt !== null, sequence = active ? Math.max(0, time - cutAt) : 0
  const cut = active && sequence >= 1.35
  const drift = cut ? smooth(1.35, 2.65, sequence) : 0
  const growth = active ? smooth(1.35, 4.15, sequence) : 0
  return {time, sequence, active, cut, drift, growth,
    alpha: smooth(0, 0.2, time),
    highlight: active ? smooth(0, 0.08, sequence) * (1 - smooth(0.15, 0.4, sequence)) : 0,
    scissorEntrance: active ? smooth(0.15, 1.15, sequence) : 0,
    scissorAlpha: active ? smooth(0.15, 0.35, sequence) * (1 - smooth(1.65, 2.1, sequence)) : 0,
    bladeAngle: active ? 0.10 * smooth(0.55, 0.95, sequence) * (1 - smooth(1.15, 1.35, sequence)) : 0,
    cutAlpha: cut ? 1 - smooth(2.1, 2.65, sequence) : 0,
    bloom: active ? smooth(1.35, 1.55, sequence) * (1 - smooth(3.55, 4.25, sequence)) : 0,
    complete: active ? smooth(3.8, 4.25, sequence) : 0,
    videoOpacity: active ? mix(closedOpacity, 1, smooth(3.2, 4.25, sequence)) : closedOpacity,
    message: active ? smooth(4.25, 5.5, sequence) : 0,
    celebration: active ? smooth(4.25, 5.25, sequence) : 0,
  }
}
const getFlowerArchLayout = (options, aspects = {}) => {
  const ratio = options.pictureHeight / options.width
  const archAspect = aspects.fullArch ?? 1402 / 1122
  // Uniform scale fits the upright opening around both landscape and portrait
  // targets. The shader also protects the entire picture/video rectangle.
  const archWidth = Math.max(1.48, (ratio + 0.20) / (archAspect * 0.73)) * options.archScale
  const archHeight = archWidth * archAspect
  const baseY = -ratio / 2 - 0.08
  const bannerHeight = options.bannerSize * (aspects.banner ?? 1 / 3)
  return {ratio, archWidth, archHeight, baseY, archY: baseY + archHeight / 2,
    bannerHeight, bannerY: baseY - 0.07 - bannerHeight / 2,
    ribbonWidth: options.ribbonSize,
    ribbonHeight: options.ribbonSize * (aspects.ribbon ?? 1 / 3)}
}
const getScissorPose = (frame, options) => {
  const width = options.scissorSize, angle = Math.PI * 0.75
  // The middle of the two blades, rather than the sprite center, meets the bow.
  const blade = {x: width * 0.30, y: width * 0.29}
  const endX = -(Math.cos(angle) * blade.x - Math.sin(angle) * blade.y)
  const endY = -(Math.sin(angle) * blade.x + Math.cos(angle) * blade.y)
  return {x: mix(1.25, endX, frame.scissorEntrance) + frame.drift * 0.3,
    y: mix(0.22, endY, frame.scissorEntrance) + Math.sin(frame.scissorEntrance * Math.PI) * 0.13 + frame.drift * 0.1,
    rotation: mix(-0.3, angle, frame.scissorEntrance) + frame.drift * 0.18, width, alpha: frame.scissorAlpha}
}
const getCutRibbonPose = (side, frame, layout) => {
  const sign = side === 'left' ? -1 : 1
  return {x: sign * mix(layout.ribbonWidth * 0.26, 1.1, frame.drift), y: -frame.drift * 0.5,
    width: layout.ribbonWidth * mix(0.56, 0.48, frame.drift),
    rotation: sign * frame.drift * 0.45, alpha: frame.cutAlpha}
}
const getFlowerArchParticle = (index, frame, layout, kind) => {
  const seed = ((index * 73 + 17) % 101) / 101, scatter = ((index * 37 + 11) % 89) / 89
  const idle = frame.sequence >= 6.5
  const age = (frame.sequence + index * 0.43) % (kind === 'petal' ? 6 : 3.8)
  const side = index % 2 ? 1 : -1
  const x = side * (0.58 + scatter * 0.23) + Math.sin(frame.time + index) * 0.025
  const y = mix(-layout.ratio / 2, layout.archY + layout.archHeight * 0.35, seed) -
    (kind === 'petal' ? age * age * 0.035 : 0)
  const alpha = kind === 'petal' ? frame.celebration * (age < 2 ? Math.sin(age / 2 * Math.PI) * 0.7 : 0) :
    Math.max(frame.bloom, frame.celebration * 0.7) * (age < 1.1 ? Math.sin(age / 1.1 * Math.PI) : 0)
  const width = kind === 'petal' ? 0.025 + scatter * 0.025 : 0.012 + scatter * 0.012
  return {x, y, width: width * (kind === 'petal' ? 0.4 + 0.6 * Math.abs(Math.cos(frame.time * 4 + index)) : 1),
    height: width, rotation: seed * 6 + frame.time * (kind === 'petal' ? 0.7 : 0.2),
    alpha: frame.active && (!idle || index < (kind === 'petal' ? 4 : 10)) ? alpha : 0}
}
module.exports = {mix, smooth, getFlowerArchFrame, getFlowerArchLayout, getScissorPose, getCutRibbonPose, getFlowerArchParticle}
