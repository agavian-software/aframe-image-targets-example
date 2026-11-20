const WHITE = {r: 1, g: 1, b: 1}

// One draw call per texture, including all copies of each single balloon and the
// complete dynamic letter atlas. Bounds stay in the tracked anchor's coordinates.
class SpriteBatch {
  constructor(THREE, group, texture, capacity, clip, order, additive = false) {
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setIndex([0, 1, 2, 2, 1, 3])
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0,
    ]), 3))
    this.attributes = {}
    for (const [name, size] of [['aCenter', 3], ['aSize', 2], ['aRotation', 1], ['aAlpha', 1], ['aUv', 4], ['aColor', 3]]) {
      const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size)
      attribute.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute(name, attribute)
      this.attributes[name] = attribute
    }
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
      uniforms: {uMap: {value: texture}, uToAnchor: clip.matrix, uBounds: clip.bounds},
      vertexShader: `
        attribute vec3 aCenter, aColor;
        attribute vec2 aSize;
        attribute vec4 aUv;
        attribute float aRotation, aAlpha;
        uniform mat4 uToAnchor;
        varying vec2 vUv, vAnchor;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float c = cos(aRotation), s = sin(aRotation);
          vec2 p = mat2(c, s, -s, c) * (position.xy * aSize);
          vec3 transformed = aCenter + vec3(p, 0.0);
          vUv = aUv.xy + (position.xy + 0.5) * aUv.zw;
          vAnchor = (uToAnchor * modelMatrix * vec4(transformed, 1.0)).xy;
          vColor = aColor;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec4 uBounds;
        varying vec2 vUv, vAnchor;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          if (vAnchor.x > uBounds.x && vAnchor.x < uBounds.z &&
              vAnchor.y > uBounds.y && vAnchor.y < uBounds.w) discard;
          vec4 color = texture2D(uMap, vUv);
          color.a *= vAlpha;
          if (color.a < 0.012) discard;
          gl_FragColor = vec4(color.rgb * vColor, color.a);
          #include <colorspace_fragment>
        }`,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = order
    this.mesh.visible = false
    group.add(this.mesh)
  }

  set(index, {x = 0, y = 0, z = 0, width, height, rotation = 0, alpha = 1, uv = [0, 0, 1, 1], color = WHITE}) {
    const a = this.attributes
    a.aCenter.setXYZ(index, x, y, z)
    a.aSize.setXY(index, width, height)
    a.aRotation.setX(index, rotation)
    a.aAlpha.setX(index, alpha)
    a.aUv.setXYZW(index, ...uv)
    a.aColor.setXYZ(index, color.r, color.g, color.b)
  }

  commit(count) {
    this.mesh.geometry.instanceCount = count
    this.mesh.visible = count > 0
    Object.values(this.attributes).forEach(attribute => { attribute.needsUpdate = true })
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.mesh.removeFromParent()
  }
}

module.exports = {SpriteBatch}
