import * as THREE from 'three';

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _vD = new THREE.Vector3();
const _vE = new THREE.Vector3();
const _qTmp = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _down = new THREE.Vector3(0, -1, 0);

// Analytical two-bone IK in character-local space (+Y up, +Z forward, right side -X)
// Computes joint mid-point (elbow/knee) and orientates upper/lower limb meshes (whose local -Y runs along bone length)
export function solveTwoBoneIK(rootPos, targetPos, poleHint, len1, len2) {
  const toTarget = _vA.subVectors(targetPos, rootPos);
  const rawDist = toTarget.length();
  const maxReach = (len1 + len2) * 0.995;
  const minReach = Math.abs(len1 - len2) + 0.02;
  const d = Math.max(minReach, Math.min(maxReach, rawDist));

  const dir = _vB.copy(toTarget).normalize();
  // Law of cosines for angle at root
  const cosAngle = Math.max(-1, Math.min(1, (len1 * len1 + d * d - len2 * len2) / (2 * len1 * d)));
  const sinAngle = Math.sqrt(Math.max(0, 1 - cosAngle * cosAngle));

  // Orthogonal bend direction from poleHint
  const poleVec = _vC.subVectors(poleHint, rootPos);
  const proj = poleVec.dot(dir);
  const bendDir = _vD.copy(poleVec).addScaledVector(dir, -proj);
  if (bendDir.lengthSq() < 1e-6) {
    bendDir.set(0, 0, 1);
  } else {
    bendDir.normalize();
  }

  // Mid joint (elbow or knee) in character-local space
  const midPos = new THREE.Vector3()
    .copy(rootPos)
    .addScaledVector(dir, len1 * cosAngle)
    .addScaledVector(bendDir, len1 * sinAngle);

  const endPos = new THREE.Vector3()
    .copy(rootPos)
    .addScaledVector(dir, d);

  return { midPos, endPos };
}

// Orient a bone group placed at `start` so its local -Y axis points toward `end`
export function alignLimb(group, start, end) {
  group.position.copy(start);
  const dir = _vE.subVectors(end, start).normalize();
  if (dir.lengthSq() > 1e-6) {
    _qTmp.setFromUnitVectors(_down, dir);
    group.quaternion.copy(_qTmp);
  }
}

// Quartic ease-out for snappy attack swing (characters-animation.md)
export function easeOutQuart(t) {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u * u;
}

export function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// Interpolate keyframe pose tables with per-segment easing
export function sampleKeyframes(keys, t) {
  if (t <= keys[0].t) return keys[0];
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = Math.max(1e-5, b.t - a.t);
      let u = (t - a.t) / span;
      if (b.ease === 'quartOut') u = easeOutQuart(u);
      else if (b.ease === 'cubic') u = easeInOutCubic(u);
      return lerpPose(a, b, u);
    }
  }
  return keys[0];
}

function lerpVec(a, b, u) {
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ];
}

function lerpPose(a, b, u) {
  return {
    hip: lerpVec(a.hip, b.hip, u),
    torsoYaw: a.torsoYaw + (b.torsoYaw - a.torsoYaw) * u,
    torsoPitch: a.torsoPitch + (b.torsoPitch - a.torsoPitch) * u,
    rHand: lerpVec(a.rHand, b.rHand, u),
    lHand: lerpVec(a.lHand, b.lHand, u),
    rFoot: lerpVec(a.rFoot, b.rFoot, u),
    lFoot: lerpVec(a.lFoot, b.lFoot, u),
    weaponDir: lerpVec(a.weaponDir, b.weaponDir, u),
  };
}

// Joint numerical probe (relative to character root)
export function probeHumanoidRig(rig) {
  const fmt = (v) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
  return {
    rHand: fmt(rig.lastProbe.rHand),
    lHand: fmt(rig.lastProbe.lHand),
    rFoot: fmt(rig.lastProbe.rFoot),
    lFoot: fmt(rig.lastProbe.lFoot),
    hipY: rig.lastProbe.hipY.toFixed(2),
  };
}
