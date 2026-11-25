const {getPhotoVideoPlacement} = require('../shared/video-reveal')
const {getBannerAnimation} = require('../banner-registry')
const {SantaFlyingReindeerEffect} = require('./SantaFlyingReindeerEffect')
const {ASSET_BASE} = require('./assets')
const {DEFAULTS, normalizeOptions} = require('./timeline')

const ID = 'santa-flying-reindeer'
const COMPONENT = 'magic-santa-flying-reindeer'
const optionKeys = Object.keys(DEFAULTS).filter(key =>
  !['message', 'width', 'pictureHeight'].includes(key) && !key.startsWith('bounds'))

const getSantaOptions = options => {
  const normalized = normalizeOptions(options)
  return Object.fromEntries(optionKeys.map(key => [key, normalized[key]]))
}

const registerSantaFlyingReindeerEffect = ({AFRAME, document}) => {
  if (!AFRAME || AFRAME.components[COMPONENT]) return
  const schema = {
    targetName: {default: ''}, text: {default: DEFAULTS.message}, assetBase: {default: ASSET_BASE},
    bannerType: {default: '6'}, bannerDesignType: {type: 'int', default: 1},
  }
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (key === 'message') continue
    schema[key] = typeof value === 'number' ? {type: 'number', default: value} : {default: value}
  }

  AFRAME.registerComponent(COMPONENT, {
    schema,
    init() {
      this.effect = new SantaFlyingReindeerEffect({THREE: AFRAME.THREE, document,
        ...this.data, message: this.data.text})
      this.el.setObject3D(COMPONENT, this.effect.group)
      this.onFound = event => {
        if (event.detail?.name !== this.data.targetName) return
        this.effect.start()
        this.loadAssets()
      }
      this.onLost = event => {
        if (event.detail?.name === this.data.targetName) this.effect.reset()
      }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },
    loadAssets() {
      if (!this.effect.options.enabled) return
      const pending = this.effect.load()
      if (this.assetsPromise === pending) return
      this.assetsPromise = pending
      pending.catch(error => {
        console.error('[magic] Santa artwork could not load:', error)
        this.el.emit('santaartworkerror', {error}, false)
      })
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === ID
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported})
      this.loadAssets()
    },
    tick(time, delta) { this.effect.update(delta / 1000) },
    remove() {
      this.el.sceneEl.removeEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose()
      this.el.removeObject3D(COMPONENT)
    },
  })
}

module.exports = {SantaFlyingReindeerEffect, registerSantaFlyingReindeerEffect,
  getSantaPlacement: getPhotoVideoPlacement, getSantaOptions}
