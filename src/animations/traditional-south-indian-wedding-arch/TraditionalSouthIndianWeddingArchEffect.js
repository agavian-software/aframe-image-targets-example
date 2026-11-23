const {MagicalWeddingFlowerArchEffect, DEFAULTS: CEREMONY_DEFAULTS, normalizeOptions: normalizeCeremonyOptions,
  requiredAssets: ceremonyAssets} = require('../magical-wedding-flower-arch/MagicalWeddingFlowerArchEffect')
const {getScissorPose, getCutRibbonPose, getFlowerArchParticle} = require('../magical-wedding-flower-arch/timeline')
const {acquireTempleArchAssets} = require('./assets')
const {getTempleArchFrame, getTempleArchLayout} = require('./timeline')

const DEFAULTS = Object.freeze({...CEREMONY_DEFAULTS,
  assetBase: './animations/traditional-south-indian-wedding-arch/assets',
  outerMargin: 0.08, ribbonX: 0, ribbonY: 0, showToran: true, showLamps: true, replayOnReacquire: true,
})
const mapTempleOptions = (input = {}) => {
  const result = {...input}
  for (const [alias, key] of [['weddingDate', 'startDate'], ['anniversaryDate', 'endDate'], ['animationSpeed', 'speed']]) {
    if (input[alias] !== undefined && input[key] === undefined) result[key] = input[alias]
  }
  if (input.ribbonScale !== undefined && input.ribbonSize === undefined) result.ribbonSize = Number(input.ribbonScale) * CEREMONY_DEFAULTS.ribbonSize
  return result
}
const normalizeOptions = (input = {}) => {
  const o = normalizeCeremonyOptions({...DEFAULTS, ...mapTempleOptions(input)})
  const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback
  o.outerMargin = number(o.outerMargin, 0.08, 0.02, 0.4)
  o.ribbonX = number(o.ribbonX, 0, -0.3, 0.3); o.ribbonY = number(o.ribbonY, 0, -3, 3)
  for (const key of ['showToran', 'showLamps', 'replayOnReacquire']) o[key] = o[key] === true || o[key] === 1 ||
    (typeof o[key] === 'string' && ['true', '1'].includes(o[key].trim().toLowerCase()))
  o.closedVideoOpacity = 0 // This design stays hidden until the ribbon is actually cut.
  return o
}
const requiredAssets = options => {
  const names = ceremonyAssets(options)
  if (options.showToran) names.push('toran')
  if (options.showLamps) names.push('lamps')
  return names
}

