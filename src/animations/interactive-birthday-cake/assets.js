const CAKE_FILES = Object.freeze({
  cake: '01_birthday_cake_base.webp',
  lit: '02_single_candle_lit.webp',
  off: '03_single_candle_off.webp',
  flame: '04_flame_glow.webp',
  smoke: '05_smoke_puff.webp',
  ribbon: '06_blank_birthday_banner.webp',
  confetti: '07_confetti_burst.webp',
  fireworks: '08_fireworks_burst.webp',
  hearts: '09_floating_hearts.webp',
  balloons: '10_balloon_celebration.webp',
  ring: '11_golden_sparkle_ring.webp',
})
const cache = new Map()

const acquireCakeAssets = (THREE, document, base, maxSize, names) => {
  const entries = names.map((name) => {
    const url = `${base.replace(/\/$/, '')}/${CAKE_FILES[name]}`
    const key = `${url}|${maxSize}`
    let entry = cache.get(key)
    if (!entry) {
      entry = {key, users: 0}
      entry.promise = new Promise((resolve, reject) => {
        entry.texture = new THREE.TextureLoader().load(url, (texture) => {
          try {
            const image = texture.image
            const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
            if (scale < 1) {
              const canvas = document.createElement('canvas')
              canvas.width = Math.round(image.width * scale)
              canvas.height = Math.round(image.height * scale)
              canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
              texture.image = canvas
            }
            texture.colorSpace = THREE.SRGBColorSpace
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            texture.generateMipmaps = false
            texture.needsUpdate = true
            resolve(texture)
          } catch (error) { reject(error) }
        }, undefined, reject)
      })
      cache.set(key, entry)
    }
    entry.users++
    return entry
  })
  let released = false
  return {
    promise: Promise.all(entries.map(entry => entry.promise)).then(textures =>
      Object.fromEntries(names.map((name, index) => [name, textures[index]]))),
    release() {
      if (released) return
      released = true
      entries.forEach((entry) => {
        if (--entry.users) return
        cache.delete(entry.key)
        entry.promise.catch(() => {}).then(() => entry.texture.dispose())
      })
    },
  }
}

module.exports = {CAKE_FILES, acquireCakeAssets}
