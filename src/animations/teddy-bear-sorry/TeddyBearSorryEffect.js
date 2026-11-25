const {SpriteBatch} = require('../shared/sprite-batch')
const {TargetTapInteraction} = require('../shared/tap-interaction')
const {mix, smooth} = require('../shared/easing')
const {acquireAssets, HEART_UV, SPARK_UV, PETAL_UVS} = require('./assets')
const {DEFAULT_TIMINGS, getTeddyFrame, getTeddyLayout, getTeddyPose} = require('./timeline')
const {DEFAULT_MESSAGE, getDefaultMessage, drawTeddyMessage} = require('./text')

const ASSET_BASE = './animations/teddy-bear-sorry/assets'
const DEFAULTS = Object.freeze({
  enabled: true, revealVideo: true, interactiveLetter: false,
  message: DEFAULT_MESSAGE, recipientName: '', senderName: '', maxMessageLength: 260, textColor: '#6b241c',
  width: 1, pictureHeight: 1, boundsLeft: -0.5, boundsRight: 0.5, boundsBottom: -0.5, boundsTop: 0.5,
  teddyX: -0.27, teddyY: 0, letterX: 0.27, letterY: 0, bannerX: 0, bannerY: 0,
  teddyScale: 1, letterScale: 1, bannerScale: 1, roseScale: 1, speed: 1, entranceSide: 'left',
  heartCount: 5, petalCount: 7, sparkleCount: 9,
  ...DEFAULT_TIMINGS,
})

const number = (value, fallback, min, max) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

const bool = (value, fallback) => value == null ? fallback : [true, 1, 'true', '1'].includes(
  typeof value === 'string' ? value.trim().toLowerCase() : value)

const normalizeOptions = (options = {}) => {
  const o = {...DEFAULTS, ...options.positions, ...options.timings, ...options}
  for (const key of ['enabled', 'revealVideo', 'interactiveLetter']) o[key] = bool(o[key], DEFAULTS[key])
  for (const key of ['recipientName', 'senderName', 'textColor']) o[key] = String(o[key] ?? DEFAULTS[key]).trim()
  o.message = String(options.message ?? getDefaultMessage(options.messageLines))
  o.entranceSide = o.entranceSide === 'right' ? 'right' : 'left'
  o.width = number(o.width, 1, 0.001, Infinity)
  o.pictureHeight = number(o.pictureHeight, 1, 0.001, Infinity)
  for (const [key, fallback] of Object.entries({boundsLeft: -o.width / 2, boundsRight: o.width / 2,
    boundsBottom: -o.pictureHeight / 2, boundsTop: o.pictureHeight / 2})) {
    o[key] = number(options[key], fallback, -Infinity, Infinity)
  }
  for (const key of ['teddyX', 'teddyY', 'letterX', 'letterY', 'bannerX', 'bannerY']) {
    o[key] = number(o[key], DEFAULTS[key], -3, 3)
  }
  for (const key of ['teddyScale', 'letterScale', 'bannerScale', 'roseScale', 'speed']) {
    o[key] = number(o[key], DEFAULTS[key], 0.1, 3)
  }
  for (const key of Object.keys(DEFAULT_TIMINGS)) o[key] = number(o[key], DEFAULTS[key], 0.1, 30)
  for (const key of ['heartCount', 'petalCount', 'sparkleCount']) o[key] = Math.round(number(o[key], DEFAULTS[key], 0, 16))
  o.maxMessageLength = Math.round(number(o.maxMessageLength, DEFAULTS.maxMessageLength, 16, 500))
  return o
}

const pose = (mesh, alpha, x, y, width, height, rotation = 0, tilt = 0) => {
  mesh.visible = alpha > 0.01
  if (!mesh.visible) return
  mesh.material.opacity = alpha
  mesh.position.set(x, y, 0)
  mesh.scale.set(width, height, 1)
  mesh.rotation.set(0, tilt, rotation)
}

