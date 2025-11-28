import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

// ---- Сцена и рендерер ----
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0025); // лёгкий туман для глубины

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---- Камера ----
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 10);

// Для отладки можно включить Controls (необязательно)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false; // выключаем в основном сценарии

// ---- Свет ----
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(5, 10, 7);
scene.add(sun);

// ---- Создаём spline путь (CatmullRom) ----
const points = [
  new THREE.Vector3(0, 2, 0),
  new THREE.Vector3(10, 3, -20),
  new THREE.Vector3(20, 6, -40),
  new THREE.Vector3(0, 12, -70),
  new THREE.Vector3(-20, 6, -90),
  new THREE.Vector3(-40, 3, -110),
  new THREE.Vector3(0, 2, -140)
];
const path = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);

// Визуализация пути для разработки (опционально)
const lineGeometry = new THREE.BufferGeometry().setFromPoints(path.getPoints(200));
const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
const line = new THREE.Line(lineGeometry, lineMat);
scene.add(line);

// ---- Инстансированные облака ----
const CLOUD_COUNT = 200;
const cloudGeo = new THREE.SphereGeometry(1.0, 8, 6); // простая форма облака
const cloudMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.9,
  metalness: 0.0,
  transparent: true,
  opacity: 0.95
});
const instanced = new THREE.InstancedMesh(cloudGeo, cloudMat, CLOUD_COUNT);
instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(instanced);

// Расположим облака вдоль пути с небольшими смещениями
const dummy = new THREE.Object3D();
for (let i = 0; i < CLOUD_COUNT; i++) {
  const u = i / CLOUD_COUNT; // позиция вдоль кривой
  const center = path.getPointAt(u);
  // случайное смещение перпендикулярно пути
  const offsetX = (Math.random() - 0.5) * 12;
  const offsetY = (Math.random() - 0.5) * 6;
  const offsetZ = (Math.random() - 0.5) * 8;

  dummy.position.set(center.x + offsetX, center.y + offsetY, center.z + offsetZ);
  const scale = 0.8 + Math.random() * 3.0;
  dummy.scale.set(scale * (0.8 + Math.random() * 0.8), scale, scale * (0.8 + Math.random() * 0.8));
  dummy.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
  dummy.updateMatrix();
  instanced.setMatrixAt(i, dummy.matrix);
}

// Можно добавить цветовые вариации через инстансный цвет (опционально)
instanced.instanceColor = null; // оставляем однотонным для простоты

// ---- Скролл → прогресс по пути ----
let targetT = 0;
let currentT = 0;

// Обновляем targetT от скролла страницы
function onScroll() {
  // прогресс от 0 до 1
  const scrollTop = window.scrollY || window.pageYOffset;
  const scrollHeight = document.body.scrollHeight - window.innerHeight;
  targetT = scrollHeight > 0 ? THREE.MathUtils.clamp(scrollTop / scrollHeight, 0, 1) : 0;
}
window.addEventListener('scroll', onScroll, { passive: true });

// ---- Анимация ----
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // сглаживаем движение камеры
  currentT = THREE.MathUtils.lerp(currentT, targetT, Math.min(1, dt * 6));

  // позиция камеры на кривой и "взгляд" немного вперед по пути
  const pos = path.getPointAt(currentT);
  const lookAheadT = THREE.MathUtils.clamp(currentT + 0.02, 0, 1);
  const lookPos = path.getPointAt(lookAheadT);

  camera.position.lerp(new THREE.Vector3(pos.x, pos.y + 1.2, pos.z + 6), 0.15); // небольшое смещение назад по Z
  camera.lookAt(lookPos.x, lookPos.y, lookPos.z);

  // Небольшая анимация облаков (плавающая)
  const time = performance.now() * 0.001;
  for (let i = 0; i < CLOUD_COUNT; i++) {
    instanced.getMatrixAt(i, dummy.matrix);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
    const wobble = Math.sin(time * 0.5 + i) * 0.02;
    dummy.position.y += wobble;
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);
  }
  instanced.instanceMatrix.needsUpdate = true;

  renderer.render(scene, camera);
}
animate();

// ---- Ресайз ----
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);
