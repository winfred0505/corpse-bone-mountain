import * as THREE from 'three';
import { getHeight } from './terrain.js';
import {
  clearWorldRegistry,
  addCircleObstacle,
  addCapsuleObstacle,
  registerOccluder,
  interactables,
} from './collision.js';

function makePlaqueTexture(text, bgHex, borderHex, textHex, vertical = false) {
  const c = document.createElement('canvas');
  c.width = vertical ? 128 : 256;
  c.height = vertical ? 256 : 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16);

  ctx.fillStyle = textHex;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (vertical) {
    ctx.font = 'bold 42px "DFKai-SB", "BiauKai", serif';
    const chars = [...text];
    const step = (c.height - 48) / Math.max(chars.length, 1);
    chars.forEach((ch, i) => ctx.fillText(ch, c.width / 2, 36 + step * (i + 0.5)));
  } else {
    ctx.font = 'bold 46px "DFKai-SB", "BiauKai", serif';
    ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorldProps(scene) {
  clearWorldRegistry();
  const animated = [];

  // Shared ink-wash PBR materials
  const matDarkStone = new THREE.MeshStandardMaterial({ color: 0x2a3136, roughness: 0.92, metalness: 0.08 });
  const matMossStone = new THREE.MeshStandardMaterial({ color: 0x333c38, roughness: 0.88, metalness: 0.06 });
  const matWeatheredWood = new THREE.MeshStandardMaterial({ color: 0x34241e, roughness: 0.9, metalness: 0.05 });
  const matLacquerRed = new THREE.MeshStandardMaterial({ color: 0x5c201b, roughness: 0.72, metalness: 0.1 });
  const matBone = new THREE.MeshStandardMaterial({ color: 0xbdb5a2, roughness: 0.78, metalness: 0.04 });
  const matBronze = new THREE.MeshStandardMaterial({ color: 0x3d4c42, roughness: 0.45, metalness: 0.72 });
  const matCinnabar = new THREE.MeshStandardMaterial({
    color: 0x8f1a16,
    emissive: new THREE.Color(1.45, 0.16, 0.12), // Controlled HDR peak < 2.0
    roughness: 0.32,
    metalness: 0.25,
  });

  // =========================================================================
  // 1. SOUTH ZONE: 山門殘碑 (Mountain Gate, Shennong Stele, Five-Special Cabinet)
  // =========================================================================
  buildMountainGate(scene, 0, 29.5, { matDarkStone, matWeatheredWood, matLacquerRed });
  buildShennongStele(scene, 5.2, 23.0, matDarkStone, matMossStone);
  buildFiveSpecialCabinet(scene, -5.6, 23.6, matWeatheredWood, matBronze);

  // =========================================================================
  // 2. CENTER ZONE: 瘴氣藥谷 (Giant Rib Arch, Buried Skull, Cinnabar Mines, Withered Trees, Rocks)
  // =========================================================================
  // Giant curving rib bones framing the entrance to Miasma Valley
  buildGiantRibArch(scene, -1.0, 12.0, matBone);
  // Half-buried giant beast skull landmark on the west bank of the mirror pool
  buildBeastSkull(scene, -9.8, 3.2, 0.65, matBone);

  // Two Forbidden Cinnabar Mines (臺灣公告禁用：硃砂) — glowing ominous red-violet
  animated.push(buildCinnabarMine(scene, -5.2, 16.5, matDarkStone, matCinnabar, 'cinnabar_1'));
  animated.push(buildCinnabarMine(scene, 7.6, -2.5, matDarkStone, matCinnabar, 'cinnabar_2'));

  // Withered ink-wash trees framing the valley (with camera occlusion fade)
  const treeSpots = [
    [-8.8, 20.5, 1.05, 0.4],
    [8.8, 17.5, 0.92, 2.1],
    [-11.2, -5.5, 1.15, 1.2],
    [10.8, 4.8, 1.08, 4.0],
    [10.2, -14.5, 0.95, 5.2],
    [-9.5, -16.2, 1.0, 2.9],
  ];
  for (const [tx, tz, sc, rot] of treeSpots) {
    buildWitheredTree(scene, tx, tz, sc, rot, matWeatheredWood);
  }

  // Sculpted jagged rocks & broken pillars for combat spatial cover
  const rockClusters = [
    [-4.8, 6.8, 1.25],
    [5.8, 7.4, 1.15],
    [4.6, -11.5, 1.2],
    [-6.2, -9.5, 1.3],
    [8.5, 25.5, 1.4],
    [-9.0, 26.8, 1.35],
  ];
  for (const [rx, rz, rs] of rockClusters) {
    buildRockCluster(scene, rx, rz, rs, matDarkStone, matMossStone);
  }

  // Stone path stepping slabs from South Gate through Valley to Boss Altar
  buildSteppingStones(scene, matMossStone);

  // =========================================================================
  // 3. NORTH ZONE: 煉毒骨壇 (Boss Altar, 6 Rune Pillars, Ancient Bronze Herb Cauldron)
  // =========================================================================
  animated.push(buildBossAltar(scene, 0, -28.0, { matDarkStone, matMossStone, matBronze, matBone }));

  return {
    update(t, dt) {
      for (const fn of animated) fn(t, dt);
    },
  };
}

function buildMountainGate(scene, x, z, { matDarkStone, matWeatheredWood, matLacquerRed }) {
  const y = getHeight(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);

  // Left & right weathered red-lacquer pillars with stone pedestals
  for (const side of [-1, 1]) {
    const px = side * 3.6;
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.9, 1.15), matDarkStone);
    ped.position.set(px, 0.45, 0);
    ped.castShadow = true; ped.receiveShadow = true;
    g.add(ped);

    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 6.2, 10), matLacquerRed);
    col.position.set(px, 3.8, 0);
    col.castShadow = true;
    g.add(col);

    addCircleObstacle(x + px, z, 0.85);
  }

  // Crossbeams
  const beam1 = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.48, 0.52), matWeatheredWood);
  beam1.position.set(0, 5.6, 0);
  beam1.castShadow = true;
  g.add(beam1);

  const beam2 = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.35, 0.42), matLacquerRed);
  beam2.position.set(0, 4.75, 0);
  g.add(beam2);

  // Curved traditional pitched roof (slanted eaves)
  const roofMain = new THREE.Mesh(new THREE.ConeGeometry(5.6, 1.8, 4), matDarkStone);
  roofMain.rotation.y = Math.PI / 4;
  roofMain.scale.set(1.38, 0.9, 0.42);
  roofMain.position.set(0, 6.75, 0);
  roofMain.castShadow = true;
  g.add(roofMain);

  // Inscribed plaque "屍骨山"
  const plaqueTex = makePlaqueTexture('屍骨山', '#1a1614', '#b8965a', '#e9dec8', false);
  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.05, 0.16),
    new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.7 })
  );
  plaque.position.set(0, 5.18, 0.28);
  g.add(plaque);

  scene.add(g);
  registerOccluder(g, x, z, 4.8);
}

