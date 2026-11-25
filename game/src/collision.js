import { walkableSDF } from './terrain.js';

// Obstacle registry: circles { type:'circle', x, z, r } and capsules { type:'capsule', ax, az, bx, bz, r }
export const obstacles = [];
export const occluders = []; // { mesh/group, x, z, radius, mats: Material[] }
export const interactables = []; // For Stage 4+ (cinnabar mines, stele, medicine cabinet)

export function clearWorldRegistry() {
  obstacles.length = 0;
  occluders.length = 0;
  interactables.length = 0;
}

export function addCircleObstacle(x, z, r) {
  obstacles.push({ type: 'circle', x, z, r });
}

export function addCapsuleObstacle(ax, az, bx, bz, r) {
  obstacles.push({ type: 'capsule', ax, az, bx, bz, r });
}

export function registerOccluder(root, x, z, radius = 2.4) {
  const mats = [];
  root.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      const m = obj.material.clone();
      m.transparent = true;
      m.opacity = 1;
      obj.material = m;
      mats.push(m);
    }
  });
  occluders.push({ root, x, z, radius, mats, curOpacity: 1 });
}

function pointToSegmentDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 1e-6 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq)) : 0;
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return { dx: px - cx, dz: pz - cz, dist: Math.hypot(px - cx, pz - cz) };
}

export function isPointValid(x, z, radius = 0.55) {
  if (walkableSDF(x, z) > -radius) return false;
  for (const o of obstacles) {
    if (o.type === 'circle') {
      if (Math.hypot(x - o.x, z - o.z) < o.r + radius) return false;
    } else {
      const { dist } = pointToSegmentDist(x, z, o.ax, o.az, o.bx, o.bz);
      if (dist < o.r + radius) return false;
    }
  }
  return true;
}

// Push out of obstacles + mountain rim; if unresolvable, fall back to old safe position
export function resolveMovement(oldX, oldZ, targetX, targetZ, radius = 0.55) {
  let x = targetX;
  let z = targetZ;

  for (let iter = 0; iter < 3; iter++) {
    // Push out of static obstacles
    for (const o of obstacles) {
      if (o.type === 'circle') {
        const dx = x - o.x, dz = z - o.z;
        const d = Math.hypot(dx, dz);
        const minD = o.r + radius;
        if (d < minD) {
          const nx = d > 1e-5 ? dx / d : 1;
          const nz = d > 1e-5 ? dz / d : 0;
          x = o.x + nx * (minD + 0.01);
          z = o.z + nz * (minD + 0.01);
        }
      } else {
        const { dx, dz, dist } = pointToSegmentDist(x, z, o.ax, o.az, o.bx, o.bz);
        const minD = o.r + radius;
        if (dist < minD) {
          const nx = dist > 1e-5 ? dx / dist : 1;
          const nz = dist > 1e-5 ? dz / dist : 0;
          x += nx * (minD - dist + 0.01);
          z += nz * (minD - dist + 0.01);
        }
      }
    }

    // Keep inside walkable mountain SDF using central difference gradient
    const sdf = walkableSDF(x, z);
    if (sdf > -radius) {
      const eps = 0.25;
      const gx = (walkableSDF(x + eps, z) - walkableSDF(x - eps, z)) / (2 * eps);
      const gz = (walkableSDF(x, z + eps) - walkableSDF(x, z - eps)) / (2 * eps);
      const gl = Math.hypot(gx, gz) || 1;
      const push = sdf + radius + 0.03;
      x -= (gx / gl) * push;
      z -= (gz / gl) * push;
    }
  }

  // Never accept an invalid position
  if (!isPointValid(x, z, radius * 0.92)) {
    return { x: oldX, z: oldZ, blocked: true };
  }
  return { x, z, blocked: false };
}

// Fade tall props that sit between camera and focus target
export function updateOccluders(camPos, focusPos, dt) {
  const vx = focusPos.x - camPos.x;
  const vz = focusPos.z - camPos.z;
  const segLenSq = vx * vx + vz * vz;

  for (const occ of occluders) {
    let targetAlpha = 1.0;
    if (segLenSq > 1.0) {
      const t = ((occ.x - camPos.x) * vx + (occ.z - camPos.z) * vz) / segLenSq;
      if (t > 0.08 && t < 0.96) {
        const cx = camPos.x + vx * t;
        const cz = camPos.z + vz * t;
        const dist = Math.hypot(occ.x - cx, occ.z - cz);
        if (dist < occ.radius) {
          targetAlpha = 0.26;
        }
      }
    }
    occ.curOpacity += (targetAlpha - occ.curOpacity) * Math.min(1, dt * 8);
    for (const m of occ.mats) {
      m.opacity = occ.curOpacity;
      m.depthWrite = occ.curOpacity > 0.85;
    }
  }
}

// Full-map grid scan to guarantee zero stuck spots
export function scanWalkableMap() {
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707],
  ];
  let tested = 0;
  let stuck = [];

  for (let z = -38; z <= 34; z += 2.5) {
    for (let x = -16; x <= 16; x += 2.5) {
      if (!isPointValid(x, z, 0.6)) continue;
      tested++;
      let canEscape = false;
      for (const [dx, dz] of dirs) {
        let cx = x, cz = z;
        for (let step = 0; step < 20; step++) {
          const res = resolveMovement(cx, cz, cx + dx * 0.22, cz + dz * 0.22, 0.55);
          cx = res.x; cz = res.z;
        }
        if (Math.hypot(cx - x, cz - z) > 0.6) {
          // Try returning back
          let rx = cx, rz = cz;
          for (let step = 0; step < 20; step++) {
            const res = resolveMovement(rx, rz, rx - dx * 0.22, rz - dz * 0.22, 0.55);
            rx = res.x; rz = res.z;
          }
          if (Math.hypot(rx - cx, rz - cz) > 0.4) {
            canEscape = true;
            break;
          }
        }
      }
      if (!canEscape) stuck.push({ x, z });
    }
  }
  return { tested, stuckCount: stuck.length, stuck };
}
