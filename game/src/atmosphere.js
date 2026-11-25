import * as THREE from 'three';
import { getHeight, walkableSDF, fbm } from './terrain.js';

export function createAtmosphere(scene) {
  // Exponential ink-wash teal-indigo mist
  scene.fog = new THREE.FogExp2(0x132028, 0.0155);

  // 1. Ink-wash Night Sky Dome
  const skyGeo = new THREE.SphereGeometry(260, 32, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x070e15) },
      uMid: { value: new THREE.Color(0x14242d) },
      uHoriz: { value: new THREE.Color(0x283e46) },
      uMoonDir: { value: new THREE.Vector3(-0.26, 0.21, -0.94).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop, uMid, uHoriz, uMoonDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(uHoriz, uMid, smoothstep(0.0, 0.28, h));
        col = mix(col, uTop, smoothstep(0.24, 0.78, h));
        // Soft moonlight atmospheric scatter around the moon
        float mDot = max(dot(normalize(vDir), uMoonDir), 0.0);
        col += vec3(0.42, 0.56, 0.60) * pow(mDot, 14.0) * 0.45;
        col += vec3(0.95, 0.98, 0.92) * smoothstep(0.9965, 0.9985, mDot) * 2.2;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // 2. Layered Ink-Wash Distant Mountain Silhouettes (Xuan-Yuan Sword painting feel)
  const mountainRings = [
    { radius: 135, height: 34, color: 0x101d24, opacity: 0.92, seed: 1.7 },
    { radius: 175, height: 52, color: 0x182a32, opacity: 0.72, seed: 5.3 },
    { radius: 220, height: 68, color: 0x20353e, opacity: 0.48, seed: 9.1 },
  ];
  for (const ring of mountainRings) {
    const segs = 128;
    const geo = new THREE.CylinderGeometry(ring.radius, ring.radius, ring.height, segs, 1, true);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) {
        const ang = Math.atan2(pos.getZ(i), pos.getX(i));
        const ridge =
          Math.sin(ang * 5 + ring.seed) * 0.35 +
          Math.sin(ang * 11 - ring.seed * 2) * 0.25 +
          Math.cos(ang * 19 + ring.seed) * 0.15 +
          0.55;
        pos.setY(i, ring.height * ridge);
      } else {
        pos.setY(i, -12);
      }
    }
    const mat = new THREE.MeshBasicMaterial({
      color: ring.color,
      side: THREE.BackSide,
      transparent: true,
      opacity: ring.opacity,
      fog: false,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 2;
    scene.add(m);
  }

  // 3. Lighting: Cool Moon Directional + Hemisphere + Warm Herb Braziers
  const hemi = new THREE.HemisphereLight(0x527385, 0x1a1c19, 0.85);
  scene.add(hemi);

  const moonLight = new THREE.DirectionalLight(0xa4cbe0, 1.55);
  moonLight.position.set(-28, 42, -56);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  moonLight.shadow.camera.near = 5;
  moonLight.shadow.camera.far = 160;
  const d = 52;
  moonLight.shadow.camera.left = -d;
  moonLight.shadow.camera.right = d;
  moonLight.shadow.camera.top = d;
  moonLight.shadow.camera.bottom = -d;
  moonLight.shadow.bias = -0.0005;
  scene.add(moonLight);

  // Subtle rim fill light from south-east to give silhouette separation
  const rimLight = new THREE.DirectionalLight(0x4a6b6e, 0.42);
  rimLight.position.set(25, 16, 40);
  scene.add(rimLight);

  // Warm Herb Braziers (藥爐石燈) placed as landmarks along the mountain path
  const brazierCoords = [
    [4.5, 24.5],
    [-5.5, 11.0],
    [6.2, -7.5],
    [-6.0, -24.0],
    [6.0, -24.0],
  ];
  const braziers = [];
  const haloTex = makeSoftGlowTexture('#ffb464', '#ff5a1f');

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2a2f32, roughness: 0.9, metalness: 0.1 });
  const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.25, 0.45) }); // HDR peak ~2.4

  for (const [bx, bz] of brazierCoords) {
    const by = getHeight(bx, bz);
    const group = new THREE.Group();
    group.position.set(bx, by, bz);

    // Simple sculpted stone lantern / herb cauldron silhouette
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.62, 0.5, 7), stoneMat);
    base.position.y = 0.25;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.38, 0.48, 8), stoneMat);
    bowl.position.y = 0.72;
    bowl.castShadow = true;
    group.add(bowl);

    const ember = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), emberMat);
    ember.position.y = 0.98;
    ember.scale.set(1.1, 0.6, 1.1);
    group.add(ember);

    // Volumetric glow halo sprite
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
    );
    sprite.position.y = 1.15;
    sprite.scale.set(2.8, 2.8, 1);
    group.add(sprite);

    const light = new THREE.PointLight(0xff9844, 7.5, 19, 1.7);
    light.position.y = 1.5;
    group.add(light);

    scene.add(group);
    braziers.push({ light, sprite, ember, phase: Math.random() * Math.PI * 2 });
  }

  // 4. Instanced Swaying Grass Sea (16,000 tapered blades)
  const grass = createGrassSea(scene);

  // 5. Camera-Following Weather Particles (Ash/Snow + Ground Mist Wisps)
  const weather = createWeather(scene);

  return {
    update(t, dt, focusPos) {
      // Flicker herb braziers gently
      for (const b of braziers) {
        const flick = 0.88 + 0.12 * Math.sin(t * 7.3 + b.phase) + 0.06 * Math.sin(t * 17.1 + b.phase * 2.1);
        b.light.intensity = 7.5 * flick;
        b.sprite.scale.setScalar(3.3 * (0.94 + 0.08 * flick));
        b.ember.rotation.y = t * 0.4 + b.phase;
      }
      grass.uniforms.uTime.value = t;
      weather.update(t, dt, focusPos);
    },
  };
}

