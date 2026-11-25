const {getPhotoVideoPlacement: getHealingPlacement, setTargetVideoOpacity} = require('../shared/video-reveal')
const {getBannerAnimation} = require('../banner-registry')
const {BrokenHeartHealingEffect, DEFAULTS, normalizeOptions} = require('./BrokenHeartHealingEffect')

const COMPONENT = 'magic-broken-heart-healing'
const ASSET_BASE = './animations/broken-heart-healing/assets'
const getHealingOptions = options => {
  const normalized = normalizeOptions(options)
  const keys = Object.keys(DEFAULTS).filter(key =>
    !['message', 'width', 'pictureHeight'].includes(key) && !key.startsWith('bounds'))
  return {...Object.fromEntries(keys.map(key => [key, normalized[key]])),
    stitchingPath: JSON.stringify(normalized.stitchingPath)}
}

const getInitialVideoOpacity = options => normalizeOptions(options).enabled ? 0 : 1

const registerBrokenHeartHealingEffect = window => {
  const {AFRAME, document} = window
  if (!AFRAME || AFRAME.components[COMPONENT]) return
  const schema = {
    targetName: {default: ''}, text: {default: DEFAULTS.message},
    bannerType: {default: '3'}, bannerDesignType: {type: 'int', default: 0}, assetBase: {default: ASSET_BASE},
  }
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (key !== 'message') schema[key] = {default: value}
  }

  AFRAME.registerComponent(COMPONENT, {
    schema,
    init() {
      this.effect = new BrokenHeartHealingEffect({
        THREE: AFRAME.THREE, document, ...this.data, message: this.data.text,
        onVideoOpacity: opacity => setTargetVideoOpacity(this.el, opacity),
        onVideoReady: () => this.el.emit('magicvideorevealready', {targetName: this.data.targetName}, false),
      })
      this.el.setObject3D(COMPONENT, this.effect.group)
      this.onFound = event => {
        if (event.detail?.name === this.data.targetName) this.effect.start()
      }
      this.onLost = event => {
        if (event.detail?.name === this.data.targetName) this.effect.reset()
      }
      this.el.sceneEl.addEventListener('xrimagefound', this.onFound)
      this.el.sceneEl.addEventListener('xrimagelost', this.onLost)
    },
    update(oldData = {}) {
      if (oldData.targetName !== undefined && oldData.targetName !== this.data.targetName) this.effect.reset()
      const supported = getBannerAnimation(this.data.bannerType, this.data.bannerDesignType)?.id === 'broken-heart-healing'
      this.effect.configure({...this.data, message: this.data.text, enabled: this.data.enabled && supported})
      if (this.effect.options.enabled && !this.assetsReady) {
        this.assetsReady = this.effect.load().catch(error => {
          console.error('[magic] Broken heart artwork could not load:', error)
          this.el.emit('brokenhearthealingerror', {error})
        })
      }
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

module.exports = {BrokenHeartHealingEffect, registerBrokenHeartHealingEffect, getHealingPlacement,
  getHealingOptions, getInitialVideoOpacity}
