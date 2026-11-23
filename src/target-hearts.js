const HEART_COUNT = 36
const BURST_SPARKS = 8
const PARTS_PER_HEART = BURST_SPARKS + 2
const COLORS = ['#ff477e', '#ff74ad', '#ed285c', '#ffafcf']

// A heart, an expanding pop ring, and eight sparks share each bubble's clock.
const vertexShader = `
  attribute vec4 aSeed;
  attribute vec4 aStyle;
  attribute vec3 aColor;
  uniform float uTime;
  uniform vec2 uExtent;
  uniform float uViewportHeight;
  uniform float uPixelRatio;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind;
  varying float vAlpha;

  void main() {
    float unit = min(uExtent.x, uExtent.y);
    float riseTime = 3.6 + aSeed.z * 1.5;
    float cycle = riseTime + 1.2;
    float delay = aSeed.w * 3.5;
    float clock = max(0.0, uTime - delay);
    float age = mod(clock, cycle);
    float volley = floor(clock / cycle);
    vec4 random = fract(aSeed + volley * vec4(0.382, 0.618, 0.237, 0.719));
    float progress = clamp(age / riseTime, 0.0, 1.0);
    float pop = clamp((age - riseTime) / 0.55, 0.0, 1.0);
    float side = aStyle.y;
    vec3 origin = vec3(side * uExtent.x * (0.51 + random.x * 0.10),
      -uExtent.y * 0.42, unit * 0.12);
    vec4 center = modelViewMatrix * vec4(origin, 1.0);
    float targetScale = length(modelViewMatrix[1].xyz);
    float worldUnit = unit * targetScale;
    float phase = random.x * 6.2831853;
    // Drift in camera space so bubbles stay upright and rise when a target tilts.
    center.x += worldUnit * (side * progress * 0.12
      + (sin(progress * 5.0 + phase) - sin(phase)) * 0.045);
    center.y += uExtent.y * targetScale * (1.0 + random.y * 0.22) * progress;
    float cssPixel = 2.0 * max(0.01, -center.z) * uPixelRatio
      / (projectionMatrix[1][1] * uViewportHeight);
    float size = max(worldUnit * (0.075 + aStyle.w * 0.045), cssPixel * 14.0);
    float growth = mix(0.08, 1.0, smoothstep(0.0, 0.65, progress));
    float alpha = smoothstep(0.0, 0.15, age) * step(delay, uTime);
    float kind = aStyle.x;
    if (kind < 0.5) {
      size *= growth * (1.0 + 0.12 * smoothstep(0.9, 1.0, progress));
      alpha *= 1.0 - step(riseTime, age);
    } else {
      alpha *= step(riseTime, age) * (1.0 - smoothstep(0.08, 1.0, pop));
      if (kind < 1.5) {
        float angle = aStyle.z;
        center.xy += vec2(cos(angle), sin(angle)) * worldUnit * (0.02 + 0.14 * pop);
        size *= 0.22 * (1.0 - pop * 0.6);
      } else {
        size *= 1.0 + pop * 2.2;
        alpha *= 0.6;
      }
    }
    float angle = sin(progress * 4.0 + phase) * 0.12;
    vec2 point = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * position.xy;
    gl_Position = projectionMatrix * (center + vec4(point * size * 0.5, 0.0, 0.0));
    vUv = position.xy;
    vColor = aColor;
    vKind = kind;
    vAlpha = alpha;
  }
`

const fragmentShader = `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind;
  varying float vAlpha;

  void main() {
    if (vAlpha < 0.01) discard;
    vec2 p = vUv * 1.35;
    float alpha;
    vec3 color = vColor;
    if (vKind > 1.5) {
      float radius = length(vUv);
      alpha = smoothstep(0.68, 0.76, radius) * (1.0 - smoothstep(0.82, 0.9, radius));
      color = mix(color, vec3(1.0), 0.45);
    } else {
      // Implicit heart silhouette, with a soft rim and a glossy bubble highlight.
      p.y += 0.1;
      float base = dot(p, p) - 1.0;
      float heart = base * base * base - p.x * p.x * p.y * p.y * p.y;
      alpha = 1.0 - smoothstep(-0.008, 0.015, heart);
      float rim = smoothstep(-0.4, 0.0, heart);
      float shine = exp(-32.0 * dot(p - vec2(-0.36, 0.52), p - vec2(-0.36, 0.52)));
      color = mix(color * (0.85 + 0.15 * p.y), vec3(1.0, 0.9, 0.96), rim * 0.35 + shine * 0.8);
    }
    alpha *= vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`

const createHeartDecoration = (THREE) => {
  const count = HEART_COUNT * PARTS_PER_HEART
  const seeds = new Float32Array(count * 4)
  const styles = new Float32Array(count * 4)
  const colors = new Float32Array(count * 3)
  const palette = COLORS.map(color => new THREE.Color(color))
  for (let i = 0; i < HEART_COUNT; i++) {
    const seed = [Math.random(), Math.random(), Math.random(), Math.random()]
    const color = palette[i % palette.length]
    for (let part = 0; part < PARTS_PER_HEART; part++) {
      const offset = i * PARTS_PER_HEART + part
      const kind = part === 0 ? 0 : part === PARTS_PER_HEART - 1 ? 2 : 1
      seeds.set(seed, offset * 4)
      styles.set([kind, i % 2 ? 1 : -1, (part - 1) / BURST_SPARKS * Math.PI * 2, seed[2]], offset * 4)
      colors.set([color.r, color.g, color.b], offset * 3)
    }
  }
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.instanceCount = count
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
  ]), 3))
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
  geometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(styles, 4))
  geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3))
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: {value: 0}, uExtent: {value: new THREE.Vector2(1, 1)},
      uViewportHeight: {value: 1}, uPixelRatio: {value: 1},
    },
    vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  })
  return {geometry, material}
}

module.exports = {createHeartDecoration}