const poseStanding = (mesh, alpha, x, foot, height, lean) => {
  pose(mesh, alpha, x - Math.sin(lean) * height / 2, foot + Math.cos(lean) * height / 2,
    height * mesh.userData.aspect, height, lean)
}

class TeddyBearSorryEffect {
  constructor({THREE, document, parent, assetBase = ASSET_BASE, onVideoOpacity, onVideoReady, ...options}) {
    this.THREE = THREE
    this.document = document
    this.assetBase = assetBase.replace(/\/$/, '')
    this.onVideoOpacity = onVideoOpacity
    this.onVideoReady = onVideoReady
    this.group = new THREE.Group()
    this.group.visible = false
    parent?.add(this.group)
    this.elapsed = 0
    this.tappedAt = null
    this.tracked = false
    this.ready = false
    this.failed = false
    this.disposed = false
    this.configure(options)
  }

  load() {
    if (!this.options.enabled || this.disposed) return Promise.resolve()
    if (this.loadPromise) return this.loadPromise
    const lease = acquireAssets(this.THREE, this.assetBase)
    this.lease = lease
    this.loadPromise = lease.promise.then(textures => {
      if (this.disposed) return
      this.build(textures)
      this.ready = true
      this.render()
    }).catch(error => {
      if (this.disposed) return
      this.failed = true
      lease.release()
      this.render()
      throw error
    })
    return this.loadPromise
  }

