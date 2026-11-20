const BALLOON_FILES = Object.freeze({
  left: '01_left_balloon_bouquet.webp',
  right: '02_right_balloon_bouquet.webp',
  center: '03_center_balloon_bouquet.webp',
  pink: '04_single_pink_balloon.webp',
  gold: '05_single_gold_balloon.webp',
  banner: '06_blank_name_banner.webp',
  trail: '07_golden_sparkle_trail.webp',
  burst: '08_balloon_confetti_burst.webp',
})
const cache = new Map()

// Per-file leases let optional features reuse existing textures without requesting
// the optional center bouquet or any hidden assets.
const acquireBalloonAssets = (THREE, document, base, maxSize, names) => {
  const entries = names.map((name) => {
    const url = `${base.replace(/\/$/, '')}/${BALLOON_FILES[name]}`
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
      Object.fromEntries(names.map((name, i) => [name, textures[i]]))),
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

module.exports = {BALLOON_FILES, acquireBalloonAssets}