function buildShennongStele(scene, x, z, matDarkStone, matMossStone) {
  const y = getHeight(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = -0.35;

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.1), matMossStone);
  base.position.y = 0.25;
  base.castShadow = true; base.receiveShadow = true;
  g.add(base);

  const steleTex = makePlaqueTexture('百草辨毒', '#242c2e', '#6f7e78', '#cde0d6', true);
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 2.75, 0.34),
    [
      matDarkStone, matDarkStone, matDarkStone, matDarkStone,
      new THREE.MeshStandardMaterial({ map: steleTex, roughness: 0.82 }),
      matDarkStone,
    ]
  );
  slab.position.y = 1.82;
  slab.rotation.z = 0.04; // slightly tilted ancient ruin feel
  slab.castShadow = true; slab.receiveShadow = true;
  g.add(slab);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.78, 0.5, 4), matMossStone);
  cap.rotation.y = Math.PI / 4;
  cap.scale.set(1.3, 1, 0.55);
  cap.position.set(-0.06, 3.35, 0);
  g.add(cap);

  scene.add(g);
  addCircleObstacle(x, z, 1.05);
  interactables.push({ id: 'stele', kind: 'lore', x, z, title: '神農本草殘碑' });
}

function buildFiveSpecialCabinet(scene, x, z, matWood, matBronze) {
  const y = getHeight(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = 0.42;

  // Heavy iron-bound locked cabinet (專櫃加鎖 + 紅底黑字「毒」)
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.95), matWood);
  body.position.y = 0.9;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.14), matBronze);
  lock.position.set(0, 0.95, 0.5);
  g.add(lock);

  const signTex = makePlaqueTexture('！！毒', '#9e1b18', '#151010', '#120a0a', false);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.48),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.55 })
  );
  sign.position.set(0, 1.42, 0.49);
  g.add(sign);

  scene.add(g);
  addCircleObstacle(x, z, 1.05);
  interactables.push({ id: 'cabinet', kind: 'lore', x, z, title: '五專毒劇藥櫃' });
}

