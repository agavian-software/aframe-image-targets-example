const {SpriteBatch} = require('../shared/sprite-batch')
const {acquireCupidAssets} = require('./assets')
const {DEFAULT_MESSAGE, drawCupidMessage} = require('./text')
const {mix, smooth, getCupidFrame, getCupidPose, getArrowPose, getHalfPose, getCupidParticle} = require('./timeline')

const DEFAULTS = Object.freeze({
  enabled: true, message: DEFAULT_MESSAGE, width: 1, pictureHeight: 1,
  boundsLeft: -0.5, boundsRight: 0.5, boundsBottom: -0.5, boundsTop: 0.5,
  size: 1, cupidSize: 0.52, cupidX: -0.82, cupidY: 0.48, heartSize: 0.85,
  speed: 1, arrowSpeed: 1, breakDuration: 1,
  showMessage: true, showPetals: true, showSparkles: true, showRing: true, showHearts: true,
  particleCount: 40, petalCount: 20, fragmentCount: 20, textColor: '#fff1b8',
  maxTextureSize: 768, assetBase: './animations/cupid-heart-reveal/assets',
})
const bool = (value, fallback) => value == null ? fallback : value === true || value === 1 ||
  (typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase()))
const finite = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback
const normalizeOptions = (input = {}) => {
  const o = {...DEFAULTS, ...input}
  for (const key of ['enabled', 'showMessage', 'showPetals', 'showSparkles', 'showRing', 'showHearts']) o[key] = bool(o[key], DEFAULTS[key])
  for (const [key, min, max] of [['width', 0.001, 100], ['pictureHeight', 0.001, 100],
    ['size', 0.15, 2.5], ['cupidSize', 0.2, 1], ['cupidX', -3, 3], ['cupidY', -3, 3],
    ['heartSize', 0.35, 1.5], ['speed', 0.1, 3], ['arrowSpeed', 0.25, 4], ['breakDuration', 0.25, 4],
    ['boundsLeft', -100, 100], ['boundsRight', -100, 100], ['boundsBottom', -100, 100], ['boundsTop', -100, 100],
    ['particleCount', 0, 72], ['petalCount', 0, 40], ['fragmentCount', 0, 32], ['maxTextureSize', 256, 1024]]) {
    o[key] = finite(o[key], DEFAULTS[key], min, max)
  }
  for (const key of ['particleCount', 'petalCount', 'fragmentCount', 'maxTextureSize']) o[key] = Math.round(o[key])
  o.message = String(o.message ?? '')
  return o
}
const requiredAssets = o => {
  const names = ['flying', 'aiming', 'shooting', 'celebrating', 'arrow', 'motion', 'impact',
    'whole', 'cracked', 'splitting', 'shattering', 'left', 'right', 'fragments', 'impactFlash', 'revealFlash', 'glow']
  if (o.showMessage) names.push('banner')
  if (o.showPetals) names.push('petals')
  if (o.showSparkles) names.push('sparkles')
  if (o.showRing) names.push('ring')
  if (o.showHearts) names.push('outline')
  return names
}

