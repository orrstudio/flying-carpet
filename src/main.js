import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import { createSky, updateSky } from './sky.js';
import { loadCloudInstanced, createFallbackCloudInstanced } from './loadModels.js';
import { add3DText } from './text3d.js';
import config from './config.js';
import { generateSinusPath } from './pathUtils.js';

// ---- Сцена и рендерер ----
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0025);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Экспорт THREE для удобной отладки в консоли
window.THREE = THREE;

// ---- Камера ----
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 10);
camera.up.set(0, 1, 0);

// Экспорт камеры/сцены для диагностики
window.scene = scene;
window.camera = camera;

// Debug controls (disabled)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;

// Свет
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(5, 10, 7);
scene.add(sun);

// Sky (фиксированный радиус)
const skyRadius = Math.max(config.sky?.radius ?? 600, config.sky?.minRadius ?? 600);
const { mesh: skyMesh, uniforms: skyUniforms } = createSky(skyRadius);
skyMesh.frustumCulled = false;
scene.add(skyMesh);
window.skyMesh = skyMesh;

if (skyUniforms && skyUniforms.bottomColor && skyUniforms.bottomColor.value) {
  renderer.setClearColor(skyUniforms.bottomColor.value);
  if (scene.fog) scene.fog.color = skyUniforms.bottomColor.value;
}

// Path / line placeholders
let path = null;
let line = null;

// Clouds instance
let cloudInst = null;

// Text
const titleFixed = add3DText(scene, { text: 'flying‑carpet', position: new THREE.Vector3(0, 6, -10), fontSize: 1.6 });
const titleOnPath = add3DText(scene, { text: 'you reached the cloud', position: new THREE.Vector3(0, 4, -30), fontSize: 1.2 });
titleOnPath.visible = false;

// Input state
let targetT = 0;
let currentT = 0;
let mouseX = 0, mouseY = 0;
window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  mouseY = (e.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });

// wheel/touch handlers
function wheelAdjust(deltaY) {
  const invert = !!(config.visual && config.visual.wheelInvert);
  const sign = invert ? -1 : 1;
  const sensitivity = config.visual?.wheelSensitivity ?? 0.0006;
  const step = deltaY * sensitivity * sign;
  targetT = THREE.MathUtils.clamp(targetT + step, 0, 1);
}
window.addEventListener('wheel', (e) => wheelAdjust(e.deltaY), { passive: true });

let lastTouchY = null;
window.addEventListener('touchstart', (e) => { if (e.touches && e.touches[0]) lastTouchY = e.touches[0].clientY; }, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!lastTouchY) { if (e.touches && e.touches[0]) lastTouchY = e.touches[0].clientY; return; }
  const currentY = e.touches[0].clientY;
  const delta = lastTouchY - currentY;
  const step = delta * (config.visual?.touchSensitivity ?? 0.0008);
  targetT = THREE.MathUtils.clamp(targetT + step, 0, 1);
  lastTouchY = currentY;
}, { passive: true });
window.addEventListener('touchend', () => { lastTouchY = null; }, { passive: true });

function onScroll() {
  const scrollTop = window.scrollY || window.pageYOffset;
  const scrollHeight = document.body.scrollHeight - window.innerHeight;
  if (scrollHeight > 0) targetT = THREE.MathUtils.clamp(scrollTop / scrollHeight, 0, 1);
}
window.addEventListener('scroll', onScroll, { passive: true });

// ------------------- diagnostics & auto-fix helpers -------------------
function findNegativeScales(root) {
  const neg = [];
  root.traverse(o => {
    if (o && o.scale && (o.scale.x < 0 || o.scale.y < 0 || o.scale.z < 0)) {
      neg.push({ name: o.name || o.type, uuid: o.uuid, scale: o.scale.clone(), object: o });
    }
  });
  return neg;
}

