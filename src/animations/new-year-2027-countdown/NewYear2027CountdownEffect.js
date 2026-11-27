const {SpriteBatch} = require('../shared/sprite-batch')
const {mix} = require('../shared/easing')
const {acquireAssets} = require('./assets')
const {ARTWORK_YEAR, MAX_PARTICLES, normalizeOptions, getLayout, getFrame} = require('./timeline')
const {drawGoldLabel, drawGreeting, drawGlow} = require('./text')

const pose = (mesh, alpha, x, y, width, rotation = 0) => {
  mesh.visible = alpha > 0.008
  if (!mesh.visible) return
  mesh.material.opacity = alpha
  mesh.position.set(x, y, 0)
  mesh.scale.set(width, width * mesh.userData.aspect, 1)
  mesh.rotation.z = rotation
}

class NewYear2027CountdownEffect {
  constructor({THREE, document, parent, ...options}) {
    this.THREE = THREE
    this.document = document
    const navigator = document.defaultView?.navigator
    this.mobile = /Android|iPhone|iPad|iPod/i.test(navigator?.userAgent || '') ||
      (/Macintosh/i.test(navigator?.userAgent || '') && navigator.maxTouchPoints > 1)
    this.group = new THREE.Group()
    this.group.name = 'NewYear2027CountdownEffect'
    this.group.visible = false
    parent?.add(this.group)
    this.elapsed = 0
    this.tracked = false
    this.disposed = false
    this.ready = false
    this.generation = 0
    this.meshes = {}
    this.batches = {}
    this.generatedTextures = []
    this.clip = {matrix: {value: new THREE.Matrix4()}, bounds: {value: new THREE.Vector4()}}
    this.gold = new THREE.Color('#ffcd50')
    this.blue = new THREE.Color('#569dff')
    this.configure(options)
  }

  load() {
    if (this.disposed || !this.options.enabled) return Promise.resolve(false)
    if (!this.loadPromise) {
      const generation = this.generation
      this.loadPromise = this.loadArtwork(generation).catch(error => {
        if (generation !== this.generation) return false
        this.clearArtwork()
        throw error
      })
    }
    return this.loadPromise
  }

  async loadArtwork(generation) {
    const base = new URL(this.options.assetBase, this.document.baseURI).href.replace(/\/$/, '')
    for (const format of ['webp', 'png']) {
      const lease = acquireAssets(this.THREE, base, format)
      this.lease = lease
      let textures
      try {
        textures = await lease.promise
      } catch (error) {
        lease.release()
        if (generation !== this.generation) return false
        if (format === 'png') throw error
        continue
      }
      if (generation !== this.generation) return false
      this.build(textures)
      this.ready = true
      this.render()
      return true
    }
    return false
  }

  canvasTexture(width, height) {
    const canvas = this.document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const texture = new this.THREE.CanvasTexture(canvas)
    texture.colorSpace = this.THREE.SRGBColorSpace
    texture.minFilter = this.THREE.LinearFilter
    texture.generateMipmaps = false
    this.generatedTextures.push(texture)
    return texture
  }

  build(textures) {
    const {THREE, group} = this
    this.digitTexture = this.canvasTexture(256, 256)
    this.greetingTexture = this.canvasTexture(512, 128)
    this.greetingTexture.generateMipmaps = true
    this.greetingTexture.minFilter = THREE.LinearMipmapLinearFilter
    this.yearTexture = this.canvasTexture(768, 324)
    this.digit = null
    this.drawText()
    const glow = this.canvasTexture(64, 64)
    drawGlow(glow.image)
    this.plane = new THREE.PlaneGeometry(1, 1)
    const layers = {
      trail: [textures.trail, 23], clock: [textures.clock, 24], halo: [textures.halo, 25],
      yearArt: [textures.yearArt, 26], yearText: [this.yearTexture, 26],
      banner: [textures.banner, 27], greeting: [this.greetingTexture, 28], digit: [this.digitTexture, 28],
    }
    for (const [name, [map, order]] of Object.entries(layers)) {
      const material = new THREE.MeshBasicMaterial({map, transparent: true, alphaTest: 0.008,
        depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true})
      const mesh = new THREE.Mesh(this.plane, material)
      mesh.userData.aspect = map.image.height / map.image.width
      mesh.renderOrder = order
      mesh.visible = false
      group.add(mesh)
      this.meshes[name] = mesh
    }
    for (const [name, map, count, order] of [
      ['leftFirework', textures.leftFirework, 1, 20], ['rightFirework', textures.rightFirework, 1, 20],
      ['confetti', textures.confetti, 2, 21], ['glow', glow, MAX_PARTICLES + 9, 29],
    ]) {
      const batch = new SpriteBatch(THREE, group, map, count, this.clip, order, name === 'glow')
      batch.aspect = map.image.height / map.image.width
      batch.mesh.material.forceSinglePass = true
      this.batches[name] = batch
    }
  }

