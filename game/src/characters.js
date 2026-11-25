import * as THREE from 'three';
import { solveTwoBoneIK, alignLimb, sampleKeyframes } from './ik.js';

// ============================================================================
// 5-Beat Action Pose Tables (Character Space: +Y up, +Z forward, Right = -X)
// Start & end poses match combat idle so combos flow without snapping!
// ============================================================================
const COMBAT_IDLE = {
  t: 0,
  hip: [0, 0.94, 0],
  torsoYaw: -0.18,
  torsoPitch: 0.06,
  rHand: [-0.32, 0.98, 0.24],
  lHand: [0.30, 1.06, 0.28],
  rFoot: [-0.18, 0.0, -0.06],
  lFoot: [0.18, 0.0, 0.14],
  weaponDir: [-0.25, 0.22, 0.94],
};

// Attack 1: 赭鞭右斜抽擊 (5 beats: startup -> hold -> quartOut whip -> follow-through -> recover)
export const HERO_CLIPS = {
  atk1: {
    duration: 0.56,
    hitWindow: [0.18, 0.32],
    keys: [
      { ...COMBAT_IDLE, t: 0.0 },
      { t: 0.10, ease: 'cubic', hip: [-0.04, 0.89, -0.06], torsoYaw: -0.68, torsoPitch: 0.10, rHand: [-0.54, 1.24, -0.18], lHand: [0.28, 1.02, 0.34], rFoot: [-0.22, 0.0, -0.16], lFoot: [0.18, 0.0, 0.20], weaponDir: [-0.65, 0.55, -0.52] },
      // Hold beat (0.08s anticipation)
      { t: 0.18, ease: 'linear', hip: [-0.05, 0.88, -0.08], torsoYaw: -0.74, torsoPitch: 0.12, rHand: [-0.58, 1.26, -0.22], lHand: [0.28, 1.02, 0.36], rFoot: [-0.22, 0.0, -0.16], lFoot: [0.18, 0.0, 0.22], weaponDir: [-0.70, 0.52, -0.49] },
      // Snap whip across! (quartOut)
      { t: 0.30, ease: 'quartOut', hip: [0.06, 0.91, 0.14], torsoYaw: 0.62, torsoPitch: 0.16, rHand: [0.38, 0.96, 0.52], lHand: [0.36, 1.04, -0.10], rFoot: [-0.14, 0.0, 0.04], lFoot: [0.22, 0.0, 0.32], weaponDir: [0.76, -0.18, 0.62] },
      // Follow-through overshoot
      { t: 0.40, ease: 'cubic', hip: [0.07, 0.90, 0.16], torsoYaw: 0.72, torsoPitch: 0.14, rHand: [0.46, 0.90, 0.42], lHand: [0.38, 1.00, -0.16], rFoot: [-0.14, 0.0, 0.04], lFoot: [0.22, 0.0, 0.30], weaponDir: [0.85, -0.24, 0.46] },
      { ...COMBAT_IDLE, t: 0.56, ease: 'cubic' },
    ],
  },
  atk2: {
    duration: 0.58,
    hitWindow: [0.19, 0.34],
    keys: [
      { ...COMBAT_IDLE, t: 0.0 },
      { t: 0.11, ease: 'cubic', hip: [0.05, 0.88, -0.04], torsoYaw: 0.65, torsoPitch: 0.12, rHand: [0.44, 1.04, 0.26], lHand: [0.35, 1.05, -0.12], rFoot: [-0.16, 0.0, 0.12], lFoot: [0.20, 0.0, -0.10], weaponDir: [0.82, 0.12, 0.55] },
      { t: 0.19, ease: 'linear', hip: [0.06, 0.87, -0.06], torsoYaw: 0.74, torsoPitch: 0.14, rHand: [0.48, 1.06, 0.22], lHand: [0.36, 1.04, -0.16], rFoot: [-0.16, 0.0, 0.12], lFoot: [0.20, 0.0, -0.12], weaponDir: [0.88, 0.18, 0.44] },
      { t: 0.31, ease: 'quartOut', hip: [-0.06, 0.92, 0.16], torsoYaw: -0.68, torsoPitch: 0.14, rHand: [-0.52, 1.12, 0.46], lHand: [0.24, 1.08, 0.38], rFoot: [-0.24, 0.0, 0.24], lFoot: [0.16, 0.0, 0.02], weaponDir: [-0.82, 0.15, 0.55] },
      { t: 0.42, ease: 'cubic', hip: [-0.07, 0.91, 0.15], torsoYaw: -0.76, torsoPitch: 0.12, rHand: [-0.58, 1.14, 0.34], lHand: [0.24, 1.06, 0.34], rFoot: [-0.24, 0.0, 0.24], lFoot: [0.16, 0.0, 0.02], weaponDir: [-0.90, 0.18, 0.38] },
      { ...COMBAT_IDLE, t: 0.58, ease: 'cubic' },
    ],
  },
  atk3: {
    duration: 0.74,
    hitWindow: [0.26, 0.44],
    keys: [
      { ...COMBAT_IDLE, t: 0.0 },
      { t: 0.14, ease: 'cubic', hip: [0, 1.08, -0.08], torsoYaw: -0.35, torsoPitch: -0.12, rHand: [-0.18, 1.72, -0.04], lHand: [0.22, 1.48, 0.24], rFoot: [-0.20, 0.16, -0.10], lFoot: [0.18, 0.08, 0.14], weaponDir: [-0.12, 0.92, -0.36] },
      // Apex hold
      { t: 0.24, ease: 'linear', hip: [0, 1.12, -0.06], torsoYaw: -0.40, torsoPitch: -0.16, rHand: [-0.16, 1.78, -0.08], lHand: [0.24, 1.52, 0.26], rFoot: [-0.20, 0.22, -0.08], lFoot: [0.18, 0.12, 0.16], weaponDir: [-0.10, 0.95, -0.28] },
      // Heavy overhead slam!
      { t: 0.38, ease: 'quartOut', hip: [0, 0.78, 0.24], torsoYaw: 0.28, torsoPitch: 0.34, rHand: [-0.08, 0.62, 0.62], lHand: [0.34, 0.94, 0.06], rFoot: [-0.20, 0.0, -0.14], lFoot: [0.20, 0.0, 0.38], weaponDir: [0.08, -0.48, 0.87] },
      // Follow-through weight settle
      { t: 0.52, ease: 'cubic', hip: [0, 0.76, 0.26], torsoYaw: 0.32, torsoPitch: 0.36, rHand: [-0.05, 0.56, 0.60], lHand: [0.36, 0.90, 0.02], rFoot: [-0.20, 0.0, -0.14], lFoot: [0.20, 0.0, 0.38], weaponDir: [0.10, -0.55, 0.83] },
      { ...COMBAT_IDLE, t: 0.74, ease: 'cubic' },
    ],
  },
  // Block: weapon held diagonally CLOSE to torso (characters-animation.md)
  block: {
    duration: 0.35,
    keys: [
      { ...COMBAT_IDLE, t: 0.0 },
      { t: 0.12, ease: 'quartOut', hip: [0, 0.86, -0.04], torsoYaw: 0.22, torsoPitch: 0.12, rHand: [-0.16, 1.18, 0.32], lHand: [0.16, 1.14, 0.36], rFoot: [-0.24, 0.0, -0.18], lFoot: [0.22, 0.0, 0.22], weaponDir: [0.76, 0.58, 0.28] },
      { t: 0.35, ease: 'linear', hip: [0, 0.86, -0.04], torsoYaw: 0.22, torsoPitch: 0.12, rHand: [-0.16, 1.18, 0.32], lHand: [0.16, 1.14, 0.36], rFoot: [-0.24, 0.0, -0.18], lFoot: [0.22, 0.0, 0.22], weaponDir: [0.76, 0.58, 0.28] },
    ],
  },
  // Dodge roll / low dash
  dodge: {
    duration: 0.42,
    keys: [
      { ...COMBAT_IDLE, t: 0.0 },
      { t: 0.10, ease: 'quartOut', hip: [0, 0.66, 0.16], torsoYaw: -0.25, torsoPitch: 0.56, rHand: [-0.36, 0.68, -0.10], lHand: [0.24, 0.72, 0.38], rFoot: [-0.20, 0.18, -0.30], lFoot: [0.18, 0.0, 0.26], weaponDir: [-0.35, -0.15, -0.92] },
      { t: 0.26, ease: 'cubic', hip: [0, 0.62, 0.20], torsoYaw: -0.15, torsoPitch: 0.48, rHand: [-0.38, 0.66, -0.14], lHand: [0.26, 0.74, 0.36], rFoot: [-0.18, 0.06, -0.24], lFoot: [0.20, 0.0, 0.28], weaponDir: [-0.32, -0.10, -0.94] },
      { ...COMBAT_IDLE, t: 0.42, ease: 'cubic' },
    ],
  },
  // Skill: 文火久煎訣 (Channeling Shennong Decoction Fire)
  skill: {
    duration: 0.82,
    hitWindow: [0.34, 0.60],
    keys: [
      { ...COMBAT_IDLE, t: 0.0 },
      { t: 0.16, ease: 'cubic', hip: [0, 0.84, -0.05], torsoYaw: 0.0, torsoPitch: 0.14, rHand: [-0.22, 1.10, 0.28], lHand: [0.22, 1.10, 0.28], rFoot: [-0.24, 0.0, 0.0], lFoot: [0.24, 0.0, 0.0], weaponDir: [0.0, 0.96, 0.28] },
      { t: 0.30, ease: 'linear', hip: [0, 0.82, -0.06], torsoYaw: 0.0, torsoPitch: 0.16, rHand: [-0.14, 1.14, 0.32], lHand: [0.14, 1.14, 0.32], rFoot: [-0.24, 0.0, 0.0], lFoot: [0.24, 0.0, 0.0], weaponDir: [0.0, 0.98, 0.20] },
      // Burst thrust outward!
      { t: 0.46, ease: 'quartOut', hip: [0, 0.96, 0.12], torsoYaw: 0.0, torsoPitch: -0.06, rHand: [-0.52, 1.24, 0.48], lHand: [0.52, 1.24, 0.48], rFoot: [-0.26, 0.0, -0.08], lFoot: [0.26, 0.0, 0.14], weaponDir: [-0.45, 0.45, 0.77] },
      { t: 0.62, ease: 'cubic', hip: [0, 0.95, 0.10], torsoYaw: 0.0, torsoPitch: -0.04, rHand: [-0.50, 1.20, 0.44], lHand: [0.50, 1.20, 0.44], rFoot: [-0.24, 0.0, -0.06], lFoot: [0.24, 0.0, 0.12], weaponDir: [-0.42, 0.40, 0.81] },
      { ...COMBAT_IDLE, t: 0.82, ease: 'cubic' },
    ],
  },
};