function ensureNoMirrorOnce() {
  try {
    const neg = findNegativeScales(scene);
    if (neg.length > 0) {
      console.warn('ensureNoMirrorOnce: found negative scales, resetting:', neg.map(n => ({ name: n.name, scale: n.scale })));
      scene.scale.set(1, 1, 1);
      scene.rotation.set(0, 0, 0);
      neg.forEach(n => {
        try {
          const o = n.object;
          o.scale.set(Math.abs(o.scale.x || 1), Math.abs(o.scale.y || 1), Math.abs(o.scale.z || 1));
        } catch (e) {}
      });
    }

    if (skyMesh) {
      if (skyMesh.scale.x < 0 || skyMesh.scale.y < 0 || skyMesh.scale.z < 0) {
        skyMesh.scale.set(Math.abs(skyMesh.scale.x), Math.abs(skyMesh.scale.y), Math.abs(skyMesh.scale.z));
        skyMesh.rotation.set(0, 0, 0);
      }
    }

    if (camera && camera.up) camera.up.set(0, 1, 0);

    const c = document.querySelector('canvas');
    if (c && c.style && c.style.transform && c.style.transform !== 'none') {
      if (c.style.transform.includes('scaleX') || c.style.transform.includes('scaleY') || c.style.transform.includes('rotate')) {
        console.warn('ensureNoMirrorOnce: clearing canvas.style.transform (was:', c.style.transform, ')');
        c.style.transform = 'none';
      }
    }

    try {
      if (titleFixed && titleFixed.scale) titleFixed.scale.set(Math.abs(titleFixed.scale.x || 1), Math.abs(titleFixed.scale.y || 1), Math.abs(titleFixed.scale.z || 1));
      if (titleOnPath && titleOnPath.scale) titleOnPath.scale.set(Math.abs(titleOnPath.scale.x || 1), Math.abs(titleOnPath.scale.y || 1), Math.abs(titleOnPath.scale.z || 1));
    } catch (e) { /* ignore */ }
  } catch (e) {
    console.warn('ensureNoMirrorOnce failed', e);
  }
}

// ------------------- path builder -------------------
function buildPathFromConfig(cfg) {
  if (cfg.path && Array.isArray(cfg.path.points) && cfg.path.points.length > 0) {
    const pts = cfg.path.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  }
  const length = (cfg.path && cfg.path.length) ? cfg.path.length : 140;
  const segments = (cfg.path && cfg.path.segments) ? Math.max(3, cfg.path.segments) : 7;
  const lateral = cfg.path?.lateralAmplitude ?? 12;
  const vertical = cfg.path?.verticalAmplitude ?? 6;
  const seed = cfg.path?.seed ?? 0;
  const pts = generateSinusPath({ length, segments, lateralAmplitude: lateral, verticalAmplitude: vertical, seed });
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
}

