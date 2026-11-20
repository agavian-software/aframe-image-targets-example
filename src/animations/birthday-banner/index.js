const {getTargetVideoLayout} = require('../../target-size')

const BIRTHDAY_FILES = [
  '01_left_baby_no_wings.png',
  '02_right_baby_no_wings.png',
  '03_left_wing_outer.png',
  '04_left_wing_inner.png',
  '05_right_wing_inner.png',
  '06_right_wing_outer.png',
  '07_blank_cream_gold_banner.png',
]
const BANNER_ASPECT = 1099 / 470
const ENTRANCE_SECONDS = 1.7
const assetCache = new Map()
const isBirthdayBannerType = value => String(value ?? 0).trim() === '0'

const getBirthdayPlacement = (targetSize, properties, videoLayout) => {
  const picture = getTargetVideoLayout({}, targetSize, properties, 1)
  return {
    x: picture.x,
    y: Math.max(picture.y + picture.height / 2, videoLayout.y + videoLayout.height / 2),
    width: Math.max(picture.width, videoLayout.width),
  }
}

// Only live decorations hold textures. Multiple targets share one upload.
const acquireAssets = (THREE, base) => {
  let entry = assetCache.get(base)
  if (!entry) {
    const textures = []
    const loader = new THREE.TextureLoader()
    entry = {users: 0, textures}
    entry.promise = Promise.allSettled(BIRTHDAY_FILES.map(file => new Promise((resolve, reject) => {
      const texture = loader.load(`${base.replace(/\/$/, '')}/${file}`, () => {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = false
        resolve(texture)
      }, undefined, reject)
      textures.push(texture)
    }))).then((results) => {
      const failed = results.find(result => result.status === 'rejected')
      if (failed) throw failed.reason
      return results.map(result => result.value)
    })
    assetCache.set(base, entry)
  }
  entry.users++
  let released = false
  return {
    promise: entry.promise,
    release() {
      if (released) return
      released = true
      if (--entry.users) return
      assetCache.delete(base)
      // Includes textures whose network request failed or is still pending.
      entry.promise.catch(() => {}).then(() => entry.textures.forEach(texture => texture.dispose()))
    },
  }
}

const getBirthdayFrame = (elapsed, width) => {
  const t = Math.min(Math.max(elapsed / ENTRANCE_SECONDS, 0), 1)
  const ease = t * t * t * (10 + t * (-15 + 6 * t))
  const floatingTime = Math.max(0, elapsed - ENTRANCE_SECONDS)
  const floating = Math.min(floatingTime / 0.7, 1)
  return {
    scale: Math.max(0.001, width) * 0.69,
    // The topmost wing starts below the edge. The lowest banner corner ends
    // above it, including the full amplitude of the subsequent gentle bob.
    y: -0.76 + ease * (0.76 + 0.5 / BANNER_ASPECT + 0.09)
      + Math.sin(floatingTime * 1.4) * 0.014 * floating,
    floating,
    floatingTime,
  }
}