// ============================================================================
// 1. Protagonist: 沈青囊 (Shen Qingnang — Apothecary Swordsman with Shennong Ochre Whip)
// ============================================================================
export function createHeroRig() {
  const root = new THREE.Group();

  // Materials (Xuan-Yuan Sword ink-teal, warm parchment, cinnabar sash, dark bronze)
  const matRobe = new THREE.MeshStandardMaterial({ color: 0x223b40, roughness: 0.82, metalness: 0.08 });
  const matInner = new THREE.MeshStandardMaterial({ color: 0xd2c7b0, roughness: 0.86, metalness: 0.02 });
  const matSash = new THREE.MeshStandardMaterial({ color: 0x8f261e, roughness: 0.68, metalness: 0.12 });
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xdab99c, roughness: 0.76, metalness: 0.02 });
  const matHat = new THREE.MeshStandardMaterial({ color: 0x4f4331, roughness: 0.9, metalness: 0.05 });
  const matBoot = new THREE.MeshStandardMaterial({ color: 0x1a1e20, roughness: 0.85, metalness: 0.1 });
  const matWhipBody = new THREE.MeshStandardMaterial({ color: 0x9c3220, roughness: 0.42, metalness: 0.48 });
  const matWhipGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.75, 0.35) }); // HDR peak ~2.2

  // Pelvis / Hip
  const hip = new THREE.Group();
  hip.position.set(0, 0.94, 0);
  root.add(hip);

  const pelvisMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.26, 8), matRobe);
  pelvisMesh.castShadow = true;
  hip.add(pelvisMesh);

  // Red waist sash + hanging bronze Shennong Mini-Cauldron at left hip
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.045, 6, 14), matSash);
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 0.08;
  hip.add(sash);

  const miniCauldron = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x5c7a66, roughness: 0.4, metalness: 0.75 })
  );
  miniCauldron.position.set(0.25, -0.02, 0.04);
  miniCauldron.scale.set(1, 0.82, 1);
  hip.add(miniCauldron);

  // Torso / Chest
  const torso = new THREE.Group();
  torso.position.set(0, 0.14, 0);
  hip.add(torso);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.44, 8), matRobe);
  chest.position.y = 0.22;
  chest.castShadow = true;
  torso.add(chest);

  const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.22), matInner);
  lapel.position.set(0, 0.24, 0.05);
  torso.add(lapel);

  // Shoulder pauldrons (layered cloth capelet)
  const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 0.18, 10), matRobe);
  mantle.position.y = 0.40;
  mantle.castShadow = true;
  torso.add(mantle);

  // Spring-simulated ink-teal Cloak (3 articulated strips hanging from back of shoulders)
  const cloakPivots = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Group();
    p.position.set(0, i === 0 ? 0.38 : -0.34, i === 0 ? -0.16 : 0);
    const wTop = 0.34 + i * 0.07;
    const wBot = 0.42 + i * 0.09;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(wTop * 0.5, wBot * 0.5, 0.36, 6, 1, true, Math.PI * 0.65, Math.PI * 0.7),
      matRobe
    );
    seg.material.side = THREE.DoubleSide;
    seg.position.y = -0.18;
    seg.castShadow = true;
    p.add(seg);
    if (i === 0) torso.add(p);
    else cloakPivots[i - 1].add(p);
    cloakPivots.push(p);
  }

  // Head + Bamboo Hat (斗笠)
  const head = new THREE.Group();
  head.position.set(0, 0.50, 0);
  torso.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), matSkin);
  skull.position.y = 0.11;
  skull.castShadow = true;
  head.add(skull);

  const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.19, 14), matHat);
  hatCone.position.set(0, 0.24, 0.01);
  hatCone.castShadow = true;
  head.add(hatCone);

  const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.025, 6, 12), matSash);
  hatBand.rotation.x = Math.PI / 2;
  hatBand.position.y = 0.18;
  head.add(hatBand);

  // Limbs helper (mesh extends along -Y from origin)
  const upperArmLen = 0.30, lowerArmLen = 0.28;
  const upperLegLen = 0.44, lowerLegLen = 0.44;

  function makeLimbSegment(len, rTop, rBot, mat) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 7), mat);
    m.position.y = -len / 2;
    m.castShadow = true;
    g.add(m);
    return g;
  }

  const rUpperArm = makeLimbSegment(upperArmLen, 0.068, 0.058, matRobe);
  const rLowerArm = makeLimbSegment(lowerArmLen, 0.062, 0.044, matInner);
  const lUpperArm = makeLimbSegment(upperArmLen, 0.068, 0.058, matRobe);
  const lLowerArm = makeLimbSegment(lowerArmLen, 0.062, 0.044, matInner);

  const rUpperLeg = makeLimbSegment(upperLegLen, 0.088, 0.070, matRobe);
  const rLowerLeg = makeLimbSegment(lowerLegLen, 0.066, 0.048, matBoot);
  const lUpperLeg = makeLimbSegment(upperLegLen, 0.088, 0.070, matRobe);
  const lLowerLeg = makeLimbSegment(lowerLegLen, 0.066, 0.048, matBoot);

  root.add(rUpperArm, rLowerArm, lUpperArm, lLowerArm, rUpperLeg, rLowerLeg, lUpperLeg, lLowerLeg);

  // Weapon: 神農赭鞭 (Shennong Ochre Whip-Rod attached to right hand)
  const weaponGroup = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.26, 7), matBoot);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0.04;
  weaponGroup.add(handle);

  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 6, 10), matWhipGlow);
  guard.position.z = 0.17;
  weaponGroup.add(guard);

  // Articulated ochre whip segments extending along +Z
  const whipSegs = [];
  for (let i = 0; i < 6; i++) {
    const r = 0.026 * (1 - i * 0.11);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, 0.24, 6), i >= 4 ? matWhipGlow : matWhipBody);
    seg.rotation.x = Math.PI / 2;
    seg.position.z = 0.30 + i * 0.22;
    seg.castShadow = true;
    weaponGroup.add(seg);
    whipSegs.push(seg);
  }
  root.add(weaponGroup);

  // Subtle foot ring glow indicator
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.50, 24),
    new THREE.MeshBasicMaterial({ color: 0x6ca6a2, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.03;
  root.add(ringMesh);

  const rig = {
    root,
    weaponGroup,
    whipSegs,
    cloakAngle: 0,
    cloakVel: 0,
    lastProbe: {
      rHand: new THREE.Vector3(),
      lHand: new THREE.Vector3(),
      rFoot: new THREE.Vector3(),
      lFoot: new THREE.Vector3(),
      hipY: 0.94,
    },
    applyPose(action, actionTime, moveSpeed = 0, dt = 1 / 60) {
      let pose;
      if (action === 'idle') {
        const b = Math.sin(actionTime * 2.4) * 0.022;
        pose = {
          hip: [0, 0.94 + b, 0],
          torsoYaw: -0.14 + Math.sin(actionTime * 1.1) * 0.04,
          torsoPitch: 0.04,
          rHand: [-0.30, 0.96 + b * 0.8, 0.22],
          lHand: [0.28, 1.02 + b * 0.8, 0.24],
          rFoot: [-0.18, 0.0, -0.05],
          lFoot: [0.18, 0.0, 0.12],
          weaponDir: [-0.22, 0.20, 0.95],
        };
      } else if (action === 'run') {
        const ph = actionTime * 9.5;
        const s = Math.sin(ph), c = Math.cos(ph);
        pose = {
          hip: [0, 0.90 + Math.abs(s) * 0.06, 0.05],
          torsoYaw: s * 0.22,
          torsoPitch: 0.22,
          rHand: [-0.34, 0.96 - s * 0.14, 0.14 - s * 0.28],
          lHand: [0.34, 0.98 + s * 0.14, 0.14 + s * 0.28],
          rFoot: [-0.18, Math.max(0, c) * 0.22, s * 0.38],
          lFoot: [0.18, Math.max(0, -c) * 0.22, -s * 0.38],
          weaponDir: [-0.30, -0.12, -0.94],
        };
      } else if (HERO_CLIPS[action]) {
        const clip = HERO_CLIPS[action];
        pose = sampleKeyframes(clip.keys, Math.min(actionTime, clip.duration));
      } else {
        pose = COMBAT_IDLE;
      }

      // Apply hip & torso
      hip.position.set(pose.hip[0], pose.hip[1], pose.hip[2]);
      torso.rotation.set(pose.torsoPitch, pose.torsoYaw, 0);
      head.rotation.set(-pose.torsoPitch * 0.5, -pose.torsoYaw * 0.45, 0);

      // Compute shoulder & hip socket positions in character-local space
      const sy = pose.hip[1] + 0.50;
      const cosY = Math.cos(pose.torsoYaw), sinY = Math.sin(pose.torsoYaw);
      const rShoulder = new THREE.Vector3(-0.24 * cosY, sy, 0.24 * sinY + pose.hip[2] + pose.torsoPitch * 0.25);
      const lShoulder = new THREE.Vector3(0.24 * cosY, sy, -0.24 * sinY + pose.hip[2] + pose.torsoPitch * 0.25);
      const rHipSock = new THREE.Vector3(pose.hip[0] - 0.13, pose.hip[1] - 0.06, pose.hip[2]);
      const lHipSock = new THREE.Vector3(pose.hip[0] + 0.13, pose.hip[1] - 0.06, pose.hip[2]);

      const rHandTgt = new THREE.Vector3(...pose.rHand);
      const lHandTgt = new THREE.Vector3(...pose.lHand);
      const rFootTgt = new THREE.Vector3(...pose.rFoot);
      const lFootTgt = new THREE.Vector3(...pose.lFoot);

      // Solve 2-bone IK for all 4 limbs
      const rArmIK = solveTwoBoneIK(rShoulder, rHandTgt, new THREE.Vector3(-0.65, sy - 0.15, -0.45), upperArmLen, lowerArmLen);
      const lArmIK = solveTwoBoneIK(lShoulder, lHandTgt, new THREE.Vector3(0.65, sy - 0.15, -0.45), upperArmLen, lowerArmLen);
      const rLegIK = solveTwoBoneIK(rHipSock, rFootTgt, new THREE.Vector3(-0.18, 0.45, 0.75), upperLegLen, lowerLegLen);
      const lLegIK = solveTwoBoneIK(lHipSock, lFootTgt, new THREE.Vector3(0.18, 0.45, 0.75), upperLegLen, lowerLegLen);

      alignLimb(rUpperArm, rShoulder, rArmIK.midPos);
      alignLimb(rLowerArm, rArmIK.midPos, rArmIK.endPos);
      alignLimb(lUpperArm, lShoulder, lArmIK.midPos);
      alignLimb(lLowerArm, lArmIK.midPos, lArmIK.endPos);

      alignLimb(rUpperLeg, rHipSock, rLegIK.midPos);
      alignLimb(rLowerLeg, rLegIK.midPos, rLegIK.endPos);
      alignLimb(lUpperLeg, lHipSock, lLegIK.midPos);
      alignLimb(lLowerLeg, lLegIK.midPos, lLegIK.endPos);

      // Align Shennong Ochre Whip to right hand + target weaponDir
      weaponGroup.position.copy(rArmIK.endPos);
      const wDir = new THREE.Vector3(...pose.weaponDir).normalize();
      weaponGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), wDir);

      // Subtle whip-tip flex during attacks
      const flexAmp = action.startsWith('atk') ? 0.14 : 0.03;
      for (let i = 0; i < whipSegs.length; i++) {
        whipSegs[i].position.x = Math.sin(actionTime * 16 - i * 0.7) * flexAmp * (i / 5);
      }

      // Spring cloak trail
      const targetCloak = 0.14 + Math.min(0.65, moveSpeed * 0.08) + (action === 'dodge' ? 0.5 : 0);
      const force = (targetCloak - rig.cloakAngle) * 28 - rig.cloakVel * 6.5;
      rig.cloakVel += force * dt;
      rig.cloakAngle += rig.cloakVel * dt;
      cloakPivots.forEach((p, idx) => {
        p.rotation.x = rig.cloakAngle * (0.6 + idx * 0.25) + Math.sin(actionTime * 3.5 + idx) * 0.05;
      });

      // Record probe values
      rig.lastProbe.rHand.copy(rArmIK.endPos);
      rig.lastProbe.lHand.copy(lArmIK.endPos);
      rig.lastProbe.rFoot.copy(rLegIK.endPos);
      rig.lastProbe.lFoot.copy(lLegIK.endPos);
      rig.lastProbe.hipY = pose.hip[1];
    },
  };

  rig.applyPose('idle', 0, 0, 1 / 60);
  return rig;
}

