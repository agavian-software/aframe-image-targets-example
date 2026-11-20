const {getTargetVideoLayout} = require('../../target-size')
const {getBannerAnimation} = require('../banner-registry')
const {MagicalGiftBoxEffect, DEFAULTS} = require('./MagicalGiftBoxEffect')

const getGiftBoxPlacement = (targetSize, properties, videoLayout) => {
  const picture = getTargetVideoLayout({}, targetSize, properties, 1)
  return {
    x: picture.x,
    y: Math.min(picture.y - picture.height / 2, videoLayout.y - videoLayout.height / 2),
    width: Math.max(picture.width, videoLayout.width),
  }
}

// Only supported settings enter the component; API options cannot replace the
// selected design, target name, artwork paths, measured width, or personalized text.
const getGiftBoxOptions = (options = {}) => {
  const result = {}
  for (const name of ['duration', 'size', 'offsetX', 'offsetY', 'sparkleColor', 'heartColor',
    'textColor', 'particleCount', 'maxTextureSize']) {
    if (options[name] !== undefined) result[name] = options[name]
  }
  return result
}

const registerMagicalGiftBoxEffect = (window) => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-gift-box']) return
  AFRAME.registerComponent('magic-gift-box', {
    schema: {
      targetName: {default: ''}, width: {type: 'number', default: 1},
      text: {default: DEFAULTS.text}, enabled: {default: true},
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
      })
      this.el.setObject3D('magical-gift-box', this.effect.group)
      this.onFound = (event) => {
        if (event.detail?.name === this.data.targetName) this.effect.start()
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
      this.assetsReady = this.effect.load().catch((error) => {
        if (this.effect.disposed) return
        console.error('[magic] Gift artwork could not load:', error)
        this.el.emit('giftboxerror', {error})
      })
    },

    tick(time, delta) { this.effect.update(delta / 1000) },

    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose()
      this.el.removeObject3D('magical-gift-box')
    },
  })
}

module.exports = {MagicalGiftBoxEffect, getGiftBoxPlacement, getGiftBoxOptions, registerMagicalGiftBoxEffect}
