const LOVE_LETTER_FILES = Object.freeze({
  closed: '01_love_envelope_closed.webp', open: '02_love_envelope_open.webp',
  letter: '03_blank_love_letter.webp', leftWing: '04_left_envelope_wing.webp',
  rightWing: '05_right_envelope_wing.webp', petal: '06_single_rose_petal.webp',
  seal: '07_ruby_heart_seal.webp', heart: '08_golden_heart_sparkle.webp',
  burst: '09_rose_petal_burst.webp', hearts: '10_floating_hearts.webp',
  fireworks: '11_romantic_fireworks.webp', sparkles: '12_golden_sparkles.webp',
})
const cache = new Map()

const acquireLoveLetterAssets = (THREE, document, base, maxSize, names) => {
  const entries = names.map((name) => {
    const url = `${base.replace(/\/$/, '')}/${LOVE_LETTER_FILES[name]}`
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

module.exports = {LOVE_LETTER_FILES, acquireLoveLetterAssets}