// ============================================================================
// 2. Enemy 1: 生半夏瘴妖 (Raw Pinellia Miasma Fiend — Melee + Respiratory Poison)
// ============================================================================
export function createPinelliaRig() {
  const root = new THREE.Group();
  const matBody = new THREE.MeshStandardMaterial({ color: 0x3b4d3e, roughness: 0.85, metalness: 0.06 });
  const matMask = new THREE.MeshStandardMaterial({ color: 0xc8d4b8, roughness: 0.65 });
  const matGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.85, 0.72) });

  const body = new THREE.Group();
  body.position.y = 0.92;
  root.add(body);

  const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 1), matBody);
  torso.scale.set(1.0, 1.25, 0.95);
  torso.castShadow = true;
  body.add(torso);

  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), matMask);
  mask.position.set(0, 0.32, 0.32);
  mask.scale.set(0.95, 1.15, 0.7);
  body.add(mask);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), matGlow);
    eye.position.set(s * 0.09, 0.35, 0.48);
    body.add(eye);
  }

  // Clawed root arms
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.44, 0.16, 0.05);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.04, 0.85, 6), matBody);
    limb.position.set(0, -0.38, 0.18);
    limb.rotation.x = -0.45;
    limb.castShadow = true;
    arm.add(limb);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 5), matGlow);
    claw.position.set(0, -0.78, 0.36);
    claw.rotation.x = Math.PI * 0.72;
    arm.add(claw);
    body.add(arm);
    arms.push(arm);
  }

  // Floating toxic spore pods
  const spores = [];
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 7), matGlow);
    body.add(sp);
    spores.push(sp);
  }

  return {
    root,
    update(t, mode = 'idle') {
      const bob = Math.sin(t * 3.2) * 0.08;
      body.position.y = 0.92 + bob;
      body.rotation.x = mode === 'attack' ? 0.35 : 0.12;
      arms[0].rotation.x = mode === 'attack' ? -1.1 * Math.sin(t * 10) : Math.sin(t * 2.5) * 0.18;
      arms[1].rotation.x = mode === 'attack' ? 1.1 * Math.sin(t * 10) : -Math.sin(t * 2.5) * 0.18;
      spores.forEach((sp, i) => {
        const a = t * 1.8 + (i * Math.PI * 2) / 3;
        sp.position.set(Math.cos(a) * 0.65, 0.45 + Math.sin(t * 3 + i) * 0.12, Math.sin(a) * 0.65);
      });
    },
  };
}

