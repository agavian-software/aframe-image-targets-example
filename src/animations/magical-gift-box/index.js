const {getBannerAnimation} = require('../banner-registry')
const {getPhotoVideoPlacement, setTargetVideoOpacity} = require('../shared/video-reveal')
const {MagicalGiftBoxEffect, DEFAULTS, normalizeOptions} = require('./MagicalGiftBoxEffect')

const getGiftBoxPlacement = (size, properties, video) => {
  const {componentOptions: {pictureHeight, boundsTop}, ...placement} = getPhotoVideoPlacement(size, properties, video)
  return {...placement, componentOptions: {pictureHeight, boundsTop}}
}

const getInitialVideoOpacity = options => normalizeOptions(options).enabled ? 0 : 1

// Only supported settings enter the component; API options cannot replace the
// selected design, target name, artwork paths, measured width, or personalized text.
const getGiftBoxOptions = (options = {}) => {
  const result = {}
  for (const name of ['duration', 'size', 'offsetX', 'offsetY', 'sparkleColor', 'heartColor',
    'textColor', 'particleCount', 'maxTextureSize']) {
    if (options[name] !== undefined) result[name] = options[name]
  }
  if (options.enabled !== undefined) result.enabled = normalizeOptions(options).enabled
  const name = [options.name, options.recipientName].find(value => typeof value === 'string' && value.trim())
  if (name) result.name = name.trim()
  return result
}

const registerMagicalGiftBoxEffect = (window) => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-gift-box']) return
  AFRAME.registerComponent('magic-gift-box', {
    schema: {
      targetName: {default: ''}, width: {type: 'number', default: 1},
      text: {default: DEFAULTS.text}, enabled: {default: true},
      name: {default: DEFAULTS.name},
      pictureHeight: {type: 'number', default: DEFAULTS.pictureHeight},
      boundsTop: {type: 'number', default: DEFAULTS.boundsTop},
      bannerType: {default: '0'}, bannerDesignType: {type: 'int', default: 1},
      assetBase: {default: DEFAULTS.assetBase},
      duration: {type: 'number', default: DEFAULTS.duration},
      size: {type: 'number', default: DEFAULTS.size},
      offsetX: {type: 'number', default: DEFAULTS.offsetX},
      offsetY: {type: 'number', default: DEFAULTS.offsetY},
      sparkleColor: {type: 'color', default: DEFAULTS.sparkleColor},
      heartColor: {type: 'color', default: DEFAULTS.heartColor},
      textColor: {type: 'color', default: DEFAULTS.textColor},
      particleCount: {type: 'int', default: DEFAULTS.particleCount},
      maxTextureSize: {type: 'int', default: DEFAULTS.maxTextureSize},
    },

    init() {
      this.effect = new MagicalGiftBoxEffect({
        THREE: AFRAME.THREE, document: window.document, parent: this.el.object3D,
        ...this.data, enabled: false,
        onVideoOpacity: opacity => setTargetVideoOpacity(this.el, opacity),
        onVideoReady: () => this.el.emit('magicvideorevealready', {targetName: this.data.targetName}, false),
      })
      this.el.setObject3D('magical-gift-box', this.effect.group)
      this.onFound = (event) => {
        if (event.detail?.name !== this.data.targetName) return
        this.effect.start()
        this.bindInteraction()
      }
      this.onLost = (event) => {
        if (event.detail?.name === this.data.targetName) this.effect.reset()
      }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },

    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'magical-gift-box'
      this.effect.configure({...this.data, enabled: this.data.enabled && supported})
      if (this.effect.options.enabled && !this.assetsReady) {
        this.assetsReady = this.effect.load().catch((error) => {
          if (this.effect.disposed) return
          console.error('[magic] Gift artwork could not load:', error)
          this.el.emit('giftboxerror', {error})
        })
      }
      this.bindInteraction()
    },

    bindInteraction() {
      const scene = this.el.sceneEl
      const element = scene.canvas || scene.renderer?.domElement
      if (element && this.effect.interaction?.element !== element) {
        this.effect.attachInteraction({element, getCamera: () => scene.camera,
          allowed: () => scene.isPlaying !== false && window.document.querySelector('#videoPlayer')?.hidden !== false})
      }
    },
    tick(time, delta) {
      this.bindInteraction()
      this.effect.update(delta / 1000)
    },
    pause() { this.effect?.interaction?.reset() },

    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose()
      this.el.removeObject3D('magical-gift-box')
    },
  })
}

module.exports = {MagicalGiftBoxEffect, getGiftBoxPlacement, getGiftBoxOptions, getInitialVideoOpacity, registerMagicalGiftBoxEffect}
