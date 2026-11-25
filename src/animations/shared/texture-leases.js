const createTextureAcquirer = files => {
  const caches = new WeakMap()
  return (THREE, base) => {
    let cache = caches.get(THREE)
    if (!cache) caches.set(THREE, cache = new Map())
    let entry = cache.get(base)
    if (!entry) {
      const loader = new THREE.TextureLoader()
      const textures = {}
      const loads = Object.entries(files).map(([name, file]) => new Promise((resolve, reject) => {
        loader.load(`${base}/${file}`, texture => {
          texture.colorSpace = THREE.SRGBColorSpace
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.generateMipmaps = false
          textures[name] = texture
          resolve()
        }, undefined, reject)
      }))
      entry = {users: 0, textures, settled: Promise.allSettled(loads), promise: Promise.all(loads).then(() => textures)}
      cache.set(base, entry)
    }
    entry.users++
    let released = false
    return {
      promise: entry.promise,
      release() {
        if (released) return
        released = true
        if (--entry.users) return
        cache.delete(base)
        entry.settled.then(() => Object.values(entry.textures).forEach(texture => texture.dispose()))
      },
    }
  }
}

module.exports = {createTextureAcquirer}
