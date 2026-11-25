import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Ink-wash ACES Tone Mapping + Split Toning + Rice-Paper Grain & Vignette
const InkGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uExposure: { value: 1.08 },
    uVignette: { value: 0.38 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uExposure;
    uniform float uVignette;
    varying vec2 vUv;

    vec3 acesFilm(vec3 x) {
      float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec3 raw = texture2D(tDiffuse, vUv).rgb;
      if (!(raw.r >= 0.0) || !(raw.g >= 0.0) || !(raw.b >= 0.0)) raw = vec3(0.05, 0.08, 0.10);
      vec3 col = clamp(raw, 0.0, 16.0) * uExposure;
      col = acesFilm(col);

      // Split toning: cool teal-indigo shadows, warm parchment highlights
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.92, 0.99, 1.06);
      vec3 highTint   = vec3(1.04, 1.00, 0.93);
      col *= mix(shadowTint, highTint, smoothstep(0.15, 0.85, lum));

      // Gentle ink vignette
      vec2 d = vUv - 0.5;
      float vig = 1.0 - dot(d, d) * uVignette * 2.2;
      col *= clamp(vig, 0.45, 1.0);

      // Subtle rice-paper / film grain
      float grain = (hash(vUv * 512.0 + fract(uTime * 0.1)) - 0.5) * 0.022;
      col += grain;

      // Linear to sRGB
      col = pow(max(col, 0.0), vec3(1.0 / 2.2));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPostFX(renderer, scene, camera) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    samples: 4,
  });

  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.55, 0.92);
  composer.addPass(bloom);

  const gradePass = new ShaderPass(InkGradeShader);
  composer.addPass(gradePass);

  return {
    composer,
    bloom,
    gradePass,
    resize(nw, nh) {
      composer.setSize(nw, nh);
      bloom.setSize(nw, nh);
    },
    render(t) {
      gradePass.uniforms.uTime.value = t;
      composer.render();
    },
  };
}
