import * as THREE from 'three';

// Deterministic value noise for mountain terrain & shaders
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function smoothNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x, z, octaves = 4) {
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * smoothNoise(x * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return v;
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Smooth union of walkable zones (South Gate -> Miasma Valley -> Boss Bone Altar)
export function walkableSDF(x, z) {
  const d1 = Math.hypot((x - 0) / 1.1, (z - 26) / 1.0) - 11.5;   // 山門殘碑
  const d2 = Math.hypot((x + 2) / 1.2, (z - 2) / 1.2) - 15.0;    // 瘴氣藥谷
  const d3 = Math.hypot((x - 0) / 1.15, (z + 28) / 1.15) - 14.5; // 煉毒骨壇
  // Connecting paths
  const p1 = Math.hypot(x + 1.0 * Math.sin(z * 0.1), Math.max(0, Math.abs(z - 14) - 12)) - 5.2;
  const p2 = Math.hypot(x - 1.2 * Math.sin(z * 0.12), Math.max(0, Math.abs(z + 15) - 13)) - 5.0;

  const smin = (a, b, k = 4.5) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  };
  let d = smin(d1, d2, 5.0);
  d = smin(d, d3, 5.0);
  d = smin(d, p1, 3.5);
  d = smin(d, p2, 3.5);
  // Add organic edge noise so arenas are never rigid circles
  d += (fbm(x * 0.08, z * 0.08, 3) - 0.5) * 3.2;
  return d;
}

export function getHeight(x, z) {
  const sdf = walkableSDF(x, z);
  // Base gentle undulation inside walkable area
  const micro = (fbm(x * 0.07 + 4.1, z * 0.07 - 2.3, 4) - 0.5) * 1.15;
  // Slight terrace rise toward the northern Boss Altar
  const terrace = smoothstep(10, -24, z) * 1.6;
  // Shallow wet mirror basin in the middle of Miasma Valley
  const poolDist = Math.hypot(x + 3.5, z - 1.5);
  const poolDip = (1 - smoothstep(2.5, 9.5, poolDist)) * 0.85;

  // Surrounding mountain cliffs outside walkable SDF
  const rim = smoothstep(-1.5, 16.0, sdf);
  const cliffNoise = fbm(x * 0.045, z * 0.045, 4) * 16.0 + fbm(x * 0.14, z * 0.14, 2) * 3.2;
  const cliff = rim * (4.5 + cliffNoise);

  return terrace + micro - poolDip + cliff;
}

export function getZoneName(z) {
  if (z > 14) return '屍骨山・山門殘碑';
  if (z > -15) return '屍骨山・瘴氣藥谷';
  return '屍骨山・煉毒骨壇';
}

export function createTerrain(scene) {
  const size = 180;
  const segs = 220;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, getHeight(x, z));
  }
  geo.computeVertexNormals();

  // Custom Ink-Wash Mountain Terrain Material (using MeshStandardMaterial + onBeforeCompile for shadows & PBR lighting)
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.06,
  });

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;
         varying vec3 vWorldNorm;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vec4 wp = modelMatrix * vec4(transformed, 1.0);
         vWorldPos = wp.xyz;
         vWorldNorm = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vWorldPos;
         varying vec3 vWorldNorm;
         float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float tNoise(vec2 p) {
           vec2 i = floor(p), f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           return mix(mix(tHash(i), tHash(i + vec2(1,0)), f.x),
                      mix(tHash(i + vec2(0,1)), tHash(i + vec2(1,1)), f.x), f.y);
         }
         float tFbm(vec2 p) {
           float v = 0.0, a = 0.5;
           for (int i = 0; i < 4; i++) { v += a * tNoise(p); p *= 2.04; a *= 0.5; }
           return v;
         }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float n1 = tFbm(vWorldPos.xz * 0.11);
         float n2 = tFbm(vWorldPos.xz * 0.42 + 7.3);
         float slope = clamp(vWorldNorm.y, 0.0, 1.0);

         // Classical Chinese ink-wash earth palette: slate stone, withered moss, ochre earth
         vec3 slateRock = vec3(0.10, 0.13, 0.15);
         vec3 mossEarth = vec3(0.14, 0.18, 0.14);
         vec3 ochrePath = vec3(0.22, 0.19, 0.15);
         vec3 moonAsh   = vec3(0.56, 0.62, 0.63);

         // Base soil vs moss
         vec3 col = mix(ochrePath, mossEarth, smoothstep(0.32, 0.68, n1));
         // Steep cliffs show dark ink-slate rock with strata
         float rockMask = 1.0 - smoothstep(0.62, 0.88, slope);
         float strata = 0.82 + 0.36 * sin(vWorldPos.y * 2.4 + n1 * 4.5);
         col = mix(col, slateRock * strata, rockMask);

         // Thin patchy moon-ash / frost on flat dry areas (not in water basins or steep cliffs)
         float dryMask = smoothstep(-0.05, 0.45, vWorldPos.y);
         float ashNoise = tFbm(vWorldPos.xz * 0.18 + vec2(3.1, -5.2));
         float ashMask = smoothstep(0.56, 0.78, ashNoise) * smoothstep(0.78, 0.94, slope) * dryMask * 0.42;
         col = mix(col, moonAsh, ashMask);

         // Wet darkening near shallow valley mirror pool
         float wetMask = 1.0 - smoothstep(-0.35, 0.25, vWorldPos.y);
         col *= mix(1.0, 0.52, wetMask);

         // Subtle ink grain detail
         col *= 0.88 + 0.24 * n2;
         diffuseColor.rgb *= col;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         float wMask = 1.0 - smoothstep(-0.35, 0.2, vWorldPos.y);
         roughnessFactor = mix(roughnessFactor, 0.14, wMask);`
      );
  };

  const terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // Shallow reflective water / miasma mirror in the valley basin
  const waterGeo = new THREE.CircleGeometry(10.5, 48);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x162930,
    roughness: 0.08,
    metalness: 0.72,
    transparent: true,
    opacity: 0.78,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.set(-3.5, -0.22, 1.5);
  water.receiveShadow = true;
  scene.add(water);

  return { terrainMesh, water };
}
