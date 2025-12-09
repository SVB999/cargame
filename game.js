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
    // === Setup ===
const canvas = document.getElementById("gameCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// === Light ===
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const ambLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambLight);

// === Road ===
const laneWidth = 3;
const roadTexture = new THREE.TextureLoader().load("./road_texture.jpg");
roadTexture.wrapS = THREE.RepeatWrapping;
roadTexture.wrapT = THREE.RepeatWrapping;
roadTexture.repeat.set(1, 200);

const road = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 2000),
    new THREE.MeshPhongMaterial({ map: roadTexture })
);
road.rotation.x = -Math.PI/2;
scene.add(road);

// === Load Cars ===
let car1, car2;
const loader = new THREE.GLTFLoader();

loader.load("./red_car.glb", gltf => {
    car1 = gltf.scene;
    car1.scale.set(1.2, 1.2, 1.2);
    car1.position.set(0, 0.6, 0);
    car1.speed = 0;
    car1.lane = 0;
    scene.add(car1);
});

loader.load("./blue_car.glb", gltf => {
    car2 = gltf.scene;
    car2.scale.set(1.2, 1.2, 1.2);
    car2.position.set(0, 0.6, 5);
    car2.speed = 0;
    car2.lane = 0;
    scene.add(car2);
});

// === NPC Pool ===
const npcCars = [];
const npcCount = 12;
const npcPool = [];

function createNPC() {
    const npc = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1, 2.4),
        new THREE.MeshPhongMaterial({ color: 0x888888 })
    );
    npc.lane = Math.floor(Math.random() * 3) - 1;
    npc.targetLane = npc.lane;
    npc.position.x = npc.lane * laneWidth;
    npc.position.y = 0.6;
    npc.position.z = -Math.random()*200 - 40;
    npc.speed = 0.4 + Math.random()*0.6;
    npc.active = true;
    scene.add(npc);
    return npc;
}

function getNPC() {
    let npc = npcPool.find(n => !n.active);
    if (npc) { npc.active = true; return npc; }
    npc = createNPC();
    npcPool.push(npc);
    return npc;
}

function resetNPC(npc) {
    npc.position.z = -200 - Math.random()*200;
    npc.lane = Math.floor(Math.random() * 3) -1;
    npc.targetLane = npc.lane;
    npc.position.x = npc.lane * laneWidth;
    npc.speed = 0.4 + Math.random()*0.6;
    npc.active = false;
}

for (let i=0;i<npcCount;i++) npcCars.push(getNPC());

// === Cameras ===
const camera1 = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
const camera2 = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

function updateCamera(camera, car){
    if(!car) return;
    const targetPos = new THREE.Vector3(car.position.x, 4, car.position.z + 6);
    camera.position.lerp(targetPos,0.1);
    const shake = car.speed * 0.002;
    camera.position.x += (Math.random()-0.5)*shake;
    camera.position.y += (Math.random()-0.5)*shake;
    camera.lookAt(car.position);
}

// === Controls ===
let keys = {};
document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

const controls1 = { left: "a", right: "d", forward: "w" };
const controls2 = { left: "ArrowLeft", right: "ArrowRight", forward: "ArrowUp" };

// === NPC Update ===
function updateNPC(){
    npcCars.forEach(npc=>{
        if(!npc.active) return;
        npc.position.z += npc.speed * 2;
        if(Math.random() < 0.002){
            let newLane = Math.floor(Math.random()*3)-1;
            let blocked = npcCars.some(other=>other!==npc && other.lane===newLane && Math.abs(other.position.z - npc.position.z)<4);
            if(!blocked) npc.targetLane=newLane;
        }
        npc.position.x += (npc.targetLane*laneWidth - npc.position.x)*0.1;
        if(npc.position.z>50) resetNPC(npc);
    });
}

// === Crash Detection ===
function detectCrash(car){
    if(!car) return;
    for(let npc of npcCars){
        const dz = Math.abs(car.position.z - npc.position.z);
        const dx = Math.abs(car.position.x - npc.position.x);
        if(dz<2.5 && dx<1.5){
            car.crashed = true;
            car.speed *=0.2;
            car.position.x += (car.position.x - npc.position.x)*0.1;
            car.rotation.z = (car.position.x - npc.position.x)*-0.2;
        }
    }
    if(!car.crashed) car.rotation.z *=0.9;
    else{ car.speed *=0.95; if(car.speed<0.5) car.crashed=false; }
}

// === Car Physics (Player1 & Player2) ===
function updateCarPhysics(car, controls){
    if(!car) return;
    const accel = 0.15, brake=0.25, maxSpeed=220, laneSmooth=0.16, steerStrength=0.035, steerReturn=0.12;
    if(!car.steerAngle) car.steerAngle=0;
    if(!car.targetSteer) car.targetSteer=0;

    if(keys[controls.forward]) car.speed += accel;
    else car.speed*=0.985;
    if(keys["s"] || keys["ArrowDown"]) car.speed -= brake;
    car.speed = Math.max(0, Math.min(car.speed,maxSpeed));

    if(keys[controls.left]){ car.lane = Math.max(-1, car.lane-1); car.targetSteer=-0.6; }
    if(keys[controls.right]){ car.lane = Math.min(1, car.lane+1); car.targetSteer=0.6; }
    if(!keys[controls.left] && !keys[controls.right]) car.targetSteer=0;

    car.steerAngle += (car.targetSteer - car.steerAngle)*steerReturn;
    car.rotation.y = car.steerAngle*steerStrength*(car.speed/maxSpeed*2);
    car.rotation.z = -car.steerAngle*0.3;

    car.position.z -= car.speed*0.05;
    car.position.x += (car.lane*laneWidth - car.position.x)*laneSmooth;

    detectCrash(car);
}

// === Animate ===
function animate(){
    requestAnimationFrame(animate);
    if(car1) updateCarPhysics(car1, controls1);
    if(car2) updateCarPhysics(car2, controls2);
    updateNPC();
    updateCamera(camera1, car1);
    updateCamera(camera2, car2);

    const w = window.innerWidth, h = window.innerHeight;
    renderer.setScissorTest(true);

    // Top screen – Player1
    renderer.setViewport(0, h/2, w, h/2);
    renderer.setScissor(0, h/2, w, h/2);
    renderer.render(scene, camera1);

    // Bottom screen – Player2
    renderer.setViewport(0, 0, w, h/2);
    renderer.setScissor(0, 0, w, h/2);
    renderer.render(scene, camera2);
}

animate();

window.addEventListener("resize", ()=>{
    renderer.setSize(window.innerWidth, window.innerHeight);
});

});
