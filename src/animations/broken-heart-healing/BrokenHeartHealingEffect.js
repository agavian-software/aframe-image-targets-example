const {SpriteBatch} = require('../shared/sprite-batch')
const {DEFAULT_MESSAGE, drawHealingMessage} = require('./text')
const {acquireAssets, getUv, HEART_REGIONS, PETAL_REGIONS, STAR_REGION, createThreadTexture} = require('./assets')
const {DEFAULT_TIMINGS, DEFAULT_PATH, clamp, mix, smooth, getHealingFrame, getStitchPoint, getDoorX} = require('./timeline')

const DEFAULTS = Object.freeze({
  enabled: true,
  message: DEFAULT_MESSAGE,
  textColor: '#63231b',
  width: 1,
  pictureHeight: 1,
  boundsLeft: -0.5,
  boundsRight: 0.5,
  boundsBottom: -0.5,
  boundsTop: 0.5,
  heartX: 0,
  heartY: 0,
  heartScale: 0.94,
  needleStartX: 0.87,
  needleStartY: 0.72,
  needleScale: 0.27,
  bannerX: 0,
  bannerY: 0,
  bannerScale: 1,
  petalCount: 9,
  sparkleCount: 10,
  speed: 1,
  stitchingPath: JSON.stringify(DEFAULT_PATH),
  ...DEFAULT_TIMINGS,
})

const number = (value, fallback, min, max) => {
  if (value == null || (typeof value !== 'number' && (typeof value !== 'string' || !value.trim()))) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

const normalizePath = value => {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return DEFAULT_PATH }
  }
  return Array.isArray(value) && value.length >= 2 && value.length <= 24 &&
    value.every(point => Array.isArray(point) && point.length === 2 &&
      point.every(coordinate => Number.isFinite(coordinate) && Math.abs(coordinate) <= 2))
    ? value.map(point => point.slice()) : DEFAULT_PATH
}

const normalizeOptions = (options = {}) => {
  const result = {...DEFAULTS, ...options.positions, ...options.timings, ...options}
  result.enabled = [true, 'true', 1, '1'].includes(typeof result.enabled === 'string'
    ? result.enabled.trim().toLowerCase() : result.enabled)
  result.message = String(result.message ?? DEFAULT_MESSAGE)
  result.width = number(result.width, 1, 0.001, Infinity)
  result.pictureHeight = number(result.pictureHeight, 1, 0.001, Infinity)
  for (const name of ['heartX', 'heartY', 'needleStartX', 'needleStartY', 'bannerX', 'bannerY']) {
    result[name] = number(result[name], DEFAULTS[name], -3, 3)
  }
  for (const name of ['heartScale', 'needleScale', 'bannerScale', 'speed']) {
    result[name] = number(result[name], DEFAULTS[name], 0.05, 4)
  }
  for (const name of ['boundsLeft', 'boundsRight', 'boundsBottom', 'boundsTop']) {
    const halfSize = (['boundsLeft', 'boundsRight'].includes(name) ? result.width : result.pictureHeight) / 2
    const edge = name === 'boundsLeft' || name === 'boundsBottom' ? -halfSize : halfSize
    result[name] = number(options[name], edge, -Infinity, Infinity)
  }
  for (const name of Object.keys(DEFAULT_TIMINGS)) {
    result[name] = number(result[name], DEFAULT_TIMINGS[name], 0.05, 30)
  }
  result.petalCount = Math.round(number(result.petalCount, DEFAULTS.petalCount, 0, 16))
  result.sparkleCount = Math.round(number(result.sparkleCount, DEFAULTS.sparkleCount, 0, 16))
  result.stitchingPath = normalizePath(result.stitchingPath)
  return result
}

const createSprite = (THREE, group, map, order, region) => {
  const geometry = new THREE.PlaneGeometry(1, 1)
  if (region) {
    const [u, v, width, height] = getUv(region)
    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * width, v + uv.getY(i) * height)
  }
  const material = new THREE.MeshBasicMaterial({
    map, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    toneMapped: false, alphaTest: 0.008,
  })
  const sprite = new THREE.Mesh(geometry, material)
  sprite.renderOrder = order
  sprite.visible = false
  group.add(sprite)
  return sprite
}

