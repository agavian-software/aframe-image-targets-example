const {getPhotoVideoPlacement} = require('../shared/video-reveal')
const {getBannerAnimation} = require('../banner-registry')
const {NewYear2027CountdownEffect} = require('./NewYear2027CountdownEffect')
const {DEFAULTS, normalizeOptions} = require('./timeline')

const ID = 'new-year-2027-countdown'
const COMPONENT = 'magic-new-year-2027-countdown'
const optionKeys = Object.keys(DEFAULTS).filter(key => !['width', 'pictureHeight'].includes(key) && !key.startsWith('bounds'))

const getNewYearOptions = options => {
  const normalized = normalizeOptions(options)
  return Object.fromEntries(optionKeys.map(key => [key, normalized[key]]))
}

const getEffectOptions = component => {
  const {bannerType, bannerDesignType, enabled} = component.data
  return {...component.data, message: component.el.getDOMAttribute(COMPONENT)?.text,
    enabled: enabled && getBannerAnimation(bannerType, bannerDesignType)?.id === ID}
}

const registerNewYear2027CountdownEffect = ({AFRAME, document}) => {
  if (!AFRAME || AFRAME.components[COMPONENT]) return
  const schema = {
    targetName: {default: ''}, text: {default: ''},
    bannerType: {default: '6'}, bannerDesignType: {type: 'int', default: 1},
  }
  for (const [key, value] of Object.entries(DEFAULTS)) schema[key] = {default: value}

  AFRAME.registerComponent(COMPONENT, {
    schema,
    init() {
      this.effect = new NewYear2027CountdownEffect({THREE: AFRAME.THREE, document, ...getEffectOptions(this)})
      this.el.setObject3D(COMPONENT, this.effect.group)
      this.scene = this.el.sceneEl
      this.onFound = event => {
        if (event.detail?.name !== this.data.targetName) return
        this.effect.start()
        this.loadAssets()
      }
      this.onLost = event => {
        if (event.detail?.name === this.data.targetName) this.effect.reset()
      }
      this.scene.addEventListener('xrimagefound', this.onFound)
      this.scene.addEventListener('xrimagelost', this.onLost)
    },
    loadAssets() {
      if (!this.effect.options.enabled) return
      const pending = this.effect.load()
      if (this.assetsPromise === pending) return
      this.assetsPromise = pending
      pending.catch(error => {
        console.error('[magic] New Year countdown artwork could not load:', error)
        this.el.emit('newyearartworkerror', {error}, false)
      })
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const previous = this.effect.options
      this.effect.configure(getEffectOptions(this))
      const current = this.effect.options
      if (!this.assetsPromise || previous.enabled !== current.enabled || previous.assetBase !== current.assetBase) {
        this.loadAssets()
      }
    },
    tick(time, delta) { this.effect.update(delta / 1000) },
    remove() {
      this.scene.removeEventListener('xrimagefound', this.onFound)
      this.scene.removeEventListener('xrimagelost', this.onLost)
      this.effect.dispose()
      this.el.removeObject3D(COMPONENT)
    },
  })
}

module.exports = {NewYear2027CountdownEffect, registerNewYear2027CountdownEffect,
  getNewYearPlacement: getPhotoVideoPlacement, getNewYearOptions}