// ============================================================================
// 3. Enemy 2: 巴豆火毒靈 (Croton Oil Fire-Imp — Ranged Deflectable Barrage)
// ============================================================================
export function createCrotonRig() {
  const root = new THREE.Group();
  const matShell = new THREE.MeshStandardMaterial({ color: 0x3b1f1c, roughness: 0.75, metalness: 0.18 });
  const matFire = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.72, 0.18) });

  const body = new THREE.Group();
  body.position.y = 1.25;
  root.add(body);

  // Cracked seed-pod shell
  const pod = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 1), matShell);
  pod.scale.set(0.95, 1.32, 0.9);
  pod.castShadow = true;
  body.add(pod);

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), matFire);
  core.position.z = 0.22;
  body.add(core);

  // Orbiting croton-oil fire embers
  const orbs = [];
  for (let i = 0; i < 4; i++) {
    const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), matFire);
    body.add(o);
    orbs.push(o);
  }

  return {
    root,
    update(t, mode = 'idle') {
      body.position.y = 1.25 + Math.sin(t * 3.8) * 0.16;
      pod.rotation.y = Math.sin(t * 1.5) * 0.2;
      const r = mode === 'attack' ? 0.95 : 0.68;
      orbs.forEach((o, i) => {
        const a = t * (mode === 'attack' ? 5.2 : 2.4) + (i * Math.PI) / 2;
        o.position.set(Math.cos(a) * r, Math.sin(a * 2) * 0.22, Math.sin(a) * r);
      });
    },
  };
}