function makeSoftGlowTexture(innerHex, outerHex) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0.0, '#ffffff');
  g.addColorStop(0.22, innerHex);
  g.addColorStop(0.55, outerHex);
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGrassSea(scene) {
  const count = 16000;
  // Tapered 3-segment grass blade geometry
  const bladeGeo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -0.055, 0.0, 0,   0.055, 0.0, 0,   -0.04, 0.35, 0,
     0.055, 0.0, 0,   0.04, 0.35, 0,   -0.04, 0.35, 0,
    -0.04, 0.35, 0,   0.04, 0.35, 0,   -0.018, 0.72, 0,
     0.04, 0.35, 0,   0.018, 0.72, 0,  -0.018, 0.72, 0,
    -0.018, 0.72, 0,  0.018, 0.72, 0,   0.0, 1.0, 0,
  ]);
  bladeGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  bladeGeo.computeVertexNormals();

  const uniforms = {
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(0x132028) },
    uFogDensity: { value: 0.0155 },
  };

  const bladeMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: `
      uniform float uTime;
      varying float vH;
      varying float vTint;
      varying float vFogDepth;
      void main() {
        vH = clamp(position.y, 0.0, 1.0);
        // Extract horizontal instance scale so wind bend divides by it (prevents stretched blades!)
        float scaleXZ = max(length(vec2(instanceMatrix[0][0], instanceMatrix[0][2])), 0.25);
        vec4 worldBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vTint = fract(sin(dot(worldBase.xz, vec2(12.9898, 78.233))) * 43758.5453);

        vec3 p = position;
        float wave = sin(uTime * 1.85 + worldBase.x * 0.22 + worldBase.z * 0.17)
                   + 0.45 * sin(uTime * 3.4 - worldBase.x * 0.41 + worldBase.z * 0.33);
        float bend = (vH * vH) * (0.28 * wave + 0.14) / scaleXZ;
        p.x += bend;
        p.z += bend * 0.55;

        vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vFogDepth = -mvPos.z;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying float vH;
      varying float vTint;
      varying float vFogDepth;
      void main() {
        // Ink-wash withered grass & medicinal herb hue
        vec3 rootCol = vec3(0.06, 0.09, 0.08);
        vec3 tipA = vec3(0.24, 0.30, 0.24); // cool sage-green
        vec3 tipB = vec3(0.36, 0.31, 0.20); // withered autumn ochre
        vec3 tip = mix(tipA, tipB, smoothstep(0.25, 0.85, vTint));
        // Moonlit sheen near tips
        vec3 col = mix(rootCol, tip, smoothstep(0.05, 0.95, vH));
        col += vec3(0.10, 0.15, 0.16) * pow(vH, 3.0);

        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.InstancedMesh(bladeGeo, bladeMat, count);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 5) {
    attempts++;
    const x = (Math.random() - 0.5) * 92;
    const z = (Math.random() - 0.5) * 105;
    const sdf = walkableSDF(x, z);
    // Cluster grass mainly near edges & slopes, keeping central path sparser
    if (sdf > 6.5) continue;
    const y = getHeight(x, z);
    if (y < 0.02) continue; // not inside water basin
    if (Math.hypot(x, z + 28.0) < 11.6) continue; // keep Boss Stone Altar clean of grass
    // Leave main stone trail slightly clearer
    const pathNoise = fbm(x * 0.15 + 1.2, z * 0.15 - 3.4, 2);
    if (sdf < -2.5 && pathNoise < 0.46) continue;

    dummy.position.set(x, y - 0.04, z);
    dummy.rotation.set(
      (Math.random() - 0.5) * 0.18,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.18
    );
    const sx = 0.75 + Math.random() * 0.8;
    const sy = 0.55 + Math.random() * 0.95;
    dummy.scale.set(sx, sy, sx);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed++, dummy.matrix);
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return { mesh, uniforms };
}

function createWeather(scene) {
  // 1. Drifting bone-ash / medicinal snow motes in a box around focus
  const boxW = 46, boxH = 22;
  const snowCount = 900;
  const snowPos = new Float32Array(snowCount * 3);
  const snowSeed = new Float32Array(snowCount);
  for (let i = 0; i < snowCount; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * boxW;
    snowPos[i * 3 + 1] = Math.random() * boxH;
    snowPos[i * 3 + 2] = (Math.random() - 0.5) * boxW;
    snowSeed[i] = Math.random() * Math.PI * 2;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  snowGeo.setAttribute('aSeed', new THREE.BufferAttribute(snowSeed, 1));

  const snowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPos;
        float dist = max(-mvPos.z, 2.0);
        gl_PointSize = clamp((38.0 / dist) * uPixelRatio, 2.5, 9.0);
        vAlpha = 0.35 + 0.3 * sin(uTime * 1.4 + aSeed);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float soft = 1.0 - smoothstep(0.08, 0.5, d);
        gl_FragColor = vec4(0.76, 0.86, 0.88, soft * vAlpha);
      }
    `,
  });
  const snowPoints = new THREE.Points(snowGeo, snowMat);
  snowPoints.frustumCulled = false;
  scene.add(snowPoints);

  // 2. Low-lying ground miasma mist wisps (subtle horizontal veil, never opaque white blobs)
  const mistTex = makeSoftGlowTexture('rgba(95,135,142,0.16)', 'rgba(32,58,66,0.04)');
  const mistCount = 20;
  const mistSprites = [];
  for (let i = 0; i < mistCount; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: mistTex,
        transparent: true,
        opacity: 0.14 + Math.random() * 0.08,
        depthWrite: false,
      })
    );
    const ox = (Math.random() - 0.5) * 48;
    const oz = (Math.random() - 0.5) * 48;
    const s = 14 + Math.random() * 14;
    sp.scale.set(s * 1.9, s * 0.45, 1);
    scene.add(sp);
    mistSprites.push({ sp, ox, oz, speed: 0.55 + Math.random() * 0.7, phase: Math.random() * 6.28 });
  }

  return {
    update(t, dt, focusPos) {
      snowMat.uniforms.uTime.value = t;
      const arr = snowGeo.attributes.position.array;
      for (let i = 0; i < snowCount; i++) {
        let x = arr[i * 3] + (0.65 + 0.3 * Math.sin(t + snowSeed[i])) * dt;
        let y = arr[i * 3 + 1] - (1.05 + 0.35 * Math.cos(snowSeed[i])) * dt;
        let z = arr[i * 3 + 2] + 0.35 * dt;

        // Wrap relative to focusPos
        const dx = x - focusPos.x;
        const dz = z - focusPos.z;
        if (dx > boxW * 0.5) x -= boxW;
        if (dx < -boxW * 0.5) x += boxW;
        if (dz > boxW * 0.5) z -= boxW;
        if (dz < -boxW * 0.5) z += boxW;
        if (y < focusPos.y - 2) y += boxH;
        if (y > focusPos.y + boxH) y -= boxH;

        arr[i * 3] = x;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = z;
      }
      snowGeo.attributes.position.needsUpdate = true;

      for (const m of mistSprites) {
        m.ox += m.speed * dt;
        if (m.ox > 22) m.ox -= 44;
        const wx = focusPos.x + m.ox;
        const wz = focusPos.z + m.oz;
        const wy = getHeight(wx, wz) + 1.15 + Math.sin(t * 0.7 + m.phase) * 0.3;
        m.sp.position.set(wx, wy, wz);
      }
    },
  };
}