function buildGiantRibArch(scene, x, z, matBone) {
  const g = new THREE.Group();
  // Two opposing curved rib pairs rising from the valley walls over the path
  const pairs = [
    { ox: -4.2, oz: 0, dir: 1, h: 6.4, lean: 0.12 },
    { ox: 4.2, oz: 0.5, dir: -1, h: 6.1, lean: -0.1 },
    { ox: -4.5, oz: -3.2, dir: 1, h: 5.5, lean: 0.08 },
    { ox: 4.5, oz: -2.8, dir: -1, h: 5.3, lean: -0.14 },
  ];

  for (const p of pairs) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(p.dir * 0.4, p.h * 0.42, 0.2),
      new THREE.Vector3(p.dir * 2.1, p.h * 0.82, 0.0),
      new THREE.Vector3(p.dir * 3.5, p.h, -0.3),
    ]);
    const tubeGeo = new THREE.TubeGeometry(curve, 14, 0.32, 7, false);
    // Taper tip
    const pos = tubeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vy = pos.getY(i);
      const t = Math.max(0, Math.min(1, vy / p.h));
      const scale = 1.0 - t * 0.65;
      // Pull slightly toward centerline for bone taper
      pos.setZ(i, pos.getZ(i) * scale);
    }
    tubeGeo.computeVertexNormals();
    const rib = new THREE.Mesh(tubeGeo, matBone);
    const wx = x + p.ox, wz = z + p.oz;
    rib.position.set(wx, getHeight(wx, wz) - 0.3, wz);
    rib.rotation.y = p.lean;
    rib.castShadow = true; rib.receiveShadow = true;
    g.add(rib);

    addCircleObstacle(wx, wz, 0.7);
  }
  scene.add(g);
  registerOccluder(g, x, z - 1.2, 5.2);
}

function buildBeastSkull(scene, x, z, rotY, matBone) {
  const y = getHeight(x, z);
  const g = new THREE.Group();
  g.position.set(x, y - 0.2, z);
  g.rotation.set(0.15, rotY, -0.12);

  const cranium = new THREE.Mesh(new THREE.DodecahedronGeometry(1.55, 1), matBone);
  cranium.scale.set(1.05, 0.85, 1.35);
  cranium.position.y = 1.05;
  cranium.castShadow = true; cranium.receiveShadow = true;
  g.add(cranium);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 1.7), matBone);
  snout.position.set(0, 0.65, 1.55);
  snout.castShadow = true;
  g.add(snout);

  // Dark hollow eye sockets
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x090e12 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 8), eyeMat);
    eye.position.set(s * 0.68, 1.12, 0.95);
    g.add(eye);

    // Sweeping horn
    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.95, 1.5, -0.2),
      new THREE.Vector3(s * 1.9, 2.1, -0.9),
      new THREE.Vector3(s * 2.4, 3.1, -0.4),
    ]);
    const horn = new THREE.Mesh(new THREE.TubeGeometry(hornCurve, 10, 0.19, 6, false), matBone);
    horn.castShadow = true;
    g.add(horn);
  }

  scene.add(g);
  addCircleObstacle(x, z, 2.0);
}