const drawBirthdayText = (canvas, value) => {
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const text = String(value ?? 'Happy Birthday!').slice(0, 240)
  const paragraphs = text.split('\n').slice(0, 3)
  let lines = []
  let size = 88
  // Wrap at words and shrink until the whole message fits the safe cream area.
  for (; size >= 20; size -= 2) {
    ctx.font = `600 ${size}px Georgia, serif`
    lines = []
    paragraphs.forEach((paragraph) => {
      let line = ''
      paragraph.split(/\s+/).forEach((word) => {
        const next = line ? `${line} ${word}` : word
        if (line && ctx.measureText(next).width > 940) {
          lines.push(line)
          line = word
        } else line = next
      })
      lines.push(line)
    })
    if (lines.length * size * 1.2 <= 220 && lines.every(line => ctx.measureText(line).width <= 940)) break
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#77501e'
  ctx.shadowColor = 'rgba(255, 248, 219, 0.8)'
  ctx.shadowBlur = 2
  const lineHeight = size * 1.2
  lines.forEach((line, i) => ctx.fillText(line, 512, 128 + (i - (lines.length - 1) / 2) * lineHeight, 940))
}

const registerMagicBirthdayBanner = (window) => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-birthday-banner']) return
  const THREE = AFRAME.THREE

  AFRAME.registerComponent('magic-birthday-banner', {
    schema: {
      targetName: {default: ''},
      width: {type: 'number', default: 1},
      text: {default: 'Happy Birthday!'},
      // Type 0 is the flying-baby design. Types 1 and 2 are reserved.
      bannerType: {default: '0'},
      assetBase: {default: './animations/birthday-banner/assets'},
    },

    init() {
      this.elapsed = 0
      this.tracked = false
      this.ready = false
      this.supported = isBirthdayBannerType(this.data.bannerType)
      this.removed = false
      this.materials = []
      this.geometries = []
      this.babies = []
      this.wings = []
      this.edgeUniform = {value: new THREE.Matrix4()}
      this.group = new THREE.Group()
      this.group.visible = false
      this.el.setObject3D('birthday', this.group)
      this.onFound = (event) => {
        if (event.detail?.name !== this.data.targetName || this.tracked) return
        this.tracked = true
        this.elapsed = 0
        this.animate(0)
        this.group.visible = this.ready && this.supported
      }
      this.onLost = (event) => {
        if (event.detail?.name !== this.data.targetName) return
        this.tracked = false
        this.elapsed = 0
        this.group.visible = false
        this.animate(0)
      }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },

    update(oldData = {}) {
      this.supported = isBirthdayBannerType(this.data.bannerType)
      if (!this.supported) {
        this.group.visible = false
        this.elapsed = 0
        return
      }
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) {
        this.tracked = false
        this.group.visible = false
        this.elapsed = 0
      }
      if (!this.assets) {
        const base = new URL(this.data.assetBase, window.document.baseURI).href
        this.assets = acquireAssets(THREE, base)
        this.assetsReady = this.assets.promise.then((textures) => {
          if (this.removed) return
          this.build(textures)
          this.ready = true
          this.elapsed = 0
          this.animate(0)
          this.group.visible = this.tracked && this.supported
        }).catch((error) => {
          if (!this.removed) {
            console.error('[magic] Birthday artwork could not load:', error)
            this.el.emit('birthdaybannererror', {error})
          }
        })
      }
      if (this.textTexture && oldData.text !== this.data.text) this.updateText()
      this.group.visible = this.ready && this.tracked
      this.animate(0)
    },

    makeMaterial(texture) {
      const material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, alphaTest: 0.025,
        depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
      })
      // Clip only this decoration in its own target coordinates. Nothing in
      // the renderer, camera pipeline, video mesh, or tracking is changed.
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uBirthdayToTarget = this.edgeUniform
        shader.vertexShader = shader.vertexShader.replace('#include <common>',
          '#include <common>\nuniform mat4 uBirthdayToTarget;\nvarying float vBirthdayY;')
          .replace('#include <project_vertex>', '#include <project_vertex>\n' +
            'vBirthdayY = (uBirthdayToTarget * modelMatrix * vec4(transformed, 1.0)).y;')
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
          '#include <common>\nvarying float vBirthdayY;')
          .replace('#include <clipping_planes_fragment>',
            '#include <clipping_planes_fragment>\nif (vBirthdayY < 0.0) discard;')
      }
      material.customProgramCacheKey = () => 'birthday-top-edge-v1'
      this.materials.push(material)
      return material
    },

    makePlane(texture, width, height, pivot = {x: 0.5, y: 0.5}) {
      const geometry = new THREE.PlaneGeometry(width, height)
      // Image pivots are measured from the PNG's top left; local Y points up.
      geometry.translate((0.5 - pivot.x) * width, (pivot.y - 0.5) * height, 0)
      this.geometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, this.makeMaterial(texture))
      mesh.renderOrder = 20
      return mesh
    },

    build(textures) {
      const bannerHeight = 1 / BANNER_ASPECT
      this.banner = this.makePlane(textures[6], 1, bannerHeight)
      this.banner.position.z = 0.012
      this.group.add(this.banner)
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1
        const baby = new THREE.Group()
        const bodyHeight = 0.54
        const image = textures[i].image
        const bodyWidth = bodyHeight * image.width / image.height
        // Hands in these exact PNGs sit at x=.92/.08, y=.58. Align them to
        // the banner's handles instead of centering the babies arbitrarily.
        baby.position.set(side * (0.43 + bodyWidth * 0.42), 0.16 + bodyHeight * 0.08, 0.015)
        const body = this.makePlane(textures[i], bodyWidth, bodyHeight)
        baby.add(body)
        this.babies.push(baby)
        this.group.add(baby)
        const wingSpecs = i === 0
          ? [{index: 2, pivot: {x: 0.91, y: 0.84}, height: 0.38, outer: true},
            {index: 3, pivot: {x: 0.13, y: 0.86}, height: 0.32, outer: false}]
          : [{index: 5, pivot: {x: 0.12, y: 0.84}, height: 0.38, outer: true},
            {index: 4, pivot: {x: 0.88, y: 0.86}, height: 0.32, outer: false}]
        wingSpecs.forEach(({index, pivot, height, outer}) => {
          const wingRoot = new THREE.Group()
          wingRoot.position.set(-side * bodyWidth * 0.04, -bodyHeight * 0.05, outer ? -0.025 : -0.013)
          const wingImage = textures[index].image
          const wing = this.makePlane(textures[index], height * wingImage.width / wingImage.height, height, pivot)
          // Sort these flat transparent layers explicitly: flapping must not
          // bring a wing across the face when its bounding-sphere center moves.
          wing.renderOrder = outer ? 18 : 19
          wingRoot.add(wing)
          baby.add(wingRoot)
          this.wings.push({root: wingRoot, side, outer})
        })
      }
      this.canvas = window.document.createElement('canvas')
      this.textTexture = new THREE.CanvasTexture(this.canvas)
      this.textTexture.colorSpace = THREE.SRGBColorSpace
      this.textTexture.minFilter = THREE.LinearFilter
      this.textTexture.magFilter = THREE.LinearFilter
      this.textTexture.generateMipmaps = false
      this.textPlane = this.makePlane(this.textTexture, 0.68, 0.17)
      this.textPlane.position.set(0, -0.018, 0.035)
      this.textPlane.renderOrder = 21
      this.group.add(this.textPlane)
      this.updateText()
    },

    updateText() {
      drawBirthdayText(this.canvas, this.data.text)
      this.textTexture.needsUpdate = true
    },

    animate(delta) {
      if (!this.group) return
      this.elapsed += Math.min(Math.max(delta || 0, 0), 50) / 1000
      const frame = getBirthdayFrame(this.elapsed, this.data.width)
      this.group.scale.setScalar(frame.scale)
      this.group.position.y = frame.y * frame.scale
      this.babies.forEach((baby, i) => {
        baby.position.y = 0.16 + 0.54 * 0.08 + Math.sin(frame.floatingTime * 1.8 + i * 0.5) * 0.006 * frame.floating
        baby.rotation.z = Math.sin(frame.floatingTime * 1.3 + i * 0.5) * 0.012 * frame.floating
      })
      this.wings.forEach(({root, side, outer}) => {
        const flap = Math.sin(this.elapsed * Math.PI * 3.6 + (outer ? 0 : 0.45))
        root.rotation.y = side * (0.12 + flap * (outer ? 0.65 : 0.48))
        root.rotation.z = side * (0.05 + flap * (outer ? 0.16 : 0.11))
      })
      this.el.object3D.updateWorldMatrix(true, false)
      this.edgeUniform.value.copy(this.el.object3D.matrixWorld).invert()
    },

    tick(time, delta) {
      if (this.ready && this.tracked && this.supported) this.animate(delta)
    },

    remove() {
      this.removed = true
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.el.removeObject3D('birthday')
      this.geometries.forEach(geometry => geometry.dispose())
      this.materials.forEach(material => material.dispose())
      this.textTexture?.dispose()
      this.assets?.release()
    },
  })
}

module.exports = {BIRTHDAY_FILES, getBirthdayPlacement, getBirthdayFrame, drawBirthdayText, isBirthdayBannerType, registerMagicBirthdayBanner}
