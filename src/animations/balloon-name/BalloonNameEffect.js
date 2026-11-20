const {acquireBalloonAssets} = require('./assets')
const {SpriteBatch} = require('./sprite-batch')
const {drawLetterAtlas, drawMessage} = require('./text')
const {mix, getNameLayout, getBalloonFrame, getLetterFrame, getBalloonParticle} = require('./timeline')

const DEFAULTS = Object.freeze({
  enabled: true, name: '', message: 'HAPPY BIRTHDAY', width: 1, pictureHeight: 1,
  duration: 6, size: 1, offsetX: 0, offsetY: 0.025,
  showBouquets: true, showLetters: true, showBanner: true, showCenterBouquet: false, showCelebration: true,
  letterColor: '#fff8eb', outlineColor: '#783a32', messageColor: '#783a32',
  sparkleColor: '#ffe099', pinkTint: '#ffffff', goldTint: '#ffffff',
  particleCount: 48, maxTextureSize: 768, assetBase: './animations/balloon-name/assets',
})
const number = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value))) : fallback
const boolean = (value, fallback) => value == null ? fallback
  : value === true || value === 1 || (typeof value === 'string' && ['true', '1'].includes(value.trim().toLowerCase()))

const normalizeOptions = (input = {}) => {
  const options = {...DEFAULTS, ...input}
  for (const name of ['enabled', 'showBouquets', 'showLetters', 'showBanner', 'showCenterBouquet', 'showCelebration']) {
    options[name] = boolean(input[name], DEFAULTS[name])
  }
  for (const [key, min, max] of [['width', 0.001, 100], ['pictureHeight', 0.001, 100],
    ['duration', 0.5, 60], ['size', 0.15, 3], ['offsetX', -3, 3], ['offsetY', 0, 3],
    ['particleCount', 0, 80], ['maxTextureSize', 256, 1024]]) {
    options[key] = number(options[key], DEFAULTS[key], min, max)
  }
  options.particleCount = Math.round(options.particleCount)
  options.maxTextureSize = Math.round(options.maxTextureSize)
  options.name = String(options.name ?? '')
  options.message = String(options.message ?? '')
  return options
}

const requiredAssets = (options) => {
  const keys = []
  if (options.showBouquets) keys.push('left', 'right')
  if (options.showCenterBouquet) keys.push('center')
  if (options.showLetters && getNameLayout(options.name).some(({letter}) => letter !== ' ')) keys.push('pink', 'gold')
  if (options.showBanner) keys.push('banner')
  if (options.showCelebration) keys.push('trail', 'burst')
  return keys
}

