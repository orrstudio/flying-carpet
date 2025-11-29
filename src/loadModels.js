import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// loadCloudInstanced: пытается загрузить modelUrl; если не получится — вернёт fallback
// IMPORTANT: возвращаем instanced mesh и userData: { particlesPerCloud, cloudCount, centers, baseOffsets }
export async function loadCloudInstanced(modelUrl = '/assets/models/cloud.glb', count = 60, pathToDraco = 'https://www.gstatic.com/draco/v1/decoders/') {
  try {
    // quick HEAD check (may fail on some servers) - ignored errors
    try {
      const head = await fetch(modelUrl, { method: 'HEAD' });
      if (!head.ok) throw new Error('Model not found by HEAD');
    } catch (e) { /* continue, loader will throw if not found */ }

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(pathToDraco);

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    const gltf = await new Promise((res, rej) => {
      loader.load(modelUrl, r => res(r), undefined, e => rej(e));
    });

    let mesh = null;
    gltf.scene.traverse(node => {
      if (!mesh && node.isMesh && node.geometry && node.geometry.isBufferGeometry) mesh = node;
    });

    if (!mesh) {
      dracoLoader.dispose();
      console.warn('loadCloudInstanced: no mesh found in glTF, fallback used');
      return createFallbackCloudInstanced(count);
    }

    const geom = mesh.geometry.clone();
    const mat = Array.isArray(mesh.material) ? mesh.material[0].clone() : mesh.material.clone();
    mat.transparent = true;
    mat.opacity = mat.opacity ?? 1.0;
    mat.depthWrite = false; // для мягкости наложения

    const particlesPerCloud = 6; // если используем одну модель как puff — можно варьировать
    const total = count * particlesPerCloud;
    const inst = new THREE.InstancedMesh(geom, mat, total);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // сохранение данных для когерентной анимации
    const centers = [];
    const baseOffsets = []; // для каждого инстанса — локальный оффсет относительно центра cloud
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let c = 0; c < count; c++) {
      const cx = (Math.random() - 0.5) * 30;
      const cy = (Math.random() - 0.3) * 8 + 4;
      const cz = -c * 3 + (Math.random() - 0.5) * 3;
      centers.push(new THREE.Vector3(cx, cy, cz));

      for (let p = 0; p < particlesPerCloud; p++) {
        const rx = (Math.random() - 0.5) * 2.2;
        const ry = (Math.random() - 0.5) * 1.4;
        const rz = (Math.random() - 0.5) * 1.8;
        baseOffsets.push(new THREE.Vector3(rx, ry, rz));
        dummy.position.set(cx + rx, cy + ry, cz + rz);
        const s = 0.6 + Math.random() * 1.6;
        dummy.scale.setScalar(s);
        dummy.rotation.set(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6);
        dummy.updateMatrix();
        inst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.userData = { particlesPerCloud, cloudCount: count, centers, baseOffsets };
    dracoLoader.dispose();
    return inst;
  } catch (err) {
    console.warn('loadCloudInstanced failed, using fallback. Error:', err);
    return createFallbackCloudInstanced(60);
  }
}

// Improved fallback: similar structure but uses simple spheres as puffs
export function createFallbackCloudInstanced(count = 60, particlesPerCloud = 8) {
  const puffGeo = new THREE.IcosahedronGeometry(0.8, 1); // немного «фацетная», но приятнее
  const puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false });
  const total = count * particlesPerCloud;
  const inst = new THREE.InstancedMesh(puffGeo, puffMat, total);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const centers = [];
  const baseOffsets = [];
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let c = 0; c < count; c++) {
    const cx = (Math.random() - 0.5) * 30;
    const cy = (Math.random() - 0.3) * 8 + 4;
    const cz = -c * 3 + (Math.random() - 0.5) * 3;
    centers.push(new THREE.Vector3(cx, cy, cz));

    for (let p = 0; p < particlesPerCloud; p++) {
      const rx = (Math.random() - 0.5) * 2.4;
      const ry = (Math.random() - 0.5) * 1.2;
      const rz = (Math.random() - 0.5) * 1.6;
      baseOffsets.push(new THREE.Vector3(rx, ry, rz));
      dummy.position.set(cx + rx, cy + ry, cz + rz);
      const s = 0.5 + Math.random() * 1.6;
      dummy.scale.setScalar(s);
      dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
      dummy.updateMatrix();
      inst.setMatrixAt(idx++, dummy.matrix);
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.userData = { particlesPerCloud, cloudCount: count, centers, baseOffsets };
  return inst;
}
