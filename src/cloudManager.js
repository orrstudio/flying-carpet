import * as THREE from 'three';
import { loadCloudInstanced, createFallbackCloudInstanced } from './loadModels.js';
import { computeRight } from './pathUtils.js';

export async function createCloudsForPath(scene, path, options = {}) {
  // options: { cloudCount, particlesPerCloud, width, bias, modelUrl }
  const {
    cloudCount = 30,
    particlesPerCloud = 18,
    width = 18,      // макс смещение по бокам (увеличил для большего разброса)
    bias = 0,        // сдвиг в сторону (-1 left .. 1 right)
    // minOffset: минимальная относительная дистанция от центра пути (0..1).
    // Значение 0.6 означает, что облако будет как минимум на 60% от `width` вбок (чтобы не стоять по центру)
    minOffset = 0.6,
    // фиксированный радиус облака (все облака одинакового размера)
    cloudRadius = 4.0,
    modelUrl = '/assets/models/cloud.glb'
  } = options;

  // build variants array: accept either array or derive -1/-2/-3 variants from base name
  let variants = [];
  if (Array.isArray(modelUrl) && modelUrl.length > 0) variants = modelUrl.slice();
  else {
    const url = String(modelUrl);
    const m = url.match(/^(.*?)(\.[^.]+)$/);
    if (m) {
      const baseNoExt = m[1];
      const ext = m[2];
      variants = [url, baseNoExt + '-1' + ext, baseNoExt + '-2' + ext, baseNoExt + '-3' + ext];
    } else variants = [url];
  }

  // distribute cloudCount positions chaotically among variants
  const variantUs = variants.map(() => []);
  for (let i = 0; i < cloudCount; i++) {
    const u = Math.random(); // chaotic distribution along the path
    const vi = Math.floor(Math.random() * variants.length);
    variantUs[vi].push(u);
  }

  const createdInstanced = [];
  // For each variant, load instanced mesh with count = variantUs[vi].length
  for (let vi = 0; vi < variants.length; vi++) {
    const countForVariant = variantUs[vi].length;
    if (countForVariant === 0) continue;

    let inst;
    try {
      inst = await loadCloudInstanced(variants[vi], countForVariant);
    } catch (_) {
      inst = createFallbackCloudInstanced(countForVariant, particlesPerCloud);
    }

    // compute cloud metadata (base U along path + lateral/vertical offsets) and set instance matrices
    const cloudsMeta = [];
    const baseOffsets = [];
    const dummy = new THREE.Object3D();
    const particles = inst.userData && inst.userData.particlesPerCloud ? inst.userData.particlesPerCloud : particlesPerCloud;

    // build baseUs from the randomized u's but ensure clouds don't overlap (min distance)
    const desired = variantUs[vi].length;
    const maxAttempts = desired * 12 + 50;
    let attempts = 0;
    while (cloudsMeta.length < desired && attempts < maxAttempts) {
      attempts++;
      const u = THREE.MathUtils.clamp(variantUs[vi][cloudsMeta.length % variantUs[vi].length], 0, 1);
      const basePoint = path.getPointAt(u).clone();
      const tangent = path.getTangentAt(u).normalize();
      const right = computeRight(tangent);

      // выбираем сторону (влево/вправо) и случайную величину в диапазоне [minOffset .. 1]
      const sign = Math.random() < 0.5 ? -1 : 1;
      const magnitude = minOffset + Math.random() * (1 - minOffset);
      const lateralSigned = sign * magnitude; // в диапазоне [-1..-minOffset] U [minOffset..1]
      let shift = (lateralSigned + bias) * 0.5 * width;

      // если сдвиг оказался слишком близко к центру — дополнительно отталкиваем
      if (Math.abs(shift) < width * 0.18) shift += (shift < 0 ? -1 : 1) * width * 0.4;

      const worldCenter = basePoint.clone();
      worldCenter.addScaledVector(right, shift);
      // добавим небольшую вертикальную вариацию, чтобы облака не стояли на одном горизонте
      const vy = (Math.random() - 0.5) * 3.0;
      worldCenter.y += vy;

      // используем фиксированный радиус облака (все облака одного размера)
      const cloudRadiusLocal = cloudRadius;

      // проверяем, чтобы новый центр был не ближе, чем сумма радиусов * фактор
      let ok = true;
      for (let k = 0; k < cloudsMeta.length; k++) {
        const other = cloudsMeta[k];
        // compute other world position for overlap checking
        const otherBase = path.getPointAt(other.u).clone();
        const otherTangent = path.getTangentAt(other.u).normalize();
        const otherRight = computeRight(otherTangent);
        const otherWorld = otherBase.clone().addScaledVector(otherRight, other.lateralShift);
        otherWorld.y += other.vy;
        const minDist = (cloudRadiusLocal + (other.userRadius || cloudRadiusLocal)) * 1.0;
        if (worldCenter.distanceTo(otherWorld) < minDist) {
          ok = false;
          break;
        }
      }

      if (!ok) continue;

      // attach userRadius so future checks can use it
      // store metadata instead of fixed center so we can animate along path preserving lateral/vertical offsets
      const meta = { u, lateralShift: shift, vy, userRadius: cloudRadiusLocal };
      cloudsMeta.push(meta);
    }
    // fill instanced matrices grouping particles per cloud
    let idx = 0;
    const baseUs = [];
    for (let c = 0; c < cloudsMeta.length; c++) {
      const meta = cloudsMeta[c];
      const r = meta.userRadius || cloudRadius;
      const cloudScale = r * 0.7;
      // compute initial world center for instancing
      const basePos = path.getPointAt(meta.u).clone();
      const tan = path.getTangentAt(meta.u).normalize();
      const right = computeRight(tan);
      const centerWorld = basePos.clone().addScaledVector(right, meta.lateralShift);
      centerWorld.y += meta.vy;
      for (let p = 0; p < particles; p++) {
        // random point inside sphere radius r (biased towards center)
        const u1 = Math.random();
        const u2 = Math.random();
        const theta = 2 * Math.PI * u1;
        const phi = Math.acos(2 * u2 - 1);
        const rad = Math.cbrt(Math.random()) * r * 0.85;
        const rx = rad * Math.sin(phi) * Math.cos(theta);
        const ry = rad * Math.cos(phi) * 0.5; // slightly flattened vertically
        const rz = rad * Math.sin(phi) * Math.sin(theta);
        dummy.position.set(centerWorld.x + rx, centerWorld.y + ry, centerWorld.z + rz);
        dummy.scale.setScalar(cloudScale);
        dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(idx++, dummy.matrix);
        baseOffsets.push(new THREE.Vector3(rx, ry, rz));
      }
      baseUs.push(meta.u);
    }

    inst.instanceMatrix.needsUpdate = true;
    inst.userData = {
      particlesPerCloud: particles,
      cloudCount: cloudsMeta.length,
      baseUs,
      cloudsMeta,
      baseOffsets,
      cloudRadius,
      cloudScale: (cloudRadius * 0.7),
      // offset along the path for animation (shared speed -> no overtaking)
      cloudOffset: 0,
      cloudSpeed: 0.015
    };
    scene.add(inst);
    createdInstanced.push(inst);
  }

  // return either the single instanced if one variant or array of instanced meshes
  return createdInstanced.length === 1 ? createdInstanced[0] : createdInstanced;
}

// helper to remove previous instanced mesh from scene
export function removeClouds(scene, instanced) {
  if (!instanced) return;
  scene.remove(instanced);
  if (instanced.geometry) instanced.geometry.dispose();
  if (instanced.material) {
    if (Array.isArray(instanced.material)) instanced.material.forEach(m => m.dispose && m.dispose());
    else instanced.material.dispose && instanced.material.dispose();
  }
}