// ------------------- applyConfig (path/clouds/sky) -------------------
async function applyConfig(cfg) {
  // run one-time mirror fix
  ensureNoMirrorOnce();

  // remove old clouds/line safely
  try { if (cloudInst) { scene.remove(cloudInst); cloudInst.geometry && cloudInst.geometry.dispose(); cloudInst.material && cloudInst.material.dispose && cloudInst.material.dispose(); cloudInst = null; } } catch(e){}
  try { if (line) { scene.remove(line); line.geometry && line.geometry.dispose(); line.material && line.material.dispose(); line = null; } } catch(e){}

  // build path
  path = buildPathFromConfig(cfg);
  // export path for diagnostics
  window.path = path;

  // --- Auto-fix: orientation & mirror ---
  (function ensureOrientationAndMirrorFix() {
    try {
      // 1) fix negative scales
      const negative = [];
      scene.traverse(o => {
        if (o.scale && (o.scale.x < 0 || o.scale.y < 0 || o.scale.z < 0)) negative.push(o);
      });
      if (negative.length > 0) {
        console.warn('Auto-fix: found negative scales on', negative.map(o => ({name:o.name||o.type, scale:{x:o.scale.x,y:o.scale.y,z:o.scale.z}})));
        try { scene.scale.set(1,1,1); scene.rotation.set(0,0,0); } catch(e){}
        negative.forEach(o => {
          try { o.scale.set(Math.abs(o.scale.x||1), Math.abs(o.scale.y||1), Math.abs(o.scale.z||1)); } catch(e){}
        });
        const c = document.querySelector('canvas');
        if (c && c.style && c.style.transform && (c.style.transform.includes('scaleX') || c.style.transform.includes('scaleY') || c.style.transform.includes('rotate'))) {
          console.warn('Auto-fix: clearing canvas.style.transform (was)', c.style.transform);
          c.style.transform = 'none';
        }
        try { if (titleFixed && titleFixed.scale) titleFixed.scale.set(Math.abs(titleFixed.scale.x||1), Math.abs(titleFixed.scale.y||1), Math.abs(titleFixed.scale.z||1)); } catch(e){}
        try { if (titleOnPath && titleOnPath.scale) titleOnPath.scale.set(Math.abs(titleOnPath.scale.x||1), Math.abs(titleOnPath.scale.y||1), Math.abs(titleOnPath.scale.z||1)); } catch(e){}
        if (camera && camera.up) camera.up.set(0,1,0);
      }

      // 2) check path orientation relative to camera
      if (path && camera) {
        const epsT = 0.01;
        const tangent = path.getTangentAt(Math.min(Math.max(epsT, 0), 1)).clone().normalize();
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir).normalize();
        const dot = camDir.dot(tangent);
        if (dot < 0) {
          console.warn('Auto-fix: path is oriented opposite camera (dot=', dot, ') — reversing path points');
          try {
            if (!window.__origPathPoints) {
              if (path.points && Array.isArray(path.points)) {
                window.__origPathPoints = path.points.slice();
              } else {
                window.__origPathPoints = path.getPoints(Math.max(50, cfg.visual?.lineSegments || 300));
              }
              console.log('Saved original points in window.__origPathPoints');
            }
          } catch(e){}

          if (path.points && Array.isArray(path.points) && path.points.length > 1) {
            path.points.reverse();
            console.log('path.points reversed in-place');
          } else {
            try {
              const pts = path.getPoints(Math.max(100, cfg.visual?.lineSegments || 300)).reverse();
              path = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
              window.path = path;
              console.log('Created new reversed path and assigned to window.path');
            } catch(e){ console.warn('Failed to recreate reversed path', e); }
          }

          // update line geometry if exists
          if (line) {
            try {
              line.geometry.dispose();
              const ptsVis = path.getPoints(cfg.visual?.lineSegments ?? 300);
              line.geometry = new THREE.BufferGeometry().setFromPoints(ptsVis);
              console.log('Updated line geometry for reversed path');
            } catch(e){ console.warn('Auto-fix: update line failed', e); }
          }

          // reposition clouds if possible
          if (cloudInst && cloudInst.userData) {
            try {
              const numClouds = cloudInst.userData.cloudCount || (cfg.clouds?.cloudCount || 40);
              const parts = cloudInst.userData.particlesPerCloud || (cfg.clouds?.particlesPerCloud || 8);
              const centers = [];
              for (let i = 0; i < numClouds; i++) {
                const u = i / Math.max(1, numClouds - 1);
                centers.push(path.getPointAt(u).clone());
              }
              const baseOffsets = cloudInst.userData.baseOffsets || [];
              const dummy = new THREE.Object3D();
              let idx = 0;
              for (let c = 0; c < numClouds; c++) {
                const center = centers[c];
                for (let p = 0; p < parts; p++) {
                  const off = baseOffsets[c * parts + p] || new THREE.Vector3();
                  dummy.position.set(center.x + off.x, center.y + off.y, center.z + off.z);
                  dummy.scale.setScalar(0.6 + Math.random() * 0.8);
                  dummy.updateMatrix();
                  try { cloudInst.setMatrixAt(idx++, dummy.matrix); } catch(e){}
                }
              }
              cloudInst.instanceMatrix.needsUpdate = true;
              cloudInst.userData.centers = centers;
              console.log('Repositioned instanced clouds for reversed path');
            } catch (e) { console.warn('Failed to reposition clouds', e); }
          }
        } // dot < 0
      } // path && camera
    } catch (e) {
      console.warn('ensureOrientationAndMirrorFix failed', e);
    }
  })();
  // --- end auto-fix

  // create line visualization based on (maybe reversed) path
  const pts = path.getPoints(cfg.visual?.lineSegments ?? 300);
  line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }));
  scene.add(line);

  // camera.far and fog tuning
  try {
    const curveLength = path.getLength ? path.getLength() : (cfg.path?.length ?? 600);
    const neededFar = Math.max(2000, curveLength * 2.0 + 500);
    if (camera.far < neededFar) { camera.far = neededFar; camera.updateProjectionMatrix(); }
    const baseDensity = 0.0025;
    const fogDensity = Math.max(0.00008, baseDensity * (600 / Math.max(600, curveLength)));
    if (scene.fog) scene.fog.density = fogDensity;
    if (skyUniforms && skyUniforms.bottomColor && skyUniforms.bottomColor.value) {
      renderer.setClearColor(skyUniforms.bottomColor.value);
      if (scene.fog) scene.fog.color = skyUniforms.bottomColor.value;
    }
  } catch (e) { console.warn('applyConfig: sky/fog adjust failed', e); }

  // clouds
  try {
    const count = cfg.clouds?.cloudCount ?? 40;
    const particles = cfg.clouds?.particlesPerCloud ?? 8;
    const modelUrl = cfg.clouds?.modelUrl ?? '/assets/models/cloud.glb';
    cloudInst = await loadCloudInstanced(modelUrl, count).catch(() => null);
    if (!cloudInst) cloudInst = createFallbackCloudInstanced(count, particles);

    const parts = cloudInst.userData && cloudInst.userData.particlesPerCloud ? cloudInst.userData.particlesPerCloud : particles;
    const centers = [];
    for (let i = 0; i < count; i++) {
      const u = i / Math.max(1, count - 1);
      centers.push(path.getPointAt(u).clone());
    }

    const baseOffsets = [];
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let c = 0; c < count; c++) {
      const center = centers[c];
      for (let p = 0; p < parts; p++) {
        const rx = (Math.random() - 0.5) * (cfg.clouds?.width ?? 18);
        const ry = (Math.random() - 0.5) * 1.4;
        const rz = (Math.random() - 0.5) * 2.2;
        baseOffsets.push(new THREE.Vector3(rx, ry, rz));
        dummy.position.set(center.x + rx, center.y + ry, center.z + rz);
        const s = 0.6 + Math.random() * 1.6;
        dummy.scale.setScalar(s);
        dummy.rotation.set(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6);
        dummy.updateMatrix();
        cloudInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    cloudInst.instanceMatrix.needsUpdate = true;
    cloudInst.userData = { particlesPerCloud: parts, cloudCount: count, centers, baseOffsets };
    scene.add(cloudInst);
  } catch (e) { console.warn('applyConfig: cloud setup failed', e); }

  // clamp
  targetT = THREE.MathUtils.clamp(targetT, 0, 1);
  currentT = THREE.MathUtils.clamp(currentT, 0, 1);

}

