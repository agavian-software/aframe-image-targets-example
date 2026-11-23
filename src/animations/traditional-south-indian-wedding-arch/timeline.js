const {getFlowerArchFrame, smooth, mix} = require('../magical-wedding-flower-arch/timeline')
// Fractions of the supplied 1086 x 1448 canvas, inset from hanging bells and
// pillar/base flowers. Fit this transparent opening, rather than the outer art.
const TEMPLE_OPENING = Object.freeze({left: 0.23, right: 0.77, top: 0.33, bottom: 0.82})
const getTempleArchFrame = (elapsed, cutAt = null, duration = 6.5, speed = 1) => {
  const f = getFlowerArchFrame(elapsed, cutAt, duration, speed, 0)
  return {...f, videoOpacity: f.active ? smooth(1.35, 2.65, f.sequence) : 0,
    snip: f.active ? smooth(1.35, 1.38, f.sequence) * (1 - smooth(1.43, 1.65, f.sequence)) : 0}
}
const getTempleArchLayout = (options, aspects = {}) => {
  const ratio = options.pictureHeight / options.width, aspect = aspects.fullArch ?? 4 / 3
  const opening = TEMPLE_OPENING, margin = options.outerMargin
  const archWidth = Math.max((1 + margin * 2) / (opening.right - opening.left),
    (ratio + margin * 2) / ((opening.bottom - opening.top) * aspect)) * options.archScale
  const archHeight = archWidth * aspect
  const archX = (0.5 - (opening.left + opening.right) / 2) * archWidth
  const archY = ((opening.top + opening.bottom) / 2 - 0.5) * archHeight
  const bannerHeight = options.bannerSize * (aspects.banner ?? 1 / 3)
  const ribbonHeight = options.ribbonSize * (aspects.ribbon ?? 1 / 3)
  const maxRibbonY = Math.max(0, ratio / 2 - ribbonHeight / 2 - 0.02)
  return {ratio, archWidth, archHeight, archX, archY, baseY: archY - archHeight / 2,
    bannerHeight, bannerY: -ratio / 2 - 0.10 - bannerHeight / 2,
    ribbonWidth: options.ribbonSize, ribbonHeight, ribbonX: options.ribbonX,
    ribbonY: Math.max(-maxRibbonY, Math.min(maxRibbonY, options.ribbonY))}
}
module.exports = {TEMPLE_OPENING, getTempleArchFrame, getTempleArchLayout, smooth, mix}