function buildCinnabarMine(scene, x, z, matStone, matCinnabar, id) {
  const y = getHeight(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const baseRock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 0), matStone);
  baseRock.scale.set(1.2, 0.55, 1.1);
  baseRock.position.y = 0.3;
  baseRock.castShadow = true; baseRock.receiveShadow = true;
  g.add(baseRock);

  // Cinnabar red crystal shards
  const crystals = [];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.3;
    const h = 0.85 + (i % 3) * 0.42;
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.24, h, 5), matCinnabar);
    shard.position.set(Math.cos(ang) * 0.42, 0.45 + h * 0.35, Math.sin(ang) * 0.42);
    shard.rotation.set((Math.random() - 0.5) * 0.45, ang, (Math.random() - 0.5) * 0.45);
    shard.castShadow = true;
    g.add(shard);
    crystals.push(shard);
  }

  const redLight = new THREE.PointLight(0xff3322, 3.2, 8.5, 1.8);
  redLight.position.y = 1.4;
  g.add(redLight);

  scene.add(g);
  addCircleObstacle(x, z, 1.25);
  interactables.push({ id, kind: 'cinnabar', x, z, root: g, active: true, title: '【！！禁用】硃砂毒礦' });

  const phase = x * 0.7 + z * 0.3;
  return (t) => {
    redLight.intensity = 2.6 + 0.9 * Math.sin(t * 2.8 + phase);
  };
}

function buildWitheredTree(scene, x, z, scale, rotY, matWood) {
  const y = getHeight(x, z);
  const g = new THREE.Group();
  g.position.set(x, y - 0.15, z);
  g.rotation.y = rotY;
  g.scale.setScalar(scale);

  // Gnarled trunk
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.35, 1.9, 0.15),
    new THREE.Vector3(-0.25, 3.8, -0.2),
    new THREE.Vector3(0.45, 5.4, 0.3),
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 12, 0.32, 7, false), matWood);
  trunk.castShadow = true; trunk.receiveShadow = true;
  g.add(trunk);

  // 3 gnarled ink-wash branches
  const branchSpecs = [
    [[0.2, 2.5, 0.1], [1.6, 3.3, 0.7], [2.7, 3.6, 1.0]],
    [[-0.1, 3.6, -0.15], [-1.7, 4.4, 0.4], [-2.8, 4.7, 0.6]],
    [[0.3, 4.8, 0.2], [0.8, 5.9, -1.2], [1.4, 6.4, -2.0]],
  ];
  for (const pts of branchSpecs) {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const br = new THREE.Mesh(new THREE.TubeGeometry(c, 8, 0.13, 5, false), matWood);
    br.castShadow = true;
    g.add(br);
  }

  scene.add(g);
  addCircleObstacle(x, z, 0.72 * scale);
  registerOccluder(g, x, z, 3.2 * scale);
}

function buildRockCluster(scene, x, z, scale, matDark, matMoss) {
  const y = getHeight(x, z);
  const g = new THREE.Group();
  g.position.set(x, y - 0.2, z);

  const main = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15 * scale, 0), matDark);
  main.scale.set(1.25, 0.95, 0.9);
  main.position.y = 0.7 * scale;
  main.rotation.set(0.2, x, 0.15);
  main.castShadow = true; main.receiveShadow = true;
  g.add(main);

  const sub = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68 * scale, 0), matMoss);
  sub.position.set(0.95 * scale, 0.42 * scale, 0.4 * scale);
  sub.rotation.set(0.4, z, 0.2);
  sub.castShadow = true; sub.receiveShadow = true;
  g.add(sub);

  scene.add(g);
  addCapsuleObstacle(x - 0.35 * scale, z, x + 0.75 * scale, z + 0.3 * scale, 0.85 * scale);
}