class TraditionalSouthIndianWeddingArchEffect extends MagicalWeddingFlowerArchEffect {
  constructor(options) { super(options); this.group.name = 'TraditionalSouthIndianWeddingArchEffect' }
  normalizeOptions(input) { return normalizeOptions(input) }
  requiredAssets(options) { return requiredAssets(options) }
  acquireAssets(base, names) { return acquireTempleArchAssets(this.THREE, this.document, base, this.options.maxTextureSize, names) }
  getFrame() { return getTempleArchFrame(this.elapsed, this.cutAt, this.options.duration, this.options.speed) }
  getLayout(aspects) { return getTempleArchLayout(this.options, aspects) }
  getHintText() { return 'Tap Ribbon to Open' }
  configure(input = {}) { return super.configure(mapTempleOptions(input)) }
  getScissorPose(frame, layout) {
    const pose = getScissorPose(frame, this.options)
    const snip = Math.sin((frame.sequence - 1.35) * 110) * frame.snip
    return {...pose, x: pose.x + layout.ribbonX + snip * 0.006, y: pose.y + layout.ribbonY,
      rotation: pose.rotation + snip * 0.025}
  }
  getCutRibbonPose(side, frame, layout) {
    const pose = getCutRibbonPose(side, frame, layout)
    return {...pose, x: pose.x + layout.ribbonX, y: pose.y + layout.ribbonY}
  }
  getParticle(index, frame, layout, kind) {
    const p = getFlowerArchParticle(index, frame, layout, kind)
    return {...p, x: p.x * layout.archWidth * 0.65}
  }
  buildDecorations() {
    if (this.textures.toran) this.batch('toran', this.textures.toran, 1, 21)
    if (this.textures.lamps) this.batch('lamps', this.textures.lamps, 1, 21)
    if (this.options.showBloom || this.options.showLamps) {
      const canvas = this.document.createElement('canvas'); canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d'), glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      glow.addColorStop(0, '#ffffff'); glow.addColorStop(0.2, '#fff1aacc'); glow.addColorStop(1, '#ffd77800')
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64)
      const texture = this.canvasTexture(canvas)
      if (this.options.showBloom) this.batch('snipFlash', texture, 1, 35, false, this.group, true)
      if (this.options.showLamps) this.batch('lampGlow', texture, 2, 22, true, this.group, true)
    }
  }
  renderArch(sprite, frame, layout) {
    const o = this.options, width = layout.archWidth, height = layout.archHeight
    const alpha = frame.growth > 0 ? (o.useFullArch ? 1 - frame.complete : 1) : 0
    // All temple pieces share one canvas. Each UV band is drawn exactly once;
    // this retains registration and avoids doubling toran, bells or lamp details.
    const bottom = o.showLamps ? 0.282 : 0, top = o.showToran ? 0.66 : 1
    const visible = Math.max(0, Math.min(frame.growth, top) - bottom)
    for (const name of ['leftArch', 'rightArch']) sprite(name, {x: layout.archX, y: layout.baseY + height * (bottom + visible / 2),
      width, height: height * visible, uv: [0, bottom, 1, visible], alpha: visible > 0 ? alpha : 0, z: 0.01})
    if (o.showLamps) {
      const part = Math.min(frame.growth, 0.282)
      sprite('lamps', {x: layout.archX, y: layout.baseY + height * part / 2,
        width, height: height * part, uv: [0, 0, 1, part], alpha: part > 0 ? alpha : 0, z: 0.011})
    }
    if (o.showToran) {
      const part = Math.max(0, frame.growth - 0.66)
      sprite('toran', {x: layout.archX, y: layout.baseY + height * (0.66 + part / 2),
        width, height: height * part, uv: [0, 0.66, 1, part], alpha: part > 0 ? alpha : 0, z: 0.011})
    }
    sprite('fullArch', {x: layout.archX, y: layout.archY, width, alpha: frame.complete, z: 0.012})
    sprite('snipFlash', {x: layout.ribbonX, y: layout.ribbonY, width: 0.22, height: 0.22, alpha: frame.snip, z: 0.07})
    if (this.batches.lampGlow) {
      const width = layout.archWidth * 0.15
      for (let i = 0; i < 2; i++) this.batches.lampGlow.set(i, {
        x: layout.archX + (i ? 1 : -1) * layout.archWidth * 0.38,
        y: layout.baseY + layout.archHeight * 0.10, width, height: width,
        alpha: frame.celebration * (0.22 + Math.sin(frame.time * 2.4 + i) * 0.06), color: this.sparkleColor, z: 0.018})
      this.batches.lampGlow.commit(frame.celebration > 0.001 ? 2 : 0)
    }
  }
  reset() {
    if (!this.options.replayOnReacquire && this.cutAt !== null) {
      this.tracked = false; this.interaction?.reset(); this.seek(this.elapsed)
    } else super.reset()
  }
  start() {
    if (this.disposed || this.tracked) return
    if (!this.options.replayOnReacquire && this.cutAt !== null) { this.tracked = true; this.seek(this.elapsed) }
    else super.start()
  }
}
module.exports = {TraditionalSouthIndianWeddingArchEffect, DEFAULTS, normalizeOptions, requiredAssets, mapTempleOptions}
