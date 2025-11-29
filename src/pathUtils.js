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

// helper to compute a perpendicular (right) vector for a tangent
export function computeRight(tangent) {
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
  // if right is zero (tangent ~ up), fallback
  if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
  return right;
}
