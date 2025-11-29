// utilities for path generation and updating line geometry
import * as THREE from 'three';

export function generateSinusPath({ length = 140, segments = 7, lateralAmplitude = 20, verticalAmplitude = 10, seed = 0 } = {}) {
  // segments = количество контрольных точек по длине
  const pts = [];
  const step = length / Math.max(1, segments - 1);
  for (let i = 0; i < segments; i++) {
    const z = -i * step;
    const phase = seed + i * 0.5;
    const x = Math.sin(phase) * lateralAmplitude * (0.6 + Math.random() * 0.8);
    const y = 2 + Math.cos(phase * 0.7) * verticalAmplitude * (0.4 + Math.random() * 0.6);
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

export function createPathFromPoints(points) {
  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
}

export function updateLineMesh(lineMesh, path, segments = 200) {
  if (!lineMesh) return new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getPoints(segments)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }));
  const pts = path.getPoints(segments);
  lineMesh.geometry.dispose();
  lineMesh.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  return lineMesh;
}

// create a thin ribbon along the path to make the visible path slightly thicker
export function createThinPathMesh(path, width = 1.6, segments = 200, materialOptions = {}) {
  const pts = path.getPoints(segments);
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < pts.length; i++) {
    const u = i / Math.max(1, pts.length - 1);
    const p = pts[i];
    const tangent = path.getTangentAt(u).clone().normalize();
    const right = computeRight(tangent);
    const leftPos = new THREE.Vector3().copy(p).addScaledVector(right, -width * 0.5);
    const rightPos = new THREE.Vector3().copy(p).addScaledVector(right, width * 0.5);

    positions.push(leftPos.x, leftPos.y, leftPos.z);
    positions.push(rightPos.x, rightPos.y, rightPos.z);

    uvs.push(u, 0);
    uvs.push(u, 1);
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b);
    indices.push(c, d, b);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial(Object.assign({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }, materialOptions));
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// helper to compute a perpendicular (right) vector for a tangent
export function computeRight(tangent) {
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
  // if right is zero (tangent ~ up), fallback
  if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
  return right;
}