  drawText(previous) {
    const o = this.options
    if (!previous || previous.year !== o.year) {
      if (o.year !== ARTWORK_YEAR) {
        drawGoldLabel(this.yearTexture.image, o.year)
        this.yearTexture.needsUpdate = true
      }
    }
    if (!previous || ['message', 'recipientName', 'familyName'].some(key => previous[key] !== o[key])) {
      drawGreeting(this.greetingTexture.image, o)
      this.greetingTexture.needsUpdate = true
    }
  }

  configure({positions, timings, scales, ...settings} = {}) {
    if (this.disposed) return
    const previous = this.options
    this.settings = {...this.settings, ...positions, ...timings, ...scales, ...settings}
    this.options = normalizeOptions(this.settings)
    const o = this.options
    this.layout = getLayout(o)
    this.group.scale.setScalar(o.width)
    this.clip.bounds.value.set(this.layout.left, this.layout.bottom, this.layout.right, this.layout.top)
    if (previous && previous.assetBase !== o.assetBase) this.clearArtwork()
    if (previous?.enabled !== o.enabled) this.elapsed = 0
    if (this.ready) this.drawText(previous)
    this.render()
  }

  start() {
    if (this.disposed || this.tracked) return
    this.tracked = true
    this.seek(0)
  }

  reset() {
    this.tracked = false
    this.digit = null
    this.seek(0)
  }

  update(deltaSeconds) {
    if (this.group.visible && Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      this.seek(this.elapsed + deltaSeconds)
    }
  }

  seek(seconds) {
    if (this.disposed || !Number.isFinite(seconds)) return
    this.elapsed = Math.max(0, seconds)
    this.render()
  }

  render() {
    if (this.disposed) return
    const {options: o, layout: l, meshes: m, elapsed: time} = this
    this.group.visible = this.tracked && this.ready && o.enabled
    if (!this.group.visible) return
    this.group.updateWorldMatrix(true, false)
    this.clip.matrix.value.copy(this.group.matrixWorld).invert()

    const f = getFrame(time, o)
    const clockWidth = l.clockWidth * mix(0.64, 1, f.rise) * mix(1, 0.49, f.clockShift)
    pose(m.clock, f.clock, o.clockX - f.clockShift * (l.haloWidth * 0.55 + l.clockWidth * 0.27),
      l.clockY - (1 - f.rise) * l.clockWidth * 0.52 + Math.sin(time * 2.4) * 0.006,
      clockWidth, mix(-0.095, 0, f.rise) - f.clockShift * 0.08)
    const haloWidth = l.haloWidth * (mix(0.88, 1, f.halo) + 0.15 * f.flash)
    pose(m.halo, f.halo, o.countdownX, l.countdownY, haloWidth, Math.sin(time * 1.5) * 0.025)
    if (f.digit !== null && this.digit !== f.digit) {
      this.digit = f.digit
      drawGoldLabel(this.digitTexture.image, String(f.digit))
      this.digitTexture.needsUpdate = true
    }
    pose(m.digit, f.digit === null ? 0 : f.digitAlpha, o.countdownX, l.countdownY, l.haloWidth * 0.59 * f.pulse)

    const yearWidth = l.yearWidth * f.yearScale
    const yearY = l.yearY - (1 - f.yearRise) * 0.055 * l.scale + Math.sin(time * 1.7) * 0.006
    pose(m.yearArt, o.year === ARTWORK_YEAR ? f.year : 0, o.yearX, yearY, yearWidth)
    pose(m.yearText, o.year !== ARTWORK_YEAR ? f.year : 0, o.yearX, yearY, yearWidth)
    const bannerWidth = l.bannerWidth * mix(0.84, 1, f.banner)
    const bannerY = l.bannerY - (1 - f.banner) * 0.11 * l.scale
    pose(m.banner, f.banner, o.bannerX, bannerY, bannerWidth)
    pose(m.greeting, f.banner, o.bannerX, bannerY - bannerWidth * 0.025, bannerWidth * 0.80)

    const restingTrail = Math.sin(Math.PI * (f.loop % 4.6) / 4.6) ** 4 * 0.29 * f.confetti
    if (f.countdownTrail > 0) {
      pose(m.trail, f.countdownTrail, o.countdownX + mix(-0.17, 0.17, f.countdownSweep) * l.scale,
        l.countdownY, haloWidth * 1.12, mix(-0.72, 0.6, f.countdownSweep))
    } else {
      const sweep = f.yearTrail > 0 ? f.yearSweep : (f.loop % 4.6) / 4.6
      pose(m.trail, Math.max(f.yearTrail, restingTrail), o.yearX + mix(-0.23, 0.18, sweep) * l.scale,
        yearY + 0.03, l.yearWidth * 0.87, mix(-0.48, 0.44, sweep))
    }
    this.renderOverlays(f)
  }

