const FAIRY_FILES = Object.freeze({
  flying: '01_fairy_flying.webp', hover: '02_fairy_hover.webp',
  leftWing: '03_left_fairy_wing.webp', rightWing: '04_right_fairy_wing.webp',
  wand: '05_star_wand.webp', trail: '06_magic_spark_trail.webp',
  burst: '07_magic_burst.webp', stars: '08_star_sparkles.webp',
  ribbon: '09_blank_message_ribbon.webp',
})
const cache = new Map()

const acquireFairyAssets = (THREE, document, base, maxSize, names) => {
  const entries = names.map((name) => {
    const url = `${base.replace(/\/$/, '')}/${FAIRY_FILES[name]}`
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

module.exports = {FAIRY_FILES, acquireFairyAssets}
