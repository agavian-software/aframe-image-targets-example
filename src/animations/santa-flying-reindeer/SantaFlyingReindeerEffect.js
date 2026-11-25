const {SpriteBatch} = require('../shared/sprite-batch')
const {mix} = require('../shared/easing')
const {ASSET_BASE, acquireAssets, SNOW_REGIONS} = require('./assets')
const {normalizeOptions, getSantaLayout, getSantaFrame} = require('./timeline')
const {drawSantaMessage} = require('./text')

const pose = (mesh, alpha, x, y, width, rotation = 0, z = 0) => {
  mesh.visible = alpha > 0.008
  if (!mesh.visible) return
  mesh.material.opacity = alpha
  mesh.position.set(x, y, z)
  mesh.scale.set(width, width / mesh.userData.aspect, 1)
  mesh.rotation.z = rotation
}

class SantaFlyingReindeerEffect {
  constructor({THREE, document, parent, assetBase = ASSET_BASE, ...options}) {
    this.THREE = THREE
    this.document = document
    this.assetBase = assetBase.replace(/\/$/, '')
    this.group = new THREE.Group()
    this.group.visible = false
    parent?.add(this.group)
    this.elapsed = 0
    this.tracked = false
    this.ready = false
    this.disposed = false
    this.configure(options)
  }

  load() {
    if (!this.options.enabled || this.disposed) return Promise.resolve()
    if (!this.loadPromise) {
      this.loadPromise = this.loadArtwork().catch(error => {
        this.loadPromise = null
        if (!this.disposed) throw error
      })
    }
    return this.loadPromise
  }

  async loadArtwork() {
    for (const format of ['webp', 'png']) {
      if (this.disposed) return
      const lease = acquireAssets(this.THREE, this.assetBase, format)
      this.lease = lease
      let textures
      try {
        textures = await lease.promise
      } catch (error) {
        lease.release()
        if (this.disposed) return
        if (format === 'png') throw error
        continue
      }
      if (this.disposed) return
      this.build(textures)
      this.ready = true
      this.render()
      return
    }
  }

