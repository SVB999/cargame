// game.js – Финална версия (ти отговаряш за модели/нива/UI/оптимизация)

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.159.0/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.159.0/examples/jsm/loaders/RGBELoader.js';

// ======================
// 1. Основни променливи
// ======================
const canvas = document.getElementById("gameCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Сцена
const scene = new THREE.Scene();

// HDRI осветление (light baking)
new RGBELoader()
    .setPath('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/assets/hdri/')
    .load('royal_esplanade_1k.hdr', hdr => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = hdr;
        scene.background = new THREE.Color(0x87ceeb);
    });

// ======================
// 2. Светлини
// ======================
const dirLight = new THREE.DirectionalLight(0xffffff, 4);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// ======================
// 3. Безкраен път + LOD
// ======================
const ROAD_WIDTH = 30;
const SEGMENT_LENGTH = 40;
const VISIBLE_SEGMENTS = 60;
const LOD_DISTANCE = 400;

const roadSegments = [];
const roadGroup = new THREE.Group();
scene.add(roadGroup);

const roadMaterialHigh = new THREE.MeshStandardMaterial({
    map: new THREE.TextureLoader().load("road_texture.jpg"),
    normalMap: new THREE.TextureLoader().load("road_normal.jpg"),
    roughness: 0.9,
    metalness: 0.1
});
roadMaterialHigh.map.repeat.set(1, 8);
roadMaterialHigh.map.wrapS = roadMaterialHigh.map.wrapT = THREE.RepeatWrapping;

const roadMaterialLow = roadMaterialHigh.clone();
roadMaterialLow.map = roadMaterialLow.map.clone();
roadMaterialLow.map.repeat.set(1, 2);
roadMaterialLow.normalMap = null;

function createRoadSegment(z, highDetail = true) {
    const geo = new THREE.PlaneGeometry(ROAD_WIDTH, SEGMENT_LENGTH);
    const mat = highDetail ? roadMaterialHigh : roadMaterialLow;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = z;
    mesh.receiveShadow = true;
    roadGroup.add(mesh);
    return mesh;
}

for (let i = -VISIBLE_SEGMENTS; i < VISIBLE_SEGMENTS; i++) {
    const high = Math.abs(i * SEGMENT_LENGTH) < LOD_DISTANCE;
    roadSegments.push(createRoadSegment(i * SEGMENT_LENGTH, high));
}

// ======================
// 4. Зареждане на коли (твоята част)
// ======================
let car1, car2;
const gltfLoader = new GLTFLoader();

function loadCar(path, color, onLoad) {
    gltfLoader.load(path, gltf => {
        const car = gltf.scene;
        car.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    child.material = child.material.clone();
                    if (color && child.name.includes('body')) child.material.color.set(color);
                }
            }
        });
        car.scale.set(1.3, 1.3, 1.3);
        scene.add(car);
        onLoad(car);
    });
}

loadCar("red_car.glb", 0xff0000, c => { car1 = c; car1.userData = { lane: 0, speed: 0, offsetZ: 0 }; });
loadCar("blue_car.glb", 0x0088ff, c => { car2 = c; car2.userData = { lane: 0, speed: 0, offsetZ: 0 }; });

// ======================
// 5. NPC с Instancing (огромна оптимизация)
// ======================
let npcInstanced;
const NPC_COUNT = 40;
const dummy = new THREE.Object3D();