class CupidHeartRevealEffect {
  constructor({THREE, document, parent, onVideoOpacity, ...options}) {
    this.THREE = THREE; this.document = document; this.parent = parent; this.onVideoOpacity = onVideoOpacity
    this.options = normalizeOptions(options)
    this.group = new THREE.Group(); this.group.name = 'CupidHeartRevealEffect'; this.group.visible = false
    parent.add(this.group)
    const matrix = {value: new THREE.Matrix4()}
    this.clip = {matrix, bounds: {value: new THREE.Vector4(1, 1, -1, -1)}}
    this.frameClip = {matrix, bounds: {value: new THREE.Vector4()}}
    this.batches = {}; this.generatedTextures = []; this.textures = {}
    this.elapsed = 0; this.generation = 0; this.ready = false; this.tracked = false; this.disposed = false; this.failed = false
    this.configure(options)
  }
  get time() { return this.elapsed * this.options.speed }
  get videoOpacity() {
    return this.disposed || !this.options.enabled || this.failed ? 1 : this.tracked ? getCupidFrame(this.elapsed, this.options).videoOpacity : 0
  }
  publishVideoOpacity() {
    const value = this.videoOpacity
    if (this.lastOpacity !== value) { this.lastOpacity = value; this.onVideoOpacity?.(value) }
  }
  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve(false)
    const names = requiredAssets(this.options)
    const base = new URL(this.options.assetBase, this.document.baseURI).href
    const key = `${base}|${this.options.maxTextureSize}|${names.join(',')}`
    if (this.assetKey === key && this.loading) return this.loading
    this.clearVisuals(); this.failed = false; this.publishVideoOpacity()
    const previous = this.assets, generation = ++this.generation
    this.assetKey = key
    const assets = acquireCupidAssets(this.THREE, this.document, base, this.options.maxTextureSize, names)
    this.assets = assets; previous?.release()
    this.loading = assets.promise.then(textures => {
      if (this.disposed || generation !== this.generation) return false
      this.textures = textures; this.build(); this.ready = true; this.seek(this.elapsed)
      return true
    }).catch(error => {
      if (this.disposed || generation !== this.generation) return false
      this.clearVisuals(); assets.release(); this.assets = null; this.assetKey = null; this.loading = null
      // A missing effect image must never strand the customer's video behind a gate.
      this.failed = true; this.publishVideoOpacity(); throw error
    })
    return this.loading
  }
  batch(name, texture, count, order, outside = false, additive = false) {
    return this.batches[name] = new SpriteBatch(this.THREE, this.group, texture, count,
      outside ? this.frameClip : this.clip, order, additive)
  }
  build() {
    for (const [name, texture] of Object.entries(this.textures)) {
      const count = name === 'fragments' ? 32 : name === 'petals' ? 40 : name === 'sparkles' ? 72 : name === 'outline' ? 4 : 1
      const outside = ['celebrating', 'banner', 'petals', 'ring', 'sparkles', 'outline'].includes(name)
      const order = name === 'banner' ? 28 : ['impact', 'impactFlash', 'revealFlash'].includes(name) ? 26 :
        ['whole', 'cracked', 'splitting', 'shattering', 'left', 'right'].includes(name) ? 22 : 24
      this.batch(name, texture, count, order, outside, ['impactFlash', 'revealFlash', 'glow'].includes(name))
    }
    if (this.textures.banner) {
      this.messageCanvas = this.document.createElement('canvas')
      drawCupidMessage(this.messageCanvas, this.options.message, this.options.textColor)
      this.messageTexture = new this.THREE.CanvasTexture(this.messageCanvas)
      this.messageTexture.colorSpace = this.THREE.SRGBColorSpace
      this.messageTexture.minFilter = this.THREE.LinearFilter; this.messageTexture.magFilter = this.THREE.LinearFilter
      this.messageTexture.generateMipmaps = false; this.generatedTextures.push(this.messageTexture)
      this.batch('message', this.messageTexture, 1, 29, true)
    }
  }
  configure(input = {}) {
    const previous = this.options, time = this.time
    this.options = normalizeOptions({...previous, ...input})
    this.elapsed = time / this.options.speed
    if (!this.options.enabled || !previous.enabled || ['arrowSpeed', 'breakDuration'].some(key => previous[key] !== this.options[key])) this.elapsed = 0
    if (this.messageCanvas && ['message', 'textColor'].some(key => previous[key] !== this.options[key])) {
      drawCupidMessage(this.messageCanvas, this.options.message, this.options.textColor); this.messageTexture.needsUpdate = true
    }
    this.seek(this.elapsed)
  }
  start() {
    if (this.disposed || this.tracked) return
    this.tracked = true; this.seek(0)
  }
  reset() { this.tracked = false; this.seek(0) }
  update(deltaSeconds) {
    if (this.ready && this.tracked && this.options.enabled && !this.disposed) {
      this.seek(this.elapsed + (Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0))
    }
  }
  seek(elapsed) {
    this.elapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
    this.publishVideoOpacity()
    this.group.visible = this.ready && this.tracked && this.options.enabled && !this.disposed
    if (!this.ready) return
    const o = this.options, t = this.textures, f = getCupidFrame(this.elapsed, o)
    const bounds = {left: o.boundsLeft / o.width, right: o.boundsRight / o.width,
      bottom: o.boundsBottom / o.width, top: o.boundsTop / o.width}
    this.group.scale.setScalar(o.width)
    this.frameClip.bounds.value.set(o.boundsLeft - 0.008, o.boundsBottom - 0.008, o.boundsRight + 0.008, o.boundsTop + 0.008)
    const pose = getCupidPose(f, o, bounds)
    const sprite = (name, props) => {
      if (!this.batches[name]) return
      const image = t[name]?.image
      this.batches[name].set(0, {...props, height: props.height ?? props.width * image.height / image.width})
      this.batches[name].commit(props.alpha > 0.001 ? 1 : 0)
    }
    const celebrating = smooth(f.revealAt - 0.15, f.revealAt, f.time)
    const shotPose = smooth(3, 3.08, f.time)
    const cupid = {...pose, z: 0.03}
    sprite('flying', {...cupid, alpha: pose.alpha * (1 - f.aim)})
    sprite('aiming', {...cupid, alpha: pose.alpha * f.aim * (1 - shotPose)})
    // The shooting pose includes a nocked heart tip. Crop that small right edge
    // after release so the independently animated arrow is the visible projectile.
    sprite('shooting', {...cupid, width: pose.width * 0.88,
      height: pose.width * t.shooting.image.height / t.shooting.image.width,
      x: pose.x - Math.cos(pose.rotation) * pose.width * 0.06,
      y: pose.y - Math.sin(pose.rotation) * pose.width * 0.06,
      uv: [0, 0, 0.88, 1], alpha: pose.alpha * shotPose * (1 - celebrating)})
    sprite('celebrating', {...cupid, alpha: pose.alpha * celebrating})
    const heartWidth = Math.min(1, o.pictureHeight / o.width) * o.heartSize * o.size
    sprite('whole', {width: heartWidth * (1 + Math.sin(f.time * 2) * 0.008), alpha: f.alpha * (1 - f.crack), z: 0.02})
    sprite('cracked', {width: heartWidth, x: f.shake, alpha: f.crack * (1 - smooth(0, 0.15, f.split)), z: 0.022})
    sprite('splitting', {width: heartWidth * mix(1, 1.05, f.split),
      alpha: smooth(0, 0.08, f.split) * (1 - smooth(0.18, 0.35, f.split)), z: 0.023})
    sprite('shattering', {width: heartWidth * 1.22,
      alpha: smooth(0.12, 0.25, f.split) * (1 - smooth(0.35, 0.55, f.split)) * 0.8, z: 0.024})
    for (const side of ['left', 'right']) {
      const half = getHalfPose(side, f.split, heartWidth, t[side].image.width / t[side].image.height, bounds)
      sprite(side, {...half, alpha: half.alpha * smooth(0.18, 0.36, f.split), z: 0.025})
    }
    // Freeze the launch point at shot time. Both it and the exact impact point
    // share this tracked target's local frame, regardless of camera movement.
    const origin = getCupidPose(getCupidFrame(3 / o.speed, o), o, bounds).bow
    const arrowWidth = 0.25 * o.size
    const arrow = getArrowPose(f.shot, origin, arrowWidth)
    const inFlight = f.time >= 3 && f.time < f.hitAt
    sprite('arrow', {...arrow, width: arrowWidth, alpha: inFlight ? 1 : 0, z: 0.04})
    const trail = getArrowPose(f.shot, origin, arrowWidth * 1.65)
    sprite('motion', {...trail, width: arrowWidth * 1.65, alpha: inFlight ? 0.75 : 0, z: 0.035})
    sprite('glow', {x: arrow.x, y: arrow.y, rotation: arrow.rotation, width: arrowWidth * 1.5,
      alpha: inFlight ? 0.45 : 0, z: 0.03})
    sprite('impact', {width: heartWidth * 0.65, alpha: f.impact, z: 0.045})
    sprite('impactFlash', {width: heartWidth * 0.85, alpha: f.impact * 0.85, rotation: f.time, z: 0.05})
    sprite('revealFlash', {width: heartWidth * mix(0.4, 1.8, f.split),
      alpha: smooth(0.05, 0.2, f.split) * (1 - smooth(0.4, 0.8, f.split)) * 0.65, z: 0.045})
    const fragmentCount = f.split > 0 && f.split < 1 ? o.fragmentCount : 0
    for (let i = 0; i < fragmentCount; i++) {
      const p = getCupidParticle(i, f, bounds, 'fragment')
      this.batches.fragments.set(i, {...p, height: p.width * t.fragments.image.height / t.fragments.image.width, z: 0.03})
    }
    this.batches.fragments.commit(fragmentCount)
    const celebrationY = (bounds.bottom + bounds.top) / 2
    sprite('ring', {width: Math.max(bounds.right - bounds.left, (bounds.top - bounds.bottom) * 2.1) * 1.15,
      y: celebrationY, alpha: f.celebration * (0.5 + Math.sin(f.time * 2) * 0.15), rotation: Math.sin(f.time) * 0.03, z: 0.01})
    if (this.batches.outline) {
      for (let i = 0; i < 4; i++) {
        const width = 0.16 + i % 2 * 0.04
        this.batches.outline.set(i, {x: i % 2 ? bounds.right + 0.18 : bounds.left - 0.18,
          y: mix(bounds.bottom, bounds.top, (i + 0.5) / 4) + Math.sin(f.time + i) * 0.04,
          width, height: width * t.outline.image.height / t.outline.image.width,
          alpha: f.celebration * 0.8, rotation: Math.sin(f.time + i) * 0.04, z: 0.01})
      }
      this.batches.outline.commit(f.celebration > 0.001 ? 4 : 0)
    }
    for (const [name, kind, count] of [['petals', 'petal', f.celebration > 0 ? (f.time >= f.endAt ? Math.min(4, o.petalCount) : o.petalCount) : 0],
      ['sparkles', 'sparkle', f.time >= f.endAt ? Math.min(10, o.particleCount) : o.particleCount]]) {
      if (!this.batches[name]) continue
      for (let i = 0; i < count; i++) {
        const p = getCupidParticle(i, f, bounds, kind)
        this.batches[name].set(i, {...p, height: p.width * t[name].image.height / t[name].image.width, z: 0.02})
      }
      this.batches[name].commit(count)
    }
    const bannerWidth = Math.min(1.25, bounds.right - bounds.left) * o.size
    const bannerHeight = t.banner ? bannerWidth * t.banner.image.height / t.banner.image.width : 0
    const bannerY = bounds.bottom - bannerHeight / 2 - 0.065 + Math.sin(f.time * 1.4) * 0.006
    sprite('banner', {width: bannerWidth, y: bannerY, alpha: f.celebration, z: 0.03})
    if (this.batches.message) {
      sprite('message', {width: bannerWidth * 0.61, height: bannerWidth * 0.61 / 4, y: bannerY - bannerHeight * 0.02,
        alpha: f.celebration, z: 0.04})
    }
    this.parent.updateWorldMatrix(true, false)
    this.clip.matrix.value.copy(this.parent.matrixWorld).invert()
  }
  clearVisuals() {
    this.ready = false; this.group.visible = false
    Object.values(this.batches).forEach(batch => batch.dispose())
    this.generatedTextures.forEach(texture => texture.dispose())
    this.batches = {}; this.generatedTextures = []; this.textures = {}; this.messageCanvas = null; this.messageTexture = null
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true; ++this.generation; this.publishVideoOpacity()
    this.clearVisuals(); this.assets?.release(); this.parent.remove(this.group)
  }
}
module.exports = {CupidHeartRevealEffect, DEFAULTS, normalizeOptions, requiredAssets}
