import { Text } from 'troika-three-text';
import * as THREE from 'three';

// Добавляет 3D‑текст в сцену. Возвращает объект Text (можно менять .text и .sync())
export function add3DText(scene, options = {}) {
  const {
    text = 'flying carpet',
    position = new THREE.Vector3(0, 6, -10),
    fontSize = 1.2,
    color = 0xffffff
  } = options;

  const t = new Text();
  t.text = text;
  t.fontSize = fontSize;
  t.color = new THREE.Color(color);
  t.anchorX = 'center';
  t.anchorY = 'middle';
  t.position.copy(position);
  t.sync(); // синхронизируем шрифт и геометрию
  scene.add(t);
  return t;
}