  renderOverlays(f) {
    const {options: o, layout: l, batches} = this
    const {confetti, glow} = batches
    let flashes = 0
    if (f.flash > 0.008) {
      const width = l.haloWidth * mix(1, 2.35, 1 - f.flash)
      glow.set(flashes++, {x: o.countdownX, y: l.countdownY, width, height: width, alpha: f.flash * 0.94})
    }
    const confettiAlpha = f.confetti * o.confettiOpacity
    const particleCount = this.mobile ? Math.min(o.particleCount, 12) : o.particleCount
    const fireworksVisible = f.fireworks > 0.008
    const confettiVisible = confettiAlpha > 0.008
    const burstCount = fireworksVisible ? particleCount : 0
    const idleCount = f.confetti > 0.008 ? Math.min(this.mobile ? 4 : 8, particleCount) : 0
    for (const side of [-1, 1]) {
      const edge = side < 0 ? l.left : l.right
      const firework = side < 0 ? batches.leftFirework : batches.rightFirework
      const fireX = edge + side * (l.fireworkWidth * 0.10 + o.fireworksX)
      const fireY = l.top + (0.11 + f.fireworkScale * 0.075) * l.scale + o.fireworksY
      const fireworkWidth = l.fireworkWidth * f.fireworkScale
      if (fireworksVisible) {
        firework.set(0, {x: fireX, y: fireY, width: fireworkWidth, height: fireworkWidth * firework.aspect,
          rotation: side * mix(0.13, -0.035, f.fireworkScale), alpha: f.fireworks})
      }
      if (fireworksVisible || firework.mesh.visible) firework.commit(fireworksVisible ? 1 : 0)

      if (confettiVisible) {
        const phase = (f.loop / 4.6 + (side < 0 ? 0.24 : 0.63)) % 1
        const width = l.confettiWidth
        confetti.set(side < 0 ? 0 : 1, {x: edge + side * (width * 0.51 + o.confettiX) +
          Math.sin(phase * Math.PI * 2) * width * 0.13,
        y: mix(l.top, l.bottom, phase) + o.confettiY, width, height: width * confetti.aspect,
        rotation: side * Math.sin(phase * Math.PI * 2) * 0.16,
        alpha: Math.sin(phase * Math.PI) * confettiAlpha})
      }
      for (let i = side < 0 ? 0 : 1; i < burstCount; i += 2) {
        const age = Math.min(1, f.midnight * (1.22 + (i % 6) * 0.12))
        const angle = i * 2.39996
        const radius = (1 - (1 - age) ** 2) * (0.13 + (i % 5) * 0.055) * l.scale
        const width = (0.024 + i % 4 * 0.014) * l.scale * (1 - age * 0.58)
        glow.set(flashes++, {x: fireX + side * fireworkWidth * 0.30 + Math.cos(angle) * radius,
          y: fireY + Math.sin(angle) * radius - age ** 2 * 0.19 * l.scale,
          width, height: width, color: i % 3 ? this.gold : this.blue,
          alpha: (1 - age) * f.fireworks})
      }
      for (let i = side < 0 ? 0 : 1; i < idleCount; i += 2) {
        const phase = (f.loop / (3.7 + i * 0.13) + i * 0.27) % 1
        const width = (0.022 + i % 3 * 0.01) * l.scale
        glow.set(flashes++, {x: edge + side * (0.09 + i % 3 * 0.065) * l.scale,
          y: mix(l.top + 0.17, l.bottom, phase), width, height: width,
          color: i % 3 ? this.gold : this.blue,
          alpha: Math.sin(phase * Math.PI) ** 4 * 0.70 * f.confetti})
      }
    }
    if (confettiVisible || confetti.mesh.visible) confetti.commit(confettiVisible ? 2 : 0)
    if (flashes || glow.mesh.visible) glow.commit(flashes)
  }

  clearArtwork() {
    ++this.generation
    this.group.visible = false
    this.ready = false
    for (const mesh of Object.values(this.meshes)) {
      mesh.material.dispose()
      mesh.removeFromParent()
    }
    Object.values(this.batches).forEach(batch => batch.dispose())
    this.generatedTextures.forEach(texture => texture.dispose())
    this.plane?.dispose()
    this.lease?.release()
    this.meshes = {}
    this.batches = {}
    this.generatedTextures = []
    this.plane = this.lease = this.loadPromise = null
    this.digitTexture = this.greetingTexture = this.yearTexture = null
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.clearArtwork()
    this.group.removeFromParent()
  }
}

module.exports = {NewYear2027CountdownEffect}