// ============================================================================
// 4. Enemy 3: 甘遂水蠱精 (Kansui Water-Root Spirit — Ground Eruption / Clashes with Licorice!)
// ============================================================================
export function createKansuiRig() {
  const root = new THREE.Group();
  const matWood = new THREE.MeshStandardMaterial({ color: 0x1e353d, roughness: 0.72, metalness: 0.15 });
  const matAqua = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 1.45, 1.95) });

  const body = new THREE.Group();
  body.position.y = 1.05;
  root.add(body);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.75, 7), matWood);
  spire.castShadow = true;
  body.add(spire);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.055, 6, 16), matAqua);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.55;
  body.add(halo);

  const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), matAqua);
  eye.position.set(0, 0.35, 0.34);
  body.add(eye);

  return {
    root,
    update(t, mode = 'idle') {
      body.position.y = 1.05 + Math.sin(t * 2.6) * 0.12;
      halo.rotation.z = t * (mode === 'attack' ? 5.0 : 1.6);
      halo.scale.setScalar(mode === 'attack' ? 1.25 : 1.0);
    },
  };
}

// ============================================================================
// 5. Boss: 生川烏・千載烏頭魔尊 (Raw Aconite Demon Lord — 3.1m Towering Armored Boss)
// ============================================================================
export function createBossRig() {
  const root = new THREE.Group();

  const matArmor = new THREE.MeshStandardMaterial({ color: 0x1c1a24, roughness: 0.58, metalness: 0.45 });
  const matBone = new THREE.MeshStandardMaterial({ color: 0xbfb49c, roughness: 0.72, metalness: 0.08 });
  // Toxic Aconitine Armor Glow (will turn warm gold-amber when decoction-broken!)
  const matToxicArmor = new THREE.MeshStandardMaterial({
    color: 0x3b1854,
    emissive: new THREE.Color(1.25, 0.30, 1.95),
    roughness: 0.32,
    metalness: 0.35,
  });

  const hip = new THREE.Group();
  hip.position.set(0, 1.48, 0);
  root.add(hip);

  // Heavy lower war-skirt
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.78, 1.15, 8), matArmor);
  skirt.position.y = -0.35;
  skirt.castShadow = true;
  hip.add(skirt);

  // Massive Armored Torso
  const torso = new THREE.Group();
  torso.position.y = 0.25;
  hip.add(torso);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 0.96, 8), matArmor);
  chest.position.y = 0.48;
  chest.castShadow = true;
  torso.add(chest);

  // Glowing Aconitine Crystal Chest Core & Shoulder Pauldrons
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), matToxicArmor);
  core.position.set(0, 0.58, 0.46);
  torso.add(core);

  for (const s of [-1, 1]) {
    const pauldron = new THREE.Mesh(new THREE.DodecahedronGeometry(0.40, 0), matToxicArmor);
    pauldron.position.set(s * 0.78, 0.86, 0);
    pauldron.scale.set(1.15, 0.85, 1.0);
    pauldron.castShadow = true;
    torso.add(pauldron);
  }

  // Horned Aconite Crown Head
  const head = new THREE.Group();
  head.position.set(0, 1.05, 0.05);
  torso.add(head);

  const helm = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 1), matArmor);
  helm.position.y = 0.22;
  helm.castShadow = true;
  head.add(helm);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 6), matToxicArmor);
    eye.position.set(s * 0.13, 0.24, 0.28);
    head.add(eye);

    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.78, 6), matBone);
    horn.position.set(s * 0.34, 0.56, -0.05);
    horn.rotation.z = -s * 0.52;
    horn.castShadow = true;
    head.add(horn);
  }

  // Arms + Giant Bone-Root Glaive (right arm)
  const rArm = new THREE.Group();
  rArm.position.set(-0.78, 0.72, 0);
  torso.add(rArm);
  const rArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 1.15, 7), matArmor);
  rArmMesh.position.y = -0.55;
  rArmMesh.castShadow = true;
  rArm.add(rArmMesh);

  // Massive Glaive Weapon
  const glaive = new THREE.Group();
  glaive.position.set(0, -1.08, 0.15);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 3.1, 7), matBone);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.85;
  glaive.add(shaft);

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.56, 1.15), matToxicArmor);
  blade.position.set(0, 0.12, 2.35);
  blade.castShadow = true;
  glaive.add(blade);
  rArm.add(glaive);

  const lArm = new THREE.Group();
  lArm.position.set(0.78, 0.72, 0);
  torso.add(lArm);
  const lArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 1.12, 7), matArmor);
  lArmMesh.position.y = -0.52;
  lArmMesh.castShadow = true;
  lArm.add(lArmMesh);

  return {
    root,
    matToxicArmor,
    setDecoctionBroken(broken) {
      if (broken) {
        matToxicArmor.color.setHex(0x8c5a20);
        matToxicArmor.emissive.setRGB(1.85, 1.10, 0.30); // Warm decoction amber!
      } else {
        matToxicArmor.color.setHex(0x3b1854);
        matToxicArmor.emissive.setRGB(1.25, 0.30, 1.95); // Raw toxic purple!
      }
    },
    update(t, mode = 'idle') {
      const breath = Math.sin(t * 2.1) * 0.06;
      hip.position.y = 1.48 + breath;
      if (mode === 'attack') {
        const s = Math.sin(t * 6.5);
        torso.rotation.y = s * 0.75;
        rArm.rotation.set(-0.95 + s * 0.65, 0, -0.35);
        lArm.rotation.set(-0.4 - s * 0.3, 0, 0.35);
      } else {
        torso.rotation.y = Math.sin(t * 1.1) * 0.12;
        rArm.rotation.set(-0.32 + breath, 0, -0.18);
        lArm.rotation.set(-0.22 - breath, 0, 0.22);
      }
    },
  };
}