class BalloonNameEffect {
  constructor({THREE, document, parent, ...options}) {
    this.THREE = THREE
    this.document = document
    this.parent = parent
    this.options = normalizeOptions(options)
    this.group = new THREE.Group()
    this.group.name = 'BalloonNameEffect'
    this.group.visible = false
    parent.add(this.group)
    this.clip = {matrix: {value: new THREE.Matrix4()}, bounds: {value: new THREE.Vector4()}}
    this.palette = {pink: new THREE.Color(), gold: new THREE.Color(), sparkle: new THREE.Color()}
    this.batches = {}
    this.canvases = {}
    this.canvasTextures = []
    this.elapsed = 0
    this.generation = 0
    this.ready = false
    this.tracked = false
    this.disposed = false
    this.configure(options)
  }

  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve(false)
    const names = requiredAssets(this.options)
    const base = new URL(this.options.assetBase, this.document.baseURI).href
    const key = `${base}|${this.options.maxTextureSize}|${names.join(',')}`
    if (this.assetKey === key && this.loading) return this.loading
    this.clearVisuals()
    const previousAssets = this.assets
    this.assetKey = key
    const generation = ++this.generation
    const assets = acquireBalloonAssets(this.THREE, this.document, base, this.options.maxTextureSize, names)
    this.assets = assets
    // Acquire retained files before dropping the old lease, so visibility changes
    // request only newly enabled artwork rather than reloading the whole effect.
    previousAssets?.release()
    this.loading = assets.promise.then((textures) => {
      if (this.disposed || generation !== this.generation) return false
      this.textures = textures
      this.build()
      this.ready = true
      this.seek(0)
      return true
    }).catch((error) => {
      if (generation !== this.generation || this.disposed) return false
      this.clearVisuals()
      assets.release()
      this.assets = null
      this.assetKey = null
      this.loading = null
      throw error
    })
    return this.loading
  }

  batch(name, texture, count, order, additive = false) {
    const batch = new SpriteBatch(this.THREE, this.group, texture, count, this.clip, order, additive)
    this.batches[name] = batch
    return batch
  }

  canvasTexture(name) {
    const canvas = this.document.createElement('canvas')
    const texture = new this.THREE.CanvasTexture(canvas)
    texture.colorSpace = this.THREE.SRGBColorSpace
    texture.minFilter = this.THREE.LinearFilter
    texture.magFilter = this.THREE.LinearFilter
    texture.generateMipmaps = false
    this.canvases[name] = canvas
    this.canvasTextures.push(texture)
    return texture
  }

  build() {
    for (const name of ['left', 'right', 'center', 'banner', 'trail', 'burst']) {
      if (this.textures[name]) this.batch(name, this.textures[name], 1,
        name === 'banner' ? 24 : ['trail', 'burst'].includes(name) ? 18 : 20)
    }
    if (this.textures.pink) {
      this.batch('pink', this.textures.pink, 32, 25)
      this.batch('gold', this.textures.gold, 32, 25)
      this.letterTexture = this.canvasTexture('letters')
      this.batch('letters', this.letterTexture, 32, 26)
    }
    if (this.textures.banner) {
      this.messageTexture = this.canvasTexture('message')
      this.batch('message', this.messageTexture, 1, 27)
    }
    if (this.options.showCelebration) {
      const texture = this.canvasTexture('particle')
      const canvas = this.canvases.particle
      canvas.width = 64
      canvas.height = 64
      const context = canvas.getContext('2d')
      const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32)
      glow.addColorStop(0, '#ffffff')
      glow.addColorStop(0.35, '#ffffffbb')
      glow.addColorStop(1, '#ffffff00')
      context.fillStyle = glow
      context.fillRect(0, 0, 64, 64)
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.moveTo(32, 2); context.lineTo(37, 27); context.lineTo(62, 32)
      context.lineTo(37, 37); context.lineTo(32, 62); context.lineTo(27, 37)
      context.lineTo(2, 32); context.lineTo(27, 27); context.closePath(); context.fill()
      texture.needsUpdate = true
      this.batch('particles', texture, 80, 23)
    }
    this.updateText()
  }

  updateText() {
    this.layout = getNameLayout(this.options.name)
    if (this.canvases.letters) {
      drawLetterAtlas(this.canvases.letters, this.layout, this.options.letterColor, this.options.outlineColor)
      this.letterTexture.needsUpdate = true
    }
    if (this.canvases.message) {
      drawMessage(this.canvases.message, this.options.message, this.options.messageColor)
      this.messageTexture.needsUpdate = true
    }
  }

  configure(input = {}) {
    const previous = this.options
    this.options = normalizeOptions({...previous, ...input})
    this.palette.pink.set(this.options.pinkTint)
    this.palette.gold.set(this.options.goldTint)
    this.palette.sparkle.set(this.options.sparkleColor)
    if (previous.name !== this.options.name || previous.message !== this.options.message ||
      previous.letterColor !== this.options.letterColor || previous.outlineColor !== this.options.outlineColor ||
      previous.messageColor !== this.options.messageColor) this.updateText()
    if (!this.options.enabled || !previous.enabled) this.elapsed = 0
    this.seek(this.elapsed)
  }

  start() {
    if (this.disposed || this.tracked) return
    this.tracked = true
    this.seek(0)
  }

  reset() {
    this.tracked = false
    this.seek(0)
  }

  update(deltaSeconds) {
    if (this.ready && this.tracked && this.options.enabled && !this.disposed) {
      this.seek(this.elapsed + Math.min(Math.max(deltaSeconds || 0, 0), 0.05))
    }
  }

  setSprite(batch, index, {x = 0, y = 0, z = 0, width, height, rotation = 0, alpha = 1,
    uv = [0, 0, 1, 1], color = {r: 1, g: 1, b: 1}}) {
    const a = batch.attributes
    a.aCenter.setXYZ(index, x, y, z)
    a.aSize.setXY(index, width, height)
    a.aRotation.setX(index, rotation)
    a.aAlpha.setX(index, alpha)
    a.aUv.setXYZW(index, ...uv)
    a.aColor.setXYZ(index, color.r, color.g, color.b)
  }

  seek(elapsed) {
    this.elapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
    this.group.visible = this.ready && this.tracked && this.options.enabled && !this.disposed
    if (!this.ready) return
    const o = this.options
    const frame = getBalloonFrame(this.elapsed, o.duration)
    const scale = o.width * o.size
    this.group.scale.setScalar(scale)
    this.group.position.set(o.width * o.offsetX, o.width * o.offsetY, 0)
    this.clip.bounds.value.set(-o.width / 2 - 0.008, -o.pictureHeight - 0.008, o.width / 2 + 0.008, 0.008)
    const imageHeight = o.pictureHeight / scale
    const halfWidth = (0.5 + Math.abs(o.offsetX)) / o.size
    const sprite = (name, props) => {
      const batch = this.batches[name]
      if (!batch) return
      const texture = this.textures[name]
      this.setSprite(batch, 0, {...props, height: props.height ?? props.width * texture.image.height / texture.image.width})
      batch.commit(props.alpha > 0.001 ? 1 : 0)
    }
    for (const [name, side, progress, width] of [['left', -1, frame.left, 0.28], ['right', 1, frame.right, 0.32]]) {
      sprite(name, {
        width, x: side * mix(halfWidth * 0.45, halfWidth + width / 2 + 0.035, progress),
        y: mix(-imageHeight * 0.55, -imageHeight * 0.42 + 0.15, progress) + frame.bob,
        alpha: progress, rotation: side * (1 - progress) * 0.1 + Math.sin(frame.time * 1.2 + side) * 0.022,
      })
    }
    const bannerHeight = this.textures.banner ? 0.9 * this.textures.banner.image.height / this.textures.banner.image.width : 0
    const bannerY = 0.045 + bannerHeight / 2 + frame.bob
    sprite('banner', {width: 0.9 * mix(0.82, 1, frame.banner), y: bannerY,
      alpha: frame.banner, z: 0.018})
    if (this.batches.message) {
      this.setSprite(this.batches.message, 0, {width: 0.61 * mix(0.82, 1, frame.banner),
        height: 0.1525 * mix(0.82, 1, frame.banner), y: bannerY - bannerHeight * 0.18,
        alpha: frame.banner, z: 0.022})
      this.batches.message.commit(frame.banner > 0.001 ? 1 : 0)
    }
    const letterCounts = {pink: 0, gold: 0, letters: 0}
    let rowTop = bannerHeight + 0.18
    const layout = this.layout || getNameLayout(o.name)
    const rowHeight = Math.max(0, ...layout.map(item => item.width * Math.max(
      this.textures.pink?.image.height / this.textures.pink?.image.width || 0,
      this.textures.gold?.image.height / this.textures.gold?.image.width || 0)))
    const rowHead = bannerHeight + 0.11 + rowHeight * 0.73
    layout.forEach((item, index) => {
      if (!this.batches.pink || item.letter === ' ') return
      const name = index % 2 === 0 ? 'pink' : 'gold'
      const height = item.width * this.textures[name].image.height / this.textures[name].image.width
      const letter = getLetterFrame(index, layout.length, frame.time)
      const y = mix(-imageHeight * 0.45, rowHead - height * 0.23, letter.rise) + letter.bob
      const props = {width: item.width, height, x: item.x, y, z: 0.018,
        alpha: letter.opacity, rotation: letter.rotation, color: this.palette[name]}
      this.setSprite(this.batches[name], letterCounts[name]++, props)
      // The upper body occupies the top half of these long-ribbon sprites.
      const offset = height * 0.23
      this.setSprite(this.batches.letters, letterCounts.letters++, {
        width: item.width * 0.68, height: item.width * 0.68,
        x: item.x - Math.sin(letter.rotation) * offset, y: y + Math.cos(letter.rotation) * offset,
        z: 0.023, alpha: letter.opacity, rotation: letter.rotation,
        uv: [index % 8 / 8, 1 - (Math.floor(index / 8) + 1) / 4, 1 / 8, 1 / 4],
      })
      rowTop = Math.max(rowTop, rowHead + height * 0.27)
    })
    for (const [name, count] of Object.entries(letterCounts)) this.batches[name]?.commit(frame.time > 2 ? count : 0)
    sprite('center', {width: 0.22, y: rowTop + 0.23 + frame.bob, alpha: frame.banner})
    sprite('trail', {width: 0.92, y: 0.73 + frame.bob, alpha: frame.celebration * 0.65,
      rotation: Math.sin(frame.time) * 0.05, z: -0.012})
    sprite('burst', {width: mix(0.65, 1.2, Math.min(1, Math.max(0, frame.time - 5))), y: 0.75,
      alpha: frame.celebration * 0.38, z: -0.01})
    if (this.batches.particles) {
      let active = false
      for (let i = 0; i < o.particleCount; i++) {
        const p = getBalloonParticle(i, frame.time)
        active ||= p.opacity > 0.001
        this.setSprite(this.batches.particles, i, {x: p.x, y: p.y, width: p.size, height: p.size,
          rotation: p.rotation, alpha: p.opacity, color: this.palette.sparkle})
      }
      this.batches.particles.commit(active ? o.particleCount : 0)
    }
    this.parent.updateWorldMatrix(true, false)
    this.clip.matrix.value.copy(this.parent.matrixWorld).invert()
  }

  clearVisuals() {
    this.ready = false
    this.group.visible = false
    Object.values(this.batches).forEach(batch => batch.dispose())
    this.canvasTextures.forEach(texture => texture.dispose())
    this.batches = {}
    this.canvases = {}
    this.canvasTextures = []
    this.letterTexture = null
    this.messageTexture = null
    this.textures = {}
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    ++this.generation
    this.clearVisuals()
    this.assets?.release()
    this.parent.remove(this.group)
  }
}

module.exports = {BalloonNameEffect, DEFAULTS, normalizeOptions, requiredAssets}
