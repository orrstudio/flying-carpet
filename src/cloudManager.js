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
    modelUrl = '/assets/models/cloud.glb'
  } = options;

  // try load model; if failed, create fallback
  let inst;
  try {
    inst = await loadCloudInstanced(modelUrl, cloudCount);
  } catch (_) {
    inst = createFallbackCloudInstanced(cloudCount, particlesPerCloud);
  }

  // recompute centers along path and set instance matrices with lateral distribution
  const centers = [];
  const baseOffsets = [];
  const dummy = new THREE.Object3D();
  const particles = inst.userData && inst.userData.particlesPerCloud ? inst.userData.particlesPerCloud : particlesPerCloud;
  // compute sample points along the path
  for (let i = 0; i < cloudCount; i++) {
    const u = i / Math.max(1, cloudCount - 1);
    const center = path.getPointAt(u);
    // compute tangent & right vector to offset left/right
    const tangent = path.getTangentAt(u).normalize();
    const right = computeRight(tangent);
    const lateral = (Math.random() - 0.5) * 2; // [-1..1]
    // bias and width control
    const shift = (lateral + bias) * 0.5 * width;
    center.addScaledVector(right, shift);
    centers.push(center.clone());
  }

  // fill instanced matrices grouping particles per cloud
  let idx = 0;
  for (let c = 0; c < cloudCount; c++) {
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
  inst.userData = { particlesPerCloud: particles, cloudCount, centers, baseOffsets };

  scene.add(inst);
  return inst;
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