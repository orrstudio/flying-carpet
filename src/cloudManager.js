import * as THREE from 'three';
import { loadCloudInstanced, createFallbackCloudInstanced } from './loadModels.js';
import { computeRight } from './pathUtils.js';

export async function createCloudsForPath(scene, path, options = {}) {
  // options: { cloudCount, particlesPerCloud, width, bias, modelUrl }
  const {
    cloudCount = 80,
    particlesPerCloud = 8,
    width = 12,      // макс смещение по бокам
    bias = 0,        // сдвиг в сторону (-1 left .. 1 right)
    // minOffset: минимальная относительная дистанция от центра пути (0..1).
    // Значение 0.2 означает, что облако будет как минимум на 20% от `width` вбок.
    minOffset = 0.5,
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

    // recompute centers along path for this variant and set instance matrices
    const centers = [];
    const baseOffsets = [];
    const dummy = new THREE.Object3D();
    const particles = inst.userData && inst.userData.particlesPerCloud ? inst.userData.particlesPerCloud : particlesPerCloud;

    // build centers from the randomized u's
    for (let j = 0; j < variantUs[vi].length; j++) {
      const u = THREE.MathUtils.clamp(variantUs[vi][j], 0, 1);
      const center = path.getPointAt(u).clone();
      const tangent = path.getTangentAt(u).normalize();
      const right = computeRight(tangent);

      // выбираем знак (влево/вправо) и случайную величину в диапазоне [minOffset .. 1]
      const sign = Math.random() < 0.5 ? -1 : 1;
      const magnitude = minOffset + Math.random() * (1 - minOffset);
      const lateralSigned = sign * magnitude; // в диапазоне [-1..-minOffset] U [minOffset..1]
      const shift = (lateralSigned + bias) * 0.5 * width;
      center.addScaledVector(right, shift);
      centers.push(center);
    }

    // fill instanced matrices grouping particles per cloud
    let idx = 0;
    for (let c = 0; c < centers.length; c++) {
      const center = centers[c];
      for (let p = 0; p < particles; p++) {
        const rx = (Math.random() - 0.5) * 2.4;
        const ry = (Math.random() - 0.5) * 1.2;
        const rz = (Math.random() - 0.5) * 2.0;
        dummy.position.set(center.x + rx, center.y + ry, center.z + rz);
        const s = 0.5 + Math.random() * 1.6;
        dummy.scale.setScalar(s);
        dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
        dummy.updateMatrix();
        inst.setMatrixAt(idx++, dummy.matrix);
        baseOffsets.push(new THREE.Vector3(rx, ry, rz));
      }
    }

    inst.instanceMatrix.needsUpdate = true;
    inst.userData = { particlesPerCloud: particles, cloudCount: centers.length, centers, baseOffsets };
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