function initNPCs() {
    const geo = new THREE.BoxGeometry(4, 2, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const instancedMesh = new THREE.InstancedMesh(geo, mat, NPC_COUNT);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    scene.add(instancedMesh);
    npcInstanced = instancedMesh;

    for (let i = 0; i < NPC_COUNT; i++) {
        dummy.position.set(
            (Math.random() * 2 - 1) * 8,
            1,
            -200 - i * 40
        );
        dummy.scale.setScalar(0.9 + Math.random() * 0.3);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
}
initNPCs();

// ======================
// 6. Камери + Split Screen
// ======================
const camera1 = new THREE.PerspectiveCamera(70, 2, 0.1, 2000);
const camera2 = new THREE.PerspectiveCamera(70, 2, 0.1, 2000);

function updateCamera(cam, car) {
    if (!car) return;
    const data = car.userData;
    const ideal = new THREE.Vector3(car.position.x, 8, car.position.z + 20);
    cam.position.lerp(ideal, 0.08);
    cam.lookAt(car.position.clone().add(new THREE.Vector3(0, 3, -30)));
}

// ======================
// 7. UI (твоята част)
// ======================
const hud = document.getElementById("hud");
hud.style.cssText = `
    position: absolute; top: 10px; left: 10px; color: white; font-family: Arial; font-weight: bold;
    text-shadow: 2px 2px 4px black; pointer-events: none; z-index: 100;
`;
["Player 1: 0 km/h", "Player 2: 0 km/h"].forEach((txt, i) => {
    const div = document.createElement("div");
    div.id = "speed" + (i + 1);
    div.textContent = txt;
    div.style.fontSize = i === 0 ? "28px" : "24px";
    div.style.marginBottom = "10px";
    hud.appendChild(div);
});

// Разделителна черна линия
const divider = document.createElement("div");
divider.style.cssText = `
    position: absolute; left: 0; top: 50%; width: 100%; height: 4px;
    background: black; transform: translateY(-50%); pointer-events: none; z-index: 99;
`;
document.body.appendChild(divider);

// ======================
// 8. Контроли и физика
// ======================
const keys = {};
window.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
window.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

function updatePlayer(car, cam, isPlayer1) {
    if (!car) return;
    const data = car.userData;
    const left = isPlayer1 ? keys['a'] : keys['arrowleft'];
    const right = isPlayer1 ? keys['d'] : keys['arrowright'];
    const accel = isPlayer1 ? keys['w'] : keys['arrowup'];
    const brake = isPlayer1 ? keys['s'] : keys['arrowDown'];

    if (left) data.lane = Math.max(-1, data.lane - 1);
    if (right) data.lane = Math.min(1, data.lane + 1);
    if (accel) data.speed = Math.min(data.speed + 0.8, 320);
    else if (brake) data.speed = Math.max(data.speed - 2, 0);
    else data.speed *= 0.985;

    data.offsetZ += data.speed * 0.1;
    car.position.z = -data.offsetZ;
    car.position.x = THREE.MathUtils.lerp(car.position.x, data.lane * 8, 0.15);

    // HUD
    document.getElementById("speed" + (isPlayer1 ? 1 : 2)).textContent =
        `${isPlayer1 ? "Player 1" : "Player 2"}: ${Math.round(data.speed)} km/h`;
}

// ======================
// 9. Анимационен цикъл
// ======================
function animate() {
    requestAnimationFrame(animate);

    // Движение на пътя (същия ефект като в Racing Limits)
    roadGroup.position.z = -performance.now() * 0.02 % SEGMENT_LENGTH;

    updatePlayer(car1, camera1, true);
    updatePlayer(car2, camera2, false);
    updateCamera(camera1, car1);
    updateCamera(camera2, car2);

    // Split-screen рендер
    const h = window.innerHeight / 2;
    renderer.setScissorTest(true);

    // Player 1 (горе)
    renderer.setViewport(0, h, window.innerWidth, h);
    renderer.setScissor(0, h, window.innerWidth, h);
    renderer.render(scene, camera1);

    // Player 2 (долу)
    renderer.setViewport(0, 0, window.innerWidth, h);
    renderer.setScissor(0, 0, window.innerWidth, h);
    renderer.render(scene, camera2);
}

animate();

// ======================
// 10. Resize
// ======================
window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    const half = h / 2;
    camera1.aspect = w / half;
    camera2.aspect = w / half;
    camera1.updateProjectionMatrix();
    camera2.updateProjectionMatrix();

});
// === Damage System ===
function applyDamageLogic(car) {
    if (!car.damageTimer) car.damageTimer = 0;
    if (!car.damageLevel) car.damageLevel = 0;

    // Ако е катастрофирал, увеличаваме damage
    if (car.crashed) {
        car.damageLevel = Math.min(car.damageLevel + 0.5, 100); // максимум 100%
        car.damageTimer = 200; // 200 кадъра = около 3 сек
    }

    // Ако има активен damage
    if (car.damageTimer > 0) {
        car.damageTimer--;

        // Ефекти от повредата
        const damageFactor = car.damageLevel / 100;

        // Намаляване на макс скорост
        car.maxSpeed = 220 - damageFactor * 80; // от 220 пада до 140

        // По-трудно завиване
        car.steerMultiplier = 1 - damageFactor * 0.3; // 70% steering при голяма повреда

        // Леко дърпане настрани
        const pull = (Math.random() - 0.5) * 0.02 * damageFactor;
        car.position.x += pull;
    } else {
        // Възстановяване след време
        car.damageLevel *= 0.98;
        car.maxSpeed = 220;
        car.steerMultiplier = 1;
    }
}
