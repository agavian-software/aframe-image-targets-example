// Curved paper and ribbon strips share one instanced draw in A-Frame's renderer.
const PARTICLE_COUNT = 184
const RIBBON_COUNT = 36
const STRIP_SEGMENTS = 24
const COLORS = ['#e92245', '#f6be38', '#22bea9', '#497be0', '#9c58cb', '#fff4db']
const RIBBON_COLORS = ['#dc1230', '#f2243e', '#ae0926', '#ff354c']
const STOP_EVENTS = ['waiting', 'stalled', 'loadstart', 'emptied', 'error', 'abort']

const vertexShader = `
  attribute vec4 aSeed;
  attribute vec4 aStyle;
  attribute vec3 aColor;
  uniform float uTime;
  uniform vec2 uExtent;
  uniform float uViewportHeight;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vRibbon;
  varying float vAlpha;

  vec3 tumble(vec3 p, vec3 angles) {
    vec3 c = cos(angles);
    vec3 s = sin(angles);
    p.yz = mat2(c.x, -s.x, s.x, c.x) * p.yz;
    p.xz = mat2(c.y, -s.y, s.y, c.y) * p.xz;
    p.xy = mat2(c.z, -s.z, s.z, c.z) * p.xy;
    return p;
  }

  void main() {
    float unit = min(uExtent.x, uExtent.y);
    float ribbon = aStyle.x;
    float side = aStyle.y;
    float delay = aStyle.w * 0.55;
    float age = mod(max(0.0, uTime - delay), 5.8);
    float volley = floor(max(0.0, uTime - delay) / 5.8);
    // Change the fan and gusts with each volley instead of repeating two lanes.
    vec4 random = fract(aSeed + volley * vec4(0.382, 0.618, 0.237, 0.719));
    float lifetime = 3.8 + random.z * 1.6 + ribbon * 0.4;
    vec3 origin = vec3(side * uExtent.x * (0.32 + random.w * 0.20),
      -uExtent.y * (0.20 + random.z * 0.32), unit * 0.10);
    vec4 center = modelViewMatrix * vec4(origin, 1.0);
    float targetScale = length(modelViewMatrix[1].xyz);
    float worldUnit = unit * targetScale;

    // Horizontal momentum persists as the pieces fall. Independent wind and
    // turbulence spread them freely across the camera view, with no side walls.
    float dragX = 0.16 + random.z * 0.32;
    float dragY = 0.65 + random.w * 0.65;
    float travelX = (1.0 - exp(-dragX * age)) / dragX;
    float travelY = (1.0 - exp(-dragY * age)) / dragY;
    float velocityX = side * (-0.22 + random.x * 1.65);
    float velocityY = 1.4 + random.y * 1.85;
    float gravity = 1.35 + random.x * 0.85;
    float phase = random.w * 6.2831853;
    float gust = (random.z - 0.45) * 0.32 * age
      + (sin(age * 1.7 + phase) - sin(phase)) * 0.13
      + (sin(age * 3.1 + phase * 2.0) - sin(phase * 2.0)) * 0.055;
    center.x += worldUnit * (velocityX * travelX + gust);
    // Camera-space gravity stays downward even when the target is tilted.
    center.y += worldUnit * (velocityY * travelY - (gravity / dragY) * (age - travelY));
    center.z += worldUnit * (random.w * 0.12 * travelX);

    // Real geometry gives paper a bent surface and ribbons a curling silhouette.
    float cssPixel = 2.0 * max(0.01, -center.z) * uPixelRatio
      / (projectionMatrix[1][1] * uViewportHeight);
    float width = max(worldUnit * mix(0.023 + aStyle.z * 0.026, 0.016 + aStyle.z * 0.014, ribbon),
      cssPixel * mix(4.5, 3.2, ribbon));
    float stripLength = mix(width * (1.2 + random.y * 0.9), worldUnit * (0.23 + aStyle.z * 0.22), ribbon);
    float t = position.y;
    float curl = t * 6.2831853 * (1.0 + random.y * 0.65) + phase + age * 1.4;
    float radius = stripLength * 0.14;
    vec3 ribbonCenter = vec3(sin(curl) * radius, (t - 0.5) * stripLength, cos(curl) * radius);
    vec3 across = vec3(cos(curl), 0.0, -sin(curl));
    float curlRate = 6.2831853 * (1.0 + random.y * 0.65);
    vec3 tangent = vec3(cos(curl) * radius * curlRate, stripLength, -sin(curl) * radius * curlRate);
    vec3 ribbonNormal = normalize(cross(across, tangent));
    vec3 ribbonVertex = ribbonCenter + across * position.x * width * 0.5;
    float bend = t * 3.1415927 + phase + age * 2.0;
    vec3 paperVertex = vec3(position.x * width * 0.5, (t - 0.5) * stripLength, sin(bend) * width * 0.24);
    vec3 paperNormal = normalize(vec3(0.0, -cos(bend) * width * 0.24 * 3.1415927 / stripLength, 1.0));
    vec3 angles = aSeed.xyz * 6.2831853 + age * mix(1.0, 0.5, ribbon)
      * vec3(1.5 + random.x * 3.0, 0.8 + random.y * 3.5, -1.8 + random.z * 3.6);
    vec3 vertex = tumble(mix(paperVertex, ribbonVertex, ribbon), angles);
    vNormal = tumble(mix(paperNormal, ribbonNormal, ribbon), angles);
    gl_Position = projectionMatrix * (center + vec4(vertex, 0.0));
    vColor = aColor;
    vRibbon = ribbon;
    vAlpha = step(delay, uTime) * smoothstep(0.0, 0.06, age)
      * (1.0 - smoothstep(lifetime - 0.7, lifetime, age));
  }
`

