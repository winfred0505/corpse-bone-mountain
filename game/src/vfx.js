import * as THREE from 'three';
import { getHeight } from './terrain.js';

export function createVFXSystem(scene) {
  const active = [];

  // 1. Curved Slash Arc Mesh (reusable ring-sector with scrolling noise + erosion shader)
  function createSlashGeometry(innerR, outerR, arcAngle, segs = 28) {
    const geo = new THREE.BufferGeometry();
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const a = -arcAngle * 0.5 + u * arcAngle;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(sa * innerR, 0, ca * innerR);
      uvs.push(u, 0);
      pos.push(sa * outerR, 0, ca * outerR);
      uvs.push(u, 1);
      if (i < segs) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    return geo;
  }

  const slashGeo = createSlashGeometry(0.85, 2.55, Math.PI * 0.92, 26);

  function spawnSlashArc(pos, yaw, { vertical = false, reverse = false, color = [2.4, 0.95, 0.35], scale = 1.0, duration = 0.28 } = {}) {
    const makeMat = (isInk) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: isInk ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: {
        uProg: { value: 0 },
        uColor: { value: new THREE.Vector3(...(isInk ? [0.05, 0.07, 0.08] : color)) },
        uRev: { value: reverse ? 1.0 : 0.0 },
        uInk: { value: isInk ? 1.0 : 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform float uProg, uRev, uInk;
        uniform vec3 uColor;
        varying vec2 vUv;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){
          vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y);
        }
        void main() {
          float u = clamp(mix(vUv.x, 1.0 - vUv.x, uRev), 0.0, 1.0);
          float r = clamp(vUv.y, 0.001, 1.0);
          // Sweep head + trailing tail (strictly edge0 < edge1 for GLSL ES)
          float head = clamp(uProg * 1.65, 0.0, 1.25);
          float trail = smoothstep(head - 0.85, head, u) * (1.0 - smoothstep(head, head + 0.08, u));
          // Tapered blade profile (bright outer edge, soft inner decay, pointed tips)
          float edge = pow(r, 1.6) * (1.0 - smoothstep(0.84, 1.0, r)) * 2.2;
          float tip = smoothstep(0.0, 0.14, u) * (1.0 - smoothstep(0.86, 1.0, u));
          float streak = n2(vec2(u * 14.0 - uProg * 6.0, r * 6.0));
          float erode = smoothstep(uProg * 0.85, uProg * 0.85 + 0.25, streak + edge * 0.45);
          float alpha = clamp(trail * edge * tip * erode * (1.0 - smoothstep(0.55, 1.0, uProg)), 0.0, 1.0);
          if (alpha < 0.01) discard;
          vec3 col = uInk > 0.5 ? uColor : uColor * (0.7 + 0.6 * pow(r, 3.0));
          gl_FragColor = vec4(col, alpha * (uInk > 0.5 ? 0.68 : 0.92));
        }
      `,
    });

    const g = new THREE.Group();
    g.position.set(pos.x, pos.y + 1.05, pos.z);
    g.rotation.y = yaw;
    if (vertical) {
      g.rotation.z = Math.PI * 0.48;
      g.rotation.x = 0.15;
    } else {
      g.rotation.z = reverse ? 0.16 : -0.16;
    }
    g.scale.setScalar(scale);

    const inkMesh = new THREE.Mesh(slashGeo, makeMat(true));
    inkMesh.position.y = -0.04;
    const glowMesh = new THREE.Mesh(slashGeo, makeMat(false));
    g.add(inkMesh, glowMesh);
    scene.add(g);

    active.push({
      t: 0,
      dur: duration * 1.35,
      update(dt) {
        this.t += dt;
        const pGlow = Math.min(1, this.t / duration);
        const pInk = Math.min(1, this.t / (duration * 1.35));
        glowMesh.material.uniforms.uProg.value = pGlow;
        inkMesh.material.uniforms.uProg.value = pInk;
        if (this.t >= this.dur) {
          scene.remove(g);
          glowMesh.material.dispose();
          inkMesh.material.dispose();
          return false;
        }
        return true;
      },
    });
  }

  // 2. Procedural Fragment-Shader Magic Circle / Telegraph Ring (no flat bitmap!)
  const circleGeo = new THREE.PlaneGeometry(2, 2);
  circleGeo.rotateX(-Math.PI / 2);

  function spawnMagicCircle(x, z, radius, duration, { color = [2.2, 1.05, 0.32], isWarning = false } = {}) {
    const y = getHeight(x, z) + 0.24;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uProg: { value: 0 },
        uColor: { value: new THREE.Vector3(...color) },
        uWarn: { value: isWarning ? 1.0 : 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform float uTime, uProg, uWarn;
        uniform vec3 uColor;
        varying vec2 vUv;
        float hash1(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float ang = atan(vUv.y, vUv.x);

          // Concentric outer & inner rings (strictly edge0 < edge1!)
          float outerRing = 1.0 - smoothstep(0.0, 0.035, abs(r - 0.94));
          float innerRing = 1.0 - smoothstep(0.0, 0.028, abs(r - 0.68));

          // Polar rune band between 0.72 and 0.90
          float runeAng = ang + uTime * (uWarn > 0.5 ? 1.4 : 0.7);
          float cell = floor((runeAng + 3.14159) / 6.28318 * 24.0);
          float fAng = fract((runeAng + 3.14159) / 6.28318 * 24.0);
          float runeMask = step(0.73, r) * step(r, 0.89) * step(0.22, fAng) * step(fAng, 0.78);
          float glyph = step(0.45, hash1(cell * 13.7 + floor(r * 26.0) * 3.1));
          float runes = runeMask * glyph * 0.75;

          // Counter-rotating hexagram / polygon
          float polyAng = mod(ang - uTime * 0.55 + 3.14159, 6.28318 / 6.0) - 3.14159 / 6.0;
          float polyR = 0.66 * cos(3.14159 / 6.0) / max(0.2, cos(polyAng));
          float poly = (1.0 - smoothstep(0.0, 0.025, abs(r - polyR))) * 0.75;

          // Outward progress fill for telegraphs or burst reveal for skills
          float fill = uWarn > 0.5
            ? (1.0 - smoothstep(uProg - 0.04, uProg + 0.04, r)) * (0.22 + 0.45 * smoothstep(uProg - 0.06, uProg + 0.001, r))
            : smoothstep(0.0, 0.25, uProg) * (1.0 - r) * 0.36;

          float fade = uWarn > 0.5 ? 1.0 : (1.0 - smoothstep(0.68, 1.0, uProg));
          float alpha = clamp((outerRing + innerRing * 0.85 + runes + poly + fill) * fade, 0.0, 1.0);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    const mesh = new THREE.Mesh(circleGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 6;
    scene.add(mesh);

    const entry = {
      t: 0,
      dur: duration,
      cancelled: false,
      cancel() { this.cancelled = true; },
      update(dt) {
        this.t += dt;
        mat.uniforms.uTime.value = this.t;
        mat.uniforms.uProg.value = Math.min(1, this.t / this.dur);
        if (this.cancelled || this.t >= this.dur) {
          scene.remove(mesh);
          mat.dispose();
          return false;
        }
        return true;
      },
    };
    active.push(entry);
    return entry;
  }

  // 3. Directional Contact Sparks (along slash tangent, NOT radial center!)
  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.28);

  function spawnSparks(pos, dir, count = 12, color = [2.5, 1.5, 0.55]) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...color) });
    const pieces = [];
    const baseDir = dir.clone().normalize();
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(sparkGeo, mat);
      m.position.copy(pos);
      const vel = baseDir.clone()
        .multiplyScalar(4.5 + Math.random() * 5.5)
        .add(new THREE.Vector3((Math.random() - 0.5) * 3.5, 1.5 + Math.random() * 3.5, (Math.random() - 0.5) * 3.5));
      scene.add(m);
      pieces.push({ m, vel });
    }
    active.push({
      t: 0,
      dur: 0.34,
      update(dt) {
        this.t += dt;
        const s = Math.max(0.01, 1 - this.t / this.dur);
        for (const p of pieces) {
          p.vel.y -= 14 * dt;
          p.m.position.addScaledVector(p.vel, dt);
          p.m.lookAt(p.m.position.clone().add(p.vel));
          p.m.scale.setScalar(s);
        }
        if (this.t >= this.dur) {
          pieces.forEach((p) => scene.remove(p.m));
          mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  // 4. Three-Layer Loot Drop Beam (vfx-ui-audio.md: core + mid + wide soft glow, arcs & bounces)
  const lootList = [];
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);

  function spawnLoot(x, z, item) {
    // item: { kind: 'antidote'|'herb', name, tier: '大毒'|'有毒'|'良方', desc }
    const tierCol =
      item.tier === '大毒' ? new THREE.Color(1.9, 0.32, 0.72)
      : item.tier === '有毒' ? new THREE.Color(2.2, 1.15, 0.25)
      : new THREE.Color(0.55, 2.0, 1.35);

    const g = new THREE.Group();
    const y0 = getHeight(x, z);
    g.position.set(x, y0 + 0.8, z);

    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({ color: tierCol })
    );
    g.add(orb);

    const beamH = item.tier === '大毒' ? 5.2 : item.tier === '有毒' ? 3.8 : 3.2;
    const mkBeam = (r, op) => {
      const m = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({
          color: tierCol,
          transparent: true,
          opacity: op,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      m.scale.set(r, beamH, r);
      m.position.y = beamH * 0.5;
      return m;
    };
    const bCore = mkBeam(0.06, 0.85);
    const bMid = mkBeam(0.18, 0.34);
    const bWide = mkBeam(0.42, 0.14);
    g.add(bCore, bMid, bWide);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.48, 20),
      new THREE.MeshBasicMaterial({ color: tierCol, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);

    scene.add(g);

    const angle = Math.random() * Math.PI * 2;
    const drop = {
      g, orb, ring, item,
      x, z, y: y0 + 0.8,
      vx: Math.cos(angle) * 2.1,
      vz: Math.sin(angle) * 2.1,
      vy: 5.2,
      landed: false,
      age: 0,
      collected: false,
    };
    lootList.push(drop);
    return drop;
  }

  return {
    spawnSlashArc,
    spawnMagicCircle,
    spawnSparks,
    spawnLoot,
    lootList,
    update(t, dt, heroPos, onCollect) {
      for (let i = active.length - 1; i >= 0; i--) {
        if (!active[i].update(dt)) active.splice(i, 1);
      }
      for (let i = lootList.length - 1; i >= 0; i--) {
        const l = lootList[i];
        l.age += dt;
        const groundY = getHeight(l.x, l.z);
        if (!l.landed) {
          l.vy -= 16 * dt;
          l.x += l.vx * dt;
          l.z += l.vz * dt;
          l.y += l.vy * dt;
          if (l.y <= groundY + 0.18) {
            l.y = groundY + 0.18;
            l.landed = true;
            l.vx = l.vz = l.vy = 0;
          }
        } else if (heroPos) {
          const dx = heroPos.x - l.x, dz = heroPos.z - l.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 3.4) {
            const pull = Math.min(1, dt * 11);
            l.x += dx * pull;
            l.z += dz * pull;
            l.y += (heroPos.y + 0.9 - l.y) * pull;
            if (dist < 0.75) {
              l.collected = true;
              scene.remove(l.g);
              lootList.splice(i, 1);
              if (onCollect) onCollect(l.item);
              continue;
            }
          }
        }
        l.g.position.set(l.x, l.y, l.z);
        l.orb.rotation.y = t * 2.5;
        l.orb.position.y = 0.35 + Math.sin(t * 4 + i) * 0.08;
        l.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.12);
      }
    },
  };
}