// initial apply
applyConfig(config).catch(console.error);

// HMR support
if (import.meta.hot) {
  import.meta.hot.accept('./config.js', ({ default: newConfig }) => {
    try { /* config update handled */ } catch (e) {}
    applyConfig(newConfig).catch(console.error);
  });
}

// Camera follow
const camDummy = new THREE.Object3D();
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  // smooth progress
  currentT = THREE.MathUtils.lerp(currentT, targetT, Math.min(1, dt * 6));
  if (!path) return;

  // point & tangent
  const pos = path.getPointAt(currentT);
  const tangent = path.getTangentAt(currentT).normalize();

  const followDistance = config.visual?.cameraFollowDistance ?? 6;
  const heightOffset = config.visual?.cameraHeightOffset ?? 1.6;
  const desiredPos = new THREE.Vector3().copy(pos).addScaledVector(tangent, -followDistance);
  desiredPos.y += heightOffset;

  camera.position.lerp(desiredPos, config.visual?.cameraLerp ?? 0.18);

  const lookAheadT = config.visual?.lookAheadT ?? 0.02;
  const lookT = THREE.MathUtils.clamp(currentT + lookAheadT, 0, 1);
  const lookPos = path.getPointAt(lookT);

  camDummy.position.copy(camera.position);
  camDummy.lookAt(lookPos);
  camera.quaternion.slerp(camDummy.quaternion, Math.min(1, dt * 6));

  // small parallax
  camera.position.x += (mouseX * (config.visual?.mouseLookStrength ?? 0.6) - camera.position.x) * 0.02;
  camera.position.y += (mouseY * (config.visual?.mouseLookStrength ?? 0.6) - camera.position.y) * 0.02;

  // center sky on camera
  if (config.sky?.autoFollowCamera) skyMesh.position.copy(camera.position);

  // animate clouds
  if (cloudInst && cloudInst.userData) {
    const { particlesPerCloud, cloudCount, centers, baseOffsets } = cloudInst.userData;
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let c = 0; c < cloudCount; c++) {
      const center = centers[c];
      const groupWobbleY = Math.sin(t * 0.6 + c) * 0.14;
      const groupWobbleX = Math.cos(t * 0.3 + c * 1.3) * 0.08;
      for (let p = 0; p < particlesPerCloud; p++) {
        const off = baseOffsets[c * particlesPerCloud + p] || new THREE.Vector3();
        const px = center.x + off.x + groupWobbleX;
        const py = center.y + off.y + groupWobbleY;
        const pz = center.z + off.z;
        dummy.position.set(px, py, pz);
        const s = 0.6 + 0.5 * Math.abs(Math.sin(t * 0.6 + c * 0.3 + p));
        dummy.scale.setScalar(s);
        dummy.rotation.set(0, Math.sin(t * 0.2 + idx * 0.13) * 0.4, 0);
        dummy.updateMatrix();
        cloudInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    cloudInst.instanceMatrix.needsUpdate = true;
  }

  // text visibility and troika sync
  titleOnPath.visible = (currentT > 0.18 && currentT < 0.28) || (currentT > 0.52 && currentT < 0.62);
  updateSky(skyUniforms, t);
  if (titleFixed && titleFixed.sync) titleFixed.sync();
  if (titleOnPath && titleOnPath.sync) titleOnPath.sync();

  renderer.render(scene, camera);
}
animate();

// resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
