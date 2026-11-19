// Masked video surface used for playback on a tracked image target.
const {getVideoSurfaceSize, prepareVideoMask} = require('./video-mask')

const getCoverTextureTransform = (sourceAspect, targetAspect) => {
  if (!Number.isFinite(sourceAspect) || !Number.isFinite(targetAspect)) {
    return {repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0}
  }
  if (sourceAspect <= 0 || targetAspect <= 0) {
    return {repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0}
  }

  if (sourceAspect > targetAspect) {
    const repeatX = targetAspect / sourceAspect
    return {
      repeatX,
      repeatY: 1,
      offsetX: (1 - repeatX) / 2,
      offsetY: 0,
    }
  }

  if (sourceAspect < targetAspect) {
    const repeatY = sourceAspect / targetAspect
    return {
      repeatX: 1,
      repeatY,
      offsetX: 0,
      offsetY: (1 - repeatY) / 2,
    }
  }

  return {repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0}
}

const registerMagicTargetVideoCover = (window) => {
  if (!window.AFRAME || window.AFRAME.components['magic-target-video-cover']) return

  window.AFRAME.registerComponent('magic-target-video-cover', {
    schema: {
      video: {type: 'selector'},
      width: {type: 'number', default: 1},
      height: {type: 'number', default: 1},
      maskUrl: {type: 'string', default: ''},
      maskMode: {type: 'string', default: 'auto'},
      maskAspect: {type: 'number', default: 1},
      shape: {type: 'string', default: ''},
    },

    init() {
      this.videoTexture = null
      this.material = null
      this.mesh = null
      this.maskTexture = null
      this.maskRequest = 0
      this.onMetadata = this.updateTextureCover.bind(this)
    },

    update(oldData = {}) {
      const THREE = window.AFRAME.THREE
      const video = this.data.video
      if (!THREE || !video) return

      if (!this.videoTexture || this.videoTexture.image !== video) {
        oldData.video?.removeEventListener('loadedmetadata', this.onMetadata)
        oldData.video?.removeEventListener('resize', this.onMetadata)
        this.videoTexture?.dispose?.()
        this.videoTexture = new THREE.VideoTexture(video)
        this.videoTexture.minFilter = THREE.LinearFilter
        this.videoTexture.magFilter = THREE.LinearFilter
        this.videoTexture.format = THREE.RGBAFormat
        this.videoTexture.generateMipmaps = false
        if ('colorSpace' in this.videoTexture && THREE.SRGBColorSpace) {
          this.videoTexture.colorSpace = THREE.SRGBColorSpace
        } else if ('encoding' in this.videoTexture && THREE.sRGBEncoding) {
          this.videoTexture.encoding = THREE.sRGBEncoding
        }
      }

      if (!this.material) {
        this.material = new THREE.MeshBasicMaterial({
          map: this.videoTexture,
          side: THREE.DoubleSide,
          transparent: true,
          alphaTest: 0.01,
        })
      } else {
        this.material.map = this.videoTexture
        this.material.needsUpdate = true
      }

      const {width, height} = getVideoSurfaceSize(this.data, this.data.width, this.data.height)
      const geometry = new THREE.PlaneGeometry(width, height)
      if (!this.mesh) {
        this.mesh = new THREE.Mesh(geometry, this.material)
        this.el.setObject3D('mesh', this.mesh)
      } else {
        this.mesh.geometry?.dispose?.()
        this.mesh.geometry = geometry
      }

      video.removeEventListener('loadedmetadata', this.onMetadata)
      video.addEventListener('loadedmetadata', this.onMetadata)
      // Recalculate if the decoded dimensions change after metadata (for
      // example, when switching from a landscape source to a portrait one).
      video.removeEventListener('resize', this.onMetadata)
      video.addEventListener('resize', this.onMetadata)
      this.updateTextureCover()
      if (['maskUrl', 'maskMode', 'shape', 'width', 'height'].some(key => oldData[key] !== this.data[key])) {
        this.updateMask()
      }
    },

    updateMask() {
      const THREE = window.AFRAME.THREE
      const request = ++this.maskRequest
      this.maskTexture?.dispose?.()
      this.maskTexture = null
      this.material.alphaMap = null
      const hasMask = this.data.maskUrl || this.data.shape
      this.material.opacity = hasMask ? 0 : 1
      this.material.needsUpdate = true
      if (!hasMask) return

      prepareVideoMask(this.data).then((canvas) => {
        if (request !== this.maskRequest) return
        this.maskTexture = new THREE.CanvasTexture(canvas)
        this.maskTexture.minFilter = THREE.LinearFilter
        this.maskTexture.magFilter = THREE.LinearFilter
        this.maskTexture.generateMipmaps = false
        this.material.alphaMap = this.maskTexture
        this.material.opacity = 1
        this.material.needsUpdate = true
      }).catch((error) => {
        if (request !== this.maskRequest) return
        console.error('[magic] Could not load video mask:', error)
        this.el.emit('magicvideomaskerror', {error})
      })
    },

    updateTextureCover() {
      const video = this.data.video
      if (!video?.videoWidth || !video?.videoHeight || !this.videoTexture) return

      const sourceAspect = video.videoWidth / video.videoHeight
      const {width, height} = getVideoSurfaceSize(this.data, this.data.width, this.data.height)
      const targetAspect = width / height
      const {repeatX, repeatY, offsetX, offsetY} = getCoverTextureTransform(sourceAspect, targetAspect)
      this.videoTexture.repeat.set(repeatX, repeatY)
      this.videoTexture.offset.set(offsetX, offsetY)
      this.videoTexture.needsUpdate = true
    },

    remove() {
      this.maskRequest += 1
      this.data.video?.removeEventListener('loadedmetadata', this.onMetadata)
      this.data.video?.removeEventListener('resize', this.onMetadata)
      this.el.removeObject3D('mesh')
      this.mesh?.geometry?.dispose?.()
      this.material?.dispose?.()
      this.videoTexture?.dispose?.()
      this.maskTexture?.dispose?.()
    },
  })
}


module.exports = {registerMagicTargetVideoCover}
