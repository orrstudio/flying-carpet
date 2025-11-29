// Central config file — редактируй числовые значения здесь.
export default {
  path: {
    useGenerate: true, // рекомендую true; если false — нужно заполнить points
    length: 2400,
    segments: 12,
    lateralAmplitude: 28,
    verticalAmplitude: 12,
    seed: 0,
    points: [] // если useGenerate=false — указывай явные точки здесь
  },

  clouds: {
    cloudCount: 40, // число облачных групп вдоль пути
    particlesPerCloud: 8, // детализация каждой группы
    width: 18,
    bias: 0,
    modelUrl: '/assets/models/cloud.glb'
  },

  visual: {
    lineSegments: 800, // количество сегментов для отрисовки линии
    wheelSensitivity: 0.0002, // чувствительность колеса (увеличена для длинных путей)
    touchSensitivity: 0.0002,
    mouseLookStrength: 0.6,
    cameraLerp: 0.25

    // camera-follow параметры
    cameraFollowDistance: 6,  // отступ камеры назад вдоль касательной
    cameraHeightOffset: 1.6,  // вертикальный сдвиг камеры
    lookAheadT: 0.02          // сколько смотреть вперёд по кривой
  },

  // Параметры неба/фонa
  sky: {
    autoFollowCamera: true,   // если true — сфера неба всегда центрируется на камере
    radius: 600,              // фиксированный радиус сферы неба (не масштабируется)
    minRadius: 600,           // минимальный "приемлемый" радиус
    maxRadius: 2000           // максимум который будет учитываться при расчётах (без масштабирования)
  }
};