function buildSteppingStones(scene, matMossStone) {
  const count = 24;
  const slabGeo = new THREE.CylinderGeometry(1.15, 1.32, 0.18, 7);
  const mesh = new THREE.InstancedMesh(slabGeo, matMossStone, count);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const z = 27.5 - t * 47.0;
    const x = Math.sin(z * 0.11) * 1.35 + (i % 2 === 0 ? -0.35 : 0.35);
    const y = getHeight(x, z);
    dummy.position.set(x, y + 0.02, z);
    dummy.rotation.set(0, i * 1.1, 0);
    dummy.scale.set(0.85 + (i % 3) * 0.18, 1, 0.65 + ((i + 1) % 3) * 0.15);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function buildBossAltar(scene, x, z, { matDarkStone, matMossStone, matBronze, matBone }) {
  const y = getHeight(x, z);
  const g = new THREE.Group();
  g.position.set(x, y, z);

  // Raised circular stone altar platform
  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(10.8, 11.6, 0.38, 24), matDarkStone);
  tier1.position.y = 0.08;
  tier1.receiveShadow = true;
  g.add(tier1);

  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 9.2, 0.26, 24), matMossStone);
  tier2.position.y = 0.32;
  tier2.receiveShadow = true;
  g.add(tier2);

  // 6 Ring Rune Pillars around the Boss Altar (leaving southern entrance wide open)
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI * 0.82 + (i / 5) * (Math.PI * 1.64); // arc from SW -> N -> SE
    const px = Math.sin(ang) * 10.2;
    const pz = -Math.cos(ang) * 10.2;
    const h = 4.6 + (i % 2) * 1.1;

    const pGroup = new THREE.Group();
    pGroup.position.set(px, 0.1, pz);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, h, 8), matDarkStone);
    col.position.y = h / 2;
    col.castShadow = true; col.receiveShadow = true;
    pGroup.add(col);

    // Bone-ring crown near pillar top
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 6, 12), matBone);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = h - 0.5;
    pGroup.add(ring);

    g.add(pGroup);
    addCircleObstacle(x + px, z + pz, 0.88);
    registerOccluder(pGroup, x + px, z + pz, 2.2);
  }

  // Giant Ancient Bronze Herb Cauldron (煉毒藥鼎) at northern focal point of the altar
  const cauldronZ = -5.6;
  const cauldron = new THREE.Group();
  cauldron.position.set(0, 0.45, cauldronZ);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(1.55, 14, 12), matBronze);
  belly.scale.set(1.15, 0.78, 1.15);
  belly.position.y = 1.45;
  belly.castShadow = true;
  cauldron.add(belly);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.18, 8, 20), matBronze);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 2.32;
  cauldron.add(rim);

  // Three sturdy bronze tripod legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.45, 7), matBronze);
    leg.position.set(Math.cos(a) * 1.1, 0.72, Math.sin(a) * 1.1);
    leg.rotation.z = -Math.cos(a) * 0.22;
    leg.rotation.x = Math.sin(a) * 0.22;
    leg.castShadow = true;
    cauldron.add(leg);
  }

  // Eerie purple-jade toxic aconite flame inside the cauldron (HDR peak ~2.2)
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.45, 0.45, 2.15) });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.45, 7), flameMat);
  flame.position.y = 2.65;
  cauldron.add(flame);

  const poisonLight = new THREE.PointLight(0xa248ff, 8.5, 22, 1.6);
  poisonLight.position.y = 3.6;
  cauldron.add(poisonLight);

  g.add(cauldron);
  addCircleObstacle(x, z + cauldronZ, 2.15);

  scene.add(g);

  return (t) => {
    flame.rotation.y = t * 1.2;
    const pulse = 0.88 + 0.15 * Math.sin(t * 4.5);
    flame.scale.set(1, pulse, 1);
    poisonLight.intensity = 8.5 * pulse;
  };
}