  build(textures) {
    const {THREE, group} = this
    this.canvas = this.document.createElement('canvas')
    this.messageTexture = new THREE.CanvasTexture(this.canvas)
    this.messageTexture.colorSpace = THREE.SRGBColorSpace
    this.messageTexture.generateMipmaps = false
    this.messageTexture.minFilter = THREE.LinearFilter
    this.drawMessage()
    this.plane = new THREE.PlaneGeometry(1, 1)
    this.meshes = {}
    const layers = ['walking', 'kneeling', 'rose', 'envelope', 'letter', 'burst', 'banner', 'message']
    layers.forEach((name, index) => {
      const map = name === 'message' ? this.messageTexture : textures[name]
      const mesh = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({
        map, transparent: true, alphaTest: 0.008, depthWrite: false, depthTest: false,
        toneMapped: false, side: THREE.DoubleSide,
      }))
      mesh.userData.aspect = map.image.width / map.image.height
      mesh.renderOrder = 24 + index
      mesh.visible = false
      group.add(mesh)
      this.meshes[name] = mesh
    })
    this.aspect = {letter: this.meshes.letter.userData.aspect, banner: this.meshes.banner.userData.aspect}
    this.clip = {matrix: {value: new THREE.Matrix4()}, bounds: {value: new THREE.Vector4()}}
    this.hearts = new SpriteBatch(THREE, group, textures.hearts, 16, this.clip, 22)
    this.trail = new SpriteBatch(THREE, group, textures.trail, 1, this.clip, 21, true)
    this.petals = new SpriteBatch(THREE, group, textures.petals, 17, this.clip, 20)
    this.sparkles = new SpriteBatch(THREE, group, textures.burst, 16, this.clip, 23, true)
    this.ray = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
  }

  drawMessage() {
    drawTeddyMessage(this.canvas, this.options)
    this.messageTexture.needsUpdate = true
  }

  configure(options) {
    if (this.disposed) return
    const previous = this.options
    this.settings = {...this.settings, ...options}
    this.options = normalizeOptions(this.settings)
    if (previous?.enabled !== this.options.enabled) {
      this.elapsed = 0
      this.tappedAt = null
    }
    if (this.messageTexture && ['message', 'recipientName', 'senderName', 'textColor', 'maxMessageLength']
      .some(key => previous[key] !== this.options[key])) this.drawMessage()
    this.render()
  }

  start() {
    if (this.disposed || this.tracked) return
    this.tracked = true
    this.render()
  }

  reset() {
    this.tracked = false
    this.elapsed = 0
    this.tappedAt = null
    this.interaction?.reset()
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
    const {options: o, elapsed: time} = this
    const active = o.enabled && !this.failed
    this.group.visible = this.tracked && this.ready && active
    if (!this.group.visible) {
      const open = !active || !o.revealVideo
      this.setVideoState(open ? 1 : 0, this.tracked && open)
      return
    }
    const frame = getTeddyFrame(time, o, this.tappedAt)
    const layout = getTeddyLayout(o, this.aspect)
    this.group.scale.setScalar(layout.unit)
    const bear = getTeddyPose(time, frame, layout, o)
    this.renderBear(frame, bear)
    this.renderLetter(frame, layout)
    this.renderBanner(frame, layout)
    this.renderParticles(frame, layout.bounds, bear)
    this.setVideoState(frame.videoOpacity, frame.videoReady)
  }

  renderBear(frame, bear) {
    const {walking, kneeling, rose} = this.meshes
    const fade = smooth(0.12, 0.82, frame.kneeling)
    poseStanding(walking, frame.walkFade * (1 - fade), bear.x, bear.foot, bear.height, bear.lean)
    poseStanding(kneeling, fade, bear.x, bear.foot, bear.kneelHeight,
      bear.lean * (1 - frame.tuckLeft) * 0.62)
    const lift = frame.roseRise
    const height = this.options.roseScale * mix(0.16, 0.25, lift)
    pose(rose, frame.roseAlpha * 0.94, bear.x + mix(0.025, 0.15, lift),
      bear.foot + bear.kneelHeight * 0.47 + lift * 0.23, height * rose.userData.aspect, height, -0.35 * lift)
  }

  renderLetter(frame, layout) {
    const {envelope, letter, burst} = this.meshes
    const {letterX: x} = this.options
    const {letterY: y, letterWidth: width, letterHeight: height} = layout
    const opening = frame.unfolding
    const closedWidth = width * mix(0.67, 0.91, frame.envelope)
    pose(envelope, frame.envelope * (1 - opening), x, y - 0.09 - (1 - frame.envelope) * 0.11,
      closedWidth, closedWidth / envelope.userData.aspect, mix(-0.24, -0.13, frame.envelope), opening * 0.9)
    const letterScale = mix(0.66, 1, opening)
    pose(letter, opening, x, y + mix(-0.09, 0, opening), width * letterScale,
      height * letterScale, mix(-0.14, 0.026, opening), mix(0.8, 0, opening))
    pose(burst, frame.burst * 0.82, x, y, width * (1 + 0.6 * opening), width * (1 + 0.6 * opening))
  }

  renderBanner(frame, layout) {
    const {banner, message} = this.meshes
    const x = this.options.bannerX
    const y = layout.bannerY - (1 - frame.banner) * 0.105
    const width = layout.bannerWidth
    pose(banner, frame.banner, x, y, width, layout.bannerHeight)
    pose(message, frame.banner, x, y + width * 0.068, width * 0.77, width * 0.201)
  }

  renderParticles(frame, bounds, bear) {
    this.group.updateWorldMatrix(true, false)
    this.clip.matrix.value.copy(this.group.matrixWorld).invert()
    this.clip.bounds.value.set(bounds.left, bounds.bottom, bounds.right, bounds.top)
    const flourish = frame.flourish
    if (flourish > 0.012) {
      this.trail.set(0, {x: bear.x, y: bear.foot + bear.kneelHeight * 0.61, width: 0.87, height: 0.87,
        alpha: flourish * 0.82, rotation: frame.roseRise * 0.17})
    }
    this.trail.commit(flourish > 0.012 ? 1 : 0)
    if (frame.ambient < 0.012) {
      if (flourish > 0.012) {
        this.hearts.set(0, {x: bear.x + 0.26, y: bear.foot + 0.26 + 0.17 * frame.roseRise, width: 0.31,
          height: 0.31, rotation: frame.roseRise * 0.18, alpha: flourish * 0.82})
      }
      this.hearts.commit(flourish > 0.012 ? 1 : 0)
      this.petals.commit(0)
      this.sparkles.commit(0)
      return
    }

    const o = this.options
    this.floatSprites(this.hearts, o.heartCount, frame, bounds, 'heart')
    this.floatSprites(this.petals, o.petalCount, frame, bounds, 'petal')
    this.floatSprites(this.sparkles, o.sparkleCount, frame, bounds, 'sparkle')
  }

  floatSprites(batch, count, frame, bounds, kind) {
    const time = frame.ambientTime
    const petal = kind === 'petal'
    let start = 0
    if (petal && count) {
      batch.set(start++, {x: bounds.right + 0.13, y: mix(bounds.bottom, bounds.top, 0.47),
        width: 0.67, height: 0.67, rotation: Math.sin(time * 0.72) * 0.29,
        alpha: (0.09 + 0.07 * Math.sin(time * 0.93) ** 2) * frame.ambient})
    }
    for (let i = 0; i < count; i++) {
      const seed = ((i * 31 + 11) % 71) / 71
      const p = (time * (petal ? 0.22 : 0.29) + i * 0.377) % 1
      const side = i % 2 ? 1 : -1
      const edge = side < 0 ? bounds.left : bounds.right
      const width = kind === 'sparkle' ? 0.036 + seed * 0.06 : 0.062 + seed * 0.07
      const y = petal ? mix(bounds.top + 0.19, bounds.bottom - 0.24, p) :
        mix(bounds.bottom, bounds.top, seed) + p * 0.27
      const uv = petal ? PETAL_UVS[i % PETAL_UVS.length] : kind === 'heart' ? HEART_UV : SPARK_UV
      batch.set(start + i, {
        x: edge + side * (0.09 + seed * 0.21 + Math.sin(p * Math.PI * 2) * 0.055), y,
        width, height: width * uv[3] / uv[2], rotation: seed * 2 + p * (petal ? 4 : 0.55),
        uv, alpha: frame.ambient * Math.sin(p * Math.PI) ** (kind === 'sparkle' ? 3 : 1.6) * 0.75,
      })
    }
    batch.commit(start + count)
  }

  openLetter() {
    if (!this.options.interactiveLetter || !this.group.visible ||
      !getTeddyFrame(this.elapsed, this.options, this.tappedAt).canOpen) return false
    this.tappedAt = this.elapsed
    this.render()
    return true
  }

  attachInteraction({element, getCamera, allowed}) {
    this.interaction?.dispose()
    this.interaction = new TargetTapInteraction({element, document: this.document, allowed,
      onTap: (x, y, rect) => {
        const camera = getCamera()
        const envelope = this.meshes?.envelope
        if (!camera || !envelope?.visible || !this.group.visible ||
          !getTeddyFrame(this.elapsed, this.options, this.tappedAt).canOpen) return false
        this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1)
        camera.updateWorldMatrix(true, false)
        envelope.updateWorldMatrix(true, false)
        this.ray.setFromCamera(this.pointer, camera)
        return this.ray.intersectObject(envelope, false).length > 0 && this.openLetter()
      },
    })
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.interaction?.dispose()
    this.onVideoOpacity?.(1)
    this.lease?.release()
    Object.values(this.meshes || {}).forEach(mesh => mesh.material.dispose())
    this.plane?.dispose()
    this.messageTexture?.dispose()
    for (const batch of [this.hearts, this.trail, this.petals, this.sparkles]) batch?.dispose()
    this.group.removeFromParent()
    this.group.clear()
  }
}

module.exports = {TeddyBearSorryEffect, DEFAULTS, ASSET_BASE, normalizeOptions}