const pose = (sprite, alpha, x, y, width, height = width, turn = 0, rotation = 0) => {
  sprite.visible = alpha > 0.008
  if (!sprite.visible) return
  sprite.material.opacity = alpha
  sprite.position.set(x, y, 0)
  sprite.scale.set(width, height, 1)
  sprite.rotation.set(0, turn, rotation)
}

const THREAD_SUBDIVISIONS = 4

class BrokenHeartHealingEffect {
  constructor({THREE, document, parent, onVideoOpacity, onVideoReady,
    assetBase = './animations/broken-heart-healing/assets', ...options}) {
    this.THREE = THREE
    this.document = document
    this.assetBase = assetBase.replace(/\/$/, '')
    this.onVideoOpacity = onVideoOpacity
    this.onVideoReady = onVideoReady
    this.group = new THREE.Group()
    this.group.visible = false
    parent?.add(this.group)
    this.settings = options
    this.elapsed = 0
    this.tracked = false
    this.ready = false
    this.failed = false
    this.disposed = false
    this.videoReady = false
    this.configure(options)
  }

  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve()
    if (this.loadPromise) return this.loadPromise
    this.lease = acquireAssets(this.THREE, this.assetBase)
    this.loadPromise = this.lease.promise.then(textures => {
      if (this.disposed) return
      this.build(textures)
      this.ready = true
      this.render()
    }).catch(error => {
      if (this.disposed) return
      this.failed = true
      this.lease.release()
      this.render()
      throw error
    })
    return this.loadPromise
  }

  build(textures) {
    const {THREE, group} = this
    this.sprites = {}
    const layers = ['trail', 'broken', 'repaired', 'healed', 'left', 'right', 'burst', 'needle', 'banner']
    layers.forEach((name, index) => {
      this.sprites[name] = createSprite(THREE, group, textures[name], 20 + index, HEART_REGIONS[name])
    })
    this.canvas = this.document.createElement('canvas')
    this.textTexture = new THREE.CanvasTexture(this.canvas)
    this.textTexture.colorSpace = THREE.SRGBColorSpace
    this.textTexture.generateMipmaps = false
    this.textTexture.minFilter = THREE.LinearFilter
    this.sprites.message = createSprite(THREE, group, this.textTexture, 29)
    this.drawMessage()

    const matrix = {value: new THREE.Matrix4()}
    const unclipped = {matrix, bounds: {value: new THREE.Vector4()}}
    this.clip = {matrix, bounds: {value: new THREE.Vector4()}}
    this.threadTexture = createThreadTexture(THREE)
    this.thread = new SpriteBatch(THREE, group, this.threadTexture, 23 * THREAD_SUBDIVISIONS, unclipped, 25.2, true)
    this.stitchSparks = new SpriteBatch(THREE, group, textures.burst, 23, unclipped, 26.5, true)
    this.petals = new SpriteBatch(THREE, group, textures.petals, 16, this.clip, 30)
    this.sparkles = new SpriteBatch(THREE, group, textures.burst, 16, this.clip, 31, true)
  }

  drawMessage() {
    drawHealingMessage(this.canvas, this.options.message, this.options.textColor)
    this.textTexture.needsUpdate = true
  }

  configure(options) {
    if (this.disposed) return
    const previous = this.options
    this.settings = {...this.settings, ...options}
    this.options = normalizeOptions(this.settings)
    if (previous?.enabled !== this.options.enabled) this.elapsed = 0
    if (this.textTexture && (previous.message !== this.options.message || previous.textColor !== this.options.textColor)) {
      this.drawMessage()
    }
    this.group.scale.set(this.options.width, this.options.width, this.options.width)
    this.render()
  }

  start() {
    if (this.tracked || this.disposed) return
    this.tracked = true
    this.elapsed = 0
    this.render()
  }

  reset() {
    this.tracked = false
    this.elapsed = 0
    this.render()
  }

  update(deltaSeconds) {
    if (!this.group.visible || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
    this.elapsed += deltaSeconds * this.options.speed
    this.render()
  }

  setVideoState(opacity, ready) {
    if (this.videoOpacity !== opacity) {
      this.videoOpacity = opacity
      this.onVideoOpacity?.(opacity)
    }
    const notify = ready && !this.videoReady
    this.videoReady = ready
    if (notify) this.onVideoReady?.()
  }

  render() {
    if (this.disposed) return
    const o = this.options
    const active = o.enabled && !this.failed
    this.group.visible = active && this.ready && this.tracked
    if (!this.group.visible) {
      this.setVideoState(active ? 0 : 1, this.tracked && !active)
      return
    }

    const frame = getHealingFrame(this.elapsed, o)
    const bounds = {
      left: o.boundsLeft / o.width, right: o.boundsRight / o.width,
      bottom: o.boundsBottom / o.width, top: o.boundsTop / o.width,
    }
    const heartWidth = Math.min(1, o.pictureHeight / o.width * 1.08) * o.heartScale
    this.renderHeart(frame, heartWidth, bounds)
    this.renderStitching(frame, heartWidth)
    this.renderBannerAndAmbient(frame, bounds)
    this.setVideoState(frame.videoOpacity, frame.videoReady)
  }

  renderHeart(frame, width, bounds) {
    const {heartX: x, heartY: y} = this.options
    const {intro, repair, heal, doors, doorAlpha, doorSwap, burst} = frame
    const size = width * mix(0.8, 1, intro)
    const height = size * 0.87
    const {broken, repaired, healed, left, right} = this.sprites
    pose(broken, intro * (1 - repair) * (1 - heal), x, y, size, height)
    pose(repaired, repair * (1 - heal), x, y, size * 1.025, height * 1.035)
    pose(healed, heal * (1 - doorSwap), x, y, size, height)
    for (const [direction, piece, edge] of [[-1, left, bounds.left], [1, right, bounds.right]]) {
      pose(piece, doorSwap * doorAlpha, getDoorX(direction, doors, x, width, edge),
        y + Math.sin(doors * Math.PI) * width * 0.08, width * 0.5, height,
        direction * doors * 1.12, -direction * doors * 0.18)
    }
    pose(this.sprites.burst, burst * 0.86, x, y, width * (1.05 + heal * 0.45))
  }

  renderStitching(frame, width) {
    const {heartX: x, heartY: y, needleStartX, needleStartY, needleScale, stitchingPath: path} = this.options
    const stitches = frame.stitch * (path.length - 1)
    const index = Math.min(path.length - 2, Math.floor(stitches))
    const tip = getStitchPoint(path, index, smooth(0, 1, stitches - index))
    const alpha = (1 - frame.heal) * (1 - frame.repair * 0.65)
    const approach = frame.approach
    const angle = -Math.PI / 2 - Math.cos(stitches * Math.PI) * Math.PI / 4
    const needleWidth = width * needleScale
    const tipX = x + mix(needleStartX, tip.x, approach) * width
    const tipY = y + (mix(needleStartY, tip.y, approach) + Math.sin(approach * Math.PI) * 0.095) * width
    pose(this.sprites.needle, frame.needleAlpha, tipX - Math.cos(angle) * needleWidth * 0.66,
      tipY - Math.sin(angle) * needleWidth * 0.66, needleWidth, needleWidth, 0, angle + 3 * Math.PI / 4)
    pose(this.sprites.trail, smooth(0, 0.3, frame.stitch) * alpha * 0.44,
      x, y, width * 1.48, width * 1.48, 0, -0.2 + frame.stitch * 0.38)

    let count = 0
    let sparks = 0
    for (let i = 0; i <= index && stitches > i && alpha > 0.008; i++) {
      const progress = smooth(0, 1, stitches - i)
      let from = getStitchPoint(path, i, 0)
      for (let segment = 1; segment <= THREAD_SUBDIVISIONS; segment++) {
        const to = getStitchPoint(path, i, progress * segment / THREAD_SUBDIVISIONS)
        const dx = to.x - from.x, dy = to.y - from.y
        this.thread.set(count++, {x: x + (from.x + to.x) * width / 2, y: y + (from.y + to.y) * width / 2,
          width: (Math.hypot(dx, dy) + 0.004) * width, height: 0.026 * width,
          rotation: Math.atan2(dy, dx), alpha})
        from = to
      }
      const flash = smooth(0.68, 0.98, stitches - i) * (1 - smooth(1, 1.67, stitches - i)) * alpha
      if (flash > 0.008) this.stitchSparks.set(sparks++, {
        x: x + (path[i][0] + path[i + 1][0]) * width / 2,
        y: y + (path[i][1] + path[i + 1][1]) * width / 2,
        width: width * 0.18, height: width * 0.19, alpha: flash, uv: STAR_REGION,
      })
    }
    this.thread.commit(count)
    this.stitchSparks.commit(sparks)
  }

  renderBannerAndAmbient(frame, bounds) {
    const o = this.options
    const bannerWidth = Math.min(1, o.pictureHeight / o.width * 1.45) * o.bannerScale
    const aspect = 1086 / 1448
    const y = bounds.bottom - 0.05 - bannerWidth * aspect * 0.43 + o.bannerY - (1 - frame.banner) * 0.09
    pose(this.sprites.banner, frame.banner, o.bannerX, y, bannerWidth, bannerWidth * aspect)
    pose(this.sprites.message, frame.banner, o.bannerX, y + bannerWidth * 0.024, bannerWidth * 0.74, bannerWidth * 0.185)
    if (frame.ambientTime <= 0) {
      this.petals.commit(0)
      this.sparkles.commit(0)
      return
    }

    this.group.updateWorldMatrix(true, false)
    this.clip.matrix.value.copy(this.group.matrixWorld).invert()
    this.clip.bounds.value.set(bounds.left, bounds.bottom, bounds.right, bounds.top)
    this.renderParticles(this.petals, o.petalCount, true, frame, bounds)
    this.renderParticles(this.sparkles, o.sparkleCount, false, frame, bounds)
  }

  renderParticles(batch, total, petal, frame, bounds) {
    let count = 0
    const time = frame.ambientTime
    const fade = smooth(0, 0.9, time)
    for (let i = 0; i < total; i++) {
      const seed = ((i * 37 + 11) % 73) / 73
      const cycle = (time * (petal ? 0.23 : 0.33) + i * 0.38197) % 1
      const direction = i % 2 ? 1 : -1
      const edge = direction > 0 ? bounds.right : bounds.left
      const width = petal ? 0.075 + seed * 0.07 : 0.06 + seed * 0.055
      batch.set(count++, {
        x: edge + direction * (0.08 + seed * 0.19 + Math.sin(cycle * 2 * Math.PI) * 0.04),
        y: petal ? mix(bounds.top + 0.30, bounds.bottom - 0.16, cycle)
          : mix(bounds.bottom, bounds.top + 0.12, seed) + cycle * 0.11,
        width, height: width * 1.08, rotation: seed * 6 + cycle * (petal ? 4 : 0.6),
        alpha: fade * Math.sin(cycle * Math.PI) ** (petal ? 1.4 : 3) * (petal ? 0.78 : 0.85),
        uv: petal ? PETAL_REGIONS[i % PETAL_REGIONS.length] : STAR_REGION,
      })
    }
    batch.commit(count)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.group.removeFromParent()
    this.onVideoOpacity?.(1)
    this.lease?.release()
    Object.values(this.sprites || {}).forEach(sprite => {
      sprite.material.dispose()
      sprite.geometry.dispose()
    })
    for (const batch of [this.thread, this.stitchSparks, this.petals, this.sparkles]) batch?.dispose()
    this.threadTexture?.dispose()
    this.textTexture?.dispose()
    this.group.clear()
  }
}

module.exports = {BrokenHeartHealingEffect, DEFAULTS, normalizeOptions}
