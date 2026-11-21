const {getTargetVideoLayout} = require('../../target-size')
const {getBannerAnimation} = require('../banner-registry')
const {MagicalWeddingFlowerArchEffect, DEFAULTS, normalizeOptions} = require('./MagicalWeddingFlowerArchEffect')
const getFlowerArchPlacement = (targetSize, properties, video) => {
  const picture = getTargetVideoLayout({}, targetSize, properties, 1)
  const left = Math.min(picture.x - picture.width / 2, video.x - video.width / 2)
  const right = Math.max(picture.x + picture.width / 2, video.x + video.width / 2)
  const top = Math.max(picture.y + picture.height / 2, video.y + video.height / 2)
  const bottom = Math.min(picture.y - picture.height / 2, video.y - video.height / 2)
  return {x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, componentOptions: {pictureHeight: top - bottom}}
}
const getFlowerArchOptions = (options = {}) => {
  const result = {}
  for (const key of Object.keys(DEFAULTS)) {
    if (!['message', 'width', 'pictureHeight', 'assetBase'].includes(key) && options[key] !== undefined) result[key] = options[key]
  }
  return result
}
const getInitialVideoOpacity = options => {
  const o = normalizeOptions(options)
  return o.enabled ? o.closedVideoOpacity : 1
}
const registerMagicalWeddingFlowerArchEffect = window => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-wedding-flower-arch']) return
  const schema = {targetName: {default: ''}, text: {default: DEFAULTS.message}, bannerType: {default: '2'}, bannerDesignType: {type: 'int', default: 1}}
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (key === 'message') continue
    schema[key] = {default: value}
    if (typeof value === 'number') schema[key].type = ['anniversaryNumber', 'particleCount', 'petalCount', 'maxTextureSize'].includes(key) ? 'int' : 'number'
  }
  AFRAME.registerComponent('magic-wedding-flower-arch', {
    schema,
    init() {
      this.effect = new MagicalWeddingFlowerArchEffect({THREE: AFRAME.THREE, document: window.document,
        parent: this.el.object3D, ...this.data, message: this.data.text, onVideoOpacity: opacity => {
          const plane = this.el.parentElement?.querySelector('.magic-video-plane'), cover = plane?.components?.['magic-target-video-cover']
          if (cover) cover.setRevealOpacity(opacity)
          else if (plane) plane.setAttribute('magic-target-video-cover', 'revealOpacity', opacity)
        }})
      this.el.setObject3D('magical-wedding-flower-arch', this.effect.group)
      this.onFound = event => {
        if (event.detail?.name !== this.data.targetName) return
        this.effect.start(); this.loadAssets()
      }
      this.onLost = event => { if (event.detail?.name === this.data.targetName) this.effect.reset() }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },
    loadAssets() {
      const loading = this.effect.load()
      if (this.assetsPromise === loading) return
      this.assetsPromise = loading
      this.assetsReady = loading.catch(error => {
        if (this.effect.disposed) return
        console.error('[magic] Wedding arch artwork could not load:', error); this.el.emit('weddingarcherror', {error})
      })
    },
    bindInteraction() {
      const scene = this.el.sceneEl, element = scene.canvas || scene.renderer?.domElement
      if (element) this.effect.attachInteraction({element, getCamera: () => scene.camera,
        allowed: () => scene.isPlaying !== false && window.document.querySelector('#videoPlayer')?.hidden !== false})
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'magical-wedding-flower-arch'
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported}); this.loadAssets(); this.bindInteraction()
    },
    tick(time, delta) { this.bindInteraction(); this.effect.update(delta / 1000) },
    pause() { this.effect?.interaction?.reset() },
    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound); this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose(); this.el.removeObject3D('magical-wedding-flower-arch')
    },
  })
}
module.exports = {MagicalWeddingFlowerArchEffect, getFlowerArchPlacement, getFlowerArchOptions, getInitialVideoOpacity, registerMagicalWeddingFlowerArchEffect}