  build(textures) {
    const {THREE, group} = this
    this.canvas = this.document.createElement('canvas')
    this.messageTexture = new THREE.CanvasTexture(this.canvas)
    this.messageTexture.colorSpace = THREE.SRGBColorSpace
    this.messageTexture.minFilter = THREE.LinearFilter
    this.messageTexture.generateMipmaps = false
    this.drawMessage()

    this.plane = new THREE.PlaneGeometry(1, 1)
    this.meshes = {}
    const layers = ['trail', 'flying', 'dropping', 'burst', 'closedGift', 'openGift', 'banner', 'message']
    layers.forEach((name, index) => {
      const map = name === 'message' ? this.messageTexture : textures[name]
      const mesh = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({
        map, transparent: true, alphaTest: 0.008, depthWrite: false, depthTest: false,
        side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true,
        blending: name === 'burst' ? THREE.AdditiveBlending : THREE.NormalBlending,
      }))
      mesh.userData.aspect = map.image.width / map.image.height
      mesh.renderOrder = 21 + index
      mesh.visible = false
      group.add(mesh)
      this.meshes[name] = mesh
    })
    this.snowClip = {matrix: {value: new THREE.Matrix4()}, bounds: {value: new THREE.Vector4()}}
    this.snowAspect = textures.snow.image.width / textures.snow.image.height
    this.snow = new SpriteBatch(THREE, group, textures.snow, 24, this.snowClip, 20)
    this.snow.mesh.material.forceSinglePass = true
  }

  drawMessage() {
    drawSantaMessage(this.canvas, this.options)
    this.messageTexture.needsUpdate = true
  }

  configure(options = {}) {
    if (this.disposed) return
    const previous = this.options
    const {positions, timings, ...settings} = options
    this.settings = {...this.settings, ...positions, ...timings, ...settings}
    this.options = normalizeOptions(this.settings)
    this.layout = getSantaLayout(this.options)
    this.group.scale.setScalar(this.options.width)
    if (previous?.enabled !== this.options.enabled) this.elapsed = 0
    if (this.messageTexture && ['message', 'recipientName', 'familyName', 'textColor']
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
    this.render()
  }

  update(deltaSeconds) {
    if (!this.group.visible || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
    this.seek(this.elapsed + deltaSeconds * this.options.speed)
  }

  seek(seconds) {
    if (this.disposed || !Number.isFinite(seconds)) return
    this.elapsed = Math.max(0, seconds)
    this.render()
  }

  render() {
    if (this.disposed) return
    const {options: o, layout} = this
    this.group.visible = this.tracked && this.ready && o.enabled
    if (!this.group.visible) return

    const f = getSantaFrame(this.elapsed, o, layout)
    const {trail, flying, dropping, burst, closedGift, openGift, banner, message} = this.meshes
    const {santaWidth, openWidth, bannerWidth} = layout
    pose(trail, f.trail, f.santaX - santaWidth * 0.44, f.santaY - santaWidth * 0.085,
      santaWidth * 0.95, f.santaRotation * 0.45)
    pose(flying, f.santaAlpha * (1 - f.turn), f.santaX, f.santaY, santaWidth, f.santaRotation)
    pose(dropping, f.santaAlpha * f.turn, f.santaX, f.santaY, santaWidth, f.santaRotation)

    const revealWidth = openWidth * f.openScale
    pose(closedGift, f.giftAlpha, f.giftX, f.giftY, f.giftWidth, f.giftRotation, 0.042)
    // Align the bottom of the painted boxes through the transition.
    pose(openGift, f.openAlpha, o.giftX, layout.giftGround + 0.48 * revealWidth / openGift.userData.aspect,
      revealWidth, 0, 0.042)
    pose(burst, f.burst, o.giftX, layout.giftGround + 0.52 * openWidth,
      openWidth * f.burstScale, (f.burstScale - 1) * 0.18, 0.027)

    const y = layout.bannerY - 0.095 * (1 - f.banner)
    const width = bannerWidth * mix(0.86, 1, f.banner)
    pose(banner, f.banner, o.bannerX, y, width)
    pose(message, f.banner, o.bannerX, y - 0.04 * width, width * 0.68, 0, 0.001)
    this.renderSnow(f.snow * o.snowOpacity, f.snowTime)
  }

  renderSnow(opacity, time) {
    const count = opacity > 0.008 ? this.options.snowCount : 0
    if (!count) {
      if (this.snow.mesh.visible) this.snow.commit(0)
      return
    }
    const {left, right, top, bottom} = this.layout.bounds
    this.group.updateWorldMatrix(true, false)
    this.snowClip.matrix.value.copy(this.group.matrixWorld).invert()
    this.snowClip.bounds.value.set(left, bottom, right, top)
    for (let i = 0; i < count; i++) {
      const seed = ((i * 17 + 7) % 37) / 37
      const p = (time * (0.13 + seed * 0.085) + i * 0.618) % 1
      const side = i % 2 ? 1 : -1
      const edge = side < 0 ? left : right
      const uv = SNOW_REGIONS[i % SNOW_REGIONS.length]
      const width = (0.063 + seed * 0.058) * Math.min(1.5, this.options.size)
      this.snow.set(i, {
        x: edge + side * (0.043 + seed * 0.135) + Math.sin(p * Math.PI * 2 + i) * 0.031,
        y: mix(top + 0.22, bottom - 0.38, p), width, height: width * uv[3] / (uv[2] * this.snowAspect),
        rotation: (seed - 0.5) * 1.6 + p * side, uv, alpha: opacity * Math.sin(Math.PI * p),
      })
    }
    this.snow.commit(count)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.group.visible = false
    this.lease?.release()
    this.snow?.dispose()
    Object.values(this.meshes || {}).forEach(mesh => mesh.material.dispose())
    this.plane?.dispose()
    this.messageTexture?.dispose()
    this.group.removeFromParent()
    this.group.clear()
  }
}

module.exports = {SantaFlyingReindeerEffect}