const fragmentShader = `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vRibbon;
  varying float vAlpha;

  void main() {
    if (vAlpha < 0.02) discard;
    vec3 normal = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 light = normalize(vec3(-0.4, 0.7, 1.0));
    float diffuse = 0.48 + 0.52 * max(0.0, dot(normal, light));
    vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
    float sheen = pow(max(0.0, dot(normal, halfway)), mix(22.0, 60.0, vRibbon));
    vec3 color = vColor * diffuse + vec3(1.0, 0.88, 0.78) * sheen * mix(0.13, 0.48, vRibbon);
    gl_FragColor = vec4(color, vAlpha);
    #include <colorspace_fragment>
  }
`

const registerMagicTargetConfetti = (window) => {
  const AFRAME = window.AFRAME
  if (!AFRAME || AFRAME.components['magic-target-confetti']) return

  AFRAME.registerComponent('magic-target-confetti', {
    schema: {
      video: {type: 'selector'},
      width: {type: 'number', default: 1},
      height: {type: 'number', default: 1},
      enabled: {default: false},
    },

    init() {
      const THREE = AFRAME.THREE
      this.elapsed = 0
      this.buffering = false
      this.viewport = new THREE.Vector2()
      this.onPlaying = () => { this.buffering = false; this.syncVisibility() }
      this.onStopped = (event) => {
        this.buffering = true
        if (event.type === 'loadstart' || event.type === 'emptied') {
          this.elapsed = 0
          this.material.uniforms.uTime.value = 0
        }
        this.syncVisibility()
      }
      this.onPlaybackChange = () => this.syncVisibility()

      const seeds = new Float32Array(PARTICLE_COUNT * 4)
      const styles = new Float32Array(PARTICLE_COUNT * 4)
      const colors = new Float32Array(PARTICLE_COUNT * 3)
      const palette = COLORS.map(color => new THREE.Color(color))
      const ribbonPalette = RIBBON_COLORS.map(color => new THREE.Color(color))
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ribbon = i < RIBBON_COUNT
        seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
        styles.set([ribbon ? 1 : 0, i % 2 ? 1 : -1, Math.random(), Math.random()], i * 4)
        const color = ribbon ? ribbonPalette[i % ribbonPalette.length] : palette[i % palette.length]
        colors.set([color.r, color.g, color.b], i * 3)
      }

      const vertices = []
      const indices = []
      for (let i = 0; i <= STRIP_SEGMENTS; i++) {
        vertices.push(-1, i / STRIP_SEGMENTS, 0, 1, i / STRIP_SEGMENTS, 0)
        if (i < STRIP_SEGMENTS) {
          const start = i * 2
          indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2)
        }
      }
      this.geometry = new THREE.InstancedBufferGeometry()
      this.geometry.instanceCount = PARTICLE_COUNT
      this.geometry.setIndex(indices)
      this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3))
      this.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
      this.geometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(styles, 4))
      this.geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3))
      this.material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: {value: 0},
          uExtent: {value: new THREE.Vector2(1, 1)},
          uViewportHeight: {value: 1},
          uPixelRatio: {value: 1},
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      this.mesh = new THREE.Mesh(this.geometry, this.material)
      // Positions are calculated in the shader, outside the static geometry bounds.
      this.mesh.frustumCulled = false
      this.mesh.visible = false
      this.mesh.renderOrder = 10
      this.mesh.onBeforeRender = (renderer) => {
        renderer.getDrawingBufferSize(this.viewport)
        this.material.uniforms.uViewportHeight.value = this.viewport.y
        this.material.uniforms.uPixelRatio.value = renderer.getPixelRatio()
      }
      this.el.setObject3D('confetti', this.mesh)
    },

    update(oldData = {}) {
      if (oldData.video !== this.data.video) {
        this.bindVideo(oldData.video, false)
        this.bindVideo(this.data.video, true)
        this.buffering = false
      }
      this.material.uniforms.uExtent.value.set(
        Math.max(0.001, this.data.width), Math.max(0.001, this.data.height))
      this.syncVisibility()
    },

    bindVideo(video, bind) {
      if (!video) return
      const method = bind ? 'addEventListener' : 'removeEventListener'
      video[method]('playing', this.onPlaying)
      video[method]('pause', this.onPlaybackChange)
      video[method]('ended', this.onPlaybackChange)
      STOP_EVENTS.forEach(event => video[method](event, this.onStopped))
    },

    syncVisibility() {
      const video = this.data.video
      this.mesh.visible = Boolean(this.data.enabled && video && !video.paused &&
        !video.ended && !video.error && video.readyState >= 3 && !this.buffering)
    },

    tick(time, delta) {
      this.syncVisibility()
      if (!this.mesh.visible) return
      // Cap long frames after a background tab or tracking interruption.
      this.elapsed += Math.min(Math.max(delta || 0, 0), 50) / 1000
      this.material.uniforms.uTime.value = this.elapsed
    },

    remove() {
      this.bindVideo(this.data.video, false)
      this.el.removeObject3D('confetti')
      this.geometry.dispose()
      this.material.dispose()
    },
  })
}

module.exports = {registerMagicTargetConfetti}
