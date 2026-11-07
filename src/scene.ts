import * as THREE from "three";
import { FIELD_RADIUS, pasturePlace, stageScale, yardSpot, type Stage } from "./tycoon";
import type { traits } from "./core";

export interface YardPet {
  owner: string;
  traits: ReturnType<typeof traits>;
  state: { status: string; hunger: number; happiness: number };
  stage?: Stage;
  wandered?: boolean;
  spot: { x: number; z: number };
  online: boolean;
  nft: { staked: boolean } | null;
  buildings: string[];
}

const fur = (hue: number, accent: number) => ({
  coat: new THREE.Color(`hsl(${hue} 42% 46%)`),
  mark: new THREE.Color(`hsl(${accent} 38% 34%)`),
});

function grassTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const pen = canvas.getContext("2d");
  if (!pen) return null;
  pen.fillStyle = "#2f6a3a";
  pen.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i += 1) {
    const x = (i * 47) % 256;
    const y = (i * 91) % 256;
    pen.fillStyle = i % 3 === 0 ? "#3e7c45" : "#245c30";
    pen.fillRect(x, y, 2, i % 5 === 0 ? 5 : 2);
  }
  pen.fillStyle = "rgba(92, 74, 48, 0.55)";
  pen.beginPath();
  pen.ellipse(128, 150, 28, 70, 0.4, 0, Math.PI * 2);
  pen.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

function addSpecies(group: THREE.Group, pet: YardPet, coat: THREE.Color, mark: THREE.Color) {
  const scruffy = pet.state.status === "scruffy" || pet.state.status === "stray";
  const material = new THREE.MeshStandardMaterial({
    color: coat,
    roughness: scruffy ? 0.92 : 0.62,
    metalness: 0.02,
  });
  const accent = new THREE.MeshStandardMaterial({ color: mark, roughness: 0.7 });
  const species = pet.traits.species;
  const body = new THREE.Mesh(
    species === "Pebblit"
      ? new THREE.SphereGeometry(0.48, 20, 14)
      : species === "Axobop"
        ? new THREE.SphereGeometry(0.5, 20, 14)
        : new THREE.SphereGeometry(species === "Cloudling" ? 0.42 : 0.5, 22, 16),
    material,
  );
  body.scale.set(species === "Pebblit" ? 1.25 : species === "Axobop" ? 1.35 : 1, species === "Sprout" ? 1.15 : species === "Pebblit" ? 0.72 : 1, 1);
  body.position.y = species === "Pebblit" ? 0.38 : 0.62;
  body.castShadow = true;
  group.add(body);
  group.scale.setScalar(stageScale(pet.stage ?? "grown"));
  if (species === "Cloudling") {
    for (const spot of [
      [-0.28, 0.7, 0.1],
      [0.3, 0.78, -0.05],
    ] as const) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), material);
      puff.position.set(spot[0], spot[1], spot[2]);
      puff.castShadow = true;
      group.add(puff);
    }
  }
  if (species === "Mooncat" || species === "Bunbounce") {
    const height = species === "Bunbounce" ? 0.55 : 0.28;
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, height, 10), accent);
      ear.position.set(side * 0.18, 1.05, 0);
      ear.castShadow = true;
      group.add(ear);
    }
  }
  if (species === "Sprout" || species === "Mushling") {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(species === "Mushling" ? 0.38 : 0.16, 14, 10),
      accent,
    );
    cap.scale.y = species === "Sprout" ? 1.8 : 0.55;
    cap.position.y = species === "Mushling" ? 1.05 : 1.25;
    cap.castShadow = true;
    group.add(cap);
  }
  if (species === "Starfin" || species === "Axobop") {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 8), accent);
    fin.rotation.z = Math.PI / 2;
    fin.position.set(-0.55, 0.6, 0);
    group.add(fin);
  }
  if (species === "Boingle" || pet.traits.antenna === 1) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), accent);
    stem.position.y = 1.2;
    group.add(stem);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), accent);
    tip.position.y = 1.4;
    group.add(tip);
  }
  for (let i = 0; i < pet.traits.spots; i += 1) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), accent);
    spot.position.set(-0.15 + i * 0.14, 0.7, 0.42);
    group.add(spot);
  }
  const eyeY = pet.state.status === "stray" || pet.state.status === "scruffy" ? 0.68 : 0.78;
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshStandardMaterial({ color: "#1b2436", roughness: 0.4 }),
    );
    eye.position.set(side * 0.16, eyeY, 0.42);
    group.add(eye);
  }
}

function addBuildings(group: THREE.Group, kinds: string[]) {
  const wood = new THREE.MeshStandardMaterial({ color: "#8a623c", roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: "#d9e4c4", roughness: 0.8 });
  if (kinds.includes("pen")) {
    for (const [x, z] of [
      [0.85, 0.35],
      [1.45, 0.35],
      [0.85, -0.35],
      [1.45, -0.35],
    ] as const) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.55, 6), wood);
      post.position.set(x, 0.28, z);
      post.castShadow = true;
      group.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), wood);
    rail.position.set(1.15, 0.42, 0.35);
    group.add(rail);
  }
  if (kinds.includes("stand")) {
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.38), wood);
    counter.position.set(-1.05, 0.2, 0.15);
    counter.castShadow = true;
    group.add(counter);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 0.46), cloth);
    awning.position.set(-1.05, 0.62, 0.15);
    group.add(awning);
  }
  if (kinds.includes("toy")) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 10),
      new THREE.MeshStandardMaterial({ color: "#c4554a", roughness: 0.55 }),
    );
    ball.position.set(0.2, 0.12, 0.85);
    ball.castShadow = true;
    group.add(ball);
  }
}

export function mountYard(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#6f93c4");
  scene.fog = new THREE.Fog("#6f93c4", 22, 52);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
  camera.position.set(0.5, 9, 18);
  camera.lookAt(0, 0.3, 0);
  scene.add(new THREE.HemisphereLight("#d5e6ff", "#3e6a38", 1.15));
  const sun = new THREE.DirectionalLight("#fff1d6", 1.8);
  sun.position.set(-8, 14, 6);
  sun.castShadow = true;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  scene.add(sun);
  const texture = grassTexture();
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(FIELD_RADIUS + 4, 72),
    new THREE.MeshStandardMaterial({ map: texture ?? undefined, color: "#356b3c", roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const wood = new THREE.MeshStandardMaterial({ color: "#6e8f52", roughness: 0.9 });
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6), new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 0.9 }));
    trunk.position.y = 0.55;
    trunk.castShadow = true;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 8), wood);
    crown.position.y = 1.7;
    crown.castShadow = true;
    tree.add(trunk, crown);
    tree.position.set(Math.cos(angle) * 16, 0, Math.sin(angle) * 16);
    scene.add(tree);
  }
  const rock = new THREE.MeshStandardMaterial({ color: "#8d8a84", roughness: 1 });
  for (let i = 0; i < 7; i += 1) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + (i % 3) * 0.08), rock);
    stone.position.set(Math.cos(i * 1.7) * 14, 0.15, Math.sin(i * 2.1) * 16);
    stone.castShadow = true;
    scene.add(stone);
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pets = new Map<string, { group: THREE.Group; phase: number; status: string; key: string; target: THREE.Vector3 | null }>();
  let root = new THREE.Group();
  scene.add(root);
  let frame = 0;
  let running = true;
  let follow = "";
  let arrive: (x: number, z: number) => void = () => undefined;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  canvas.addEventListener("pointerdown", (event) => {
    if (!follow || !pets.has(follow)) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(ground, false)[0];
    if (!hit) return;
    const reach = Math.hypot(hit.point.x, hit.point.z) || 1;
    const limit = Math.min(1, FIELD_RADIUS / reach);
    const pet = pets.get(follow);
    if (!pet) return;
    pet.target = new THREE.Vector3(hit.point.x * limit, 0, hit.point.z * limit);
  });
  function resize() {
    const width = canvas.clientWidth || 640;
    const height = canvas.clientHeight || 420;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function update(list: YardPet[]) {
    const walking = follow ? pets.get(follow) : undefined;
    const keep = walking?.target
      ? { x: walking.group.position.x, z: walking.group.position.z, target: walking.target }
      : null;
    scene.remove(root);
    root = new THREE.Group();
    scene.add(root);
    pets.clear();
    for (const pet of list) {
      const colors = fur(pet.traits.hue, pet.traits.accent);
      const home = new THREE.Group();
      const nest = yardSpot(pet.owner);
      home.position.set(nest.x, 0, nest.z);
      addBuildings(home, pet.buildings);
      root.add(home);
      const group = new THREE.Group();
      addSpecies(group, pet, colors.coat, colors.mark);
      const place = pet.wandered ? pet.spot : pasturePlace(pet.owner, pet.state.status, Boolean(pet.nft?.staked));
      group.position.set(place.x, 0, place.z);
      const target = keep && pet.owner === follow ? keep.target : null;
      if (keep && pet.owner === follow) group.position.set(keep.x, 0, keep.z);
      if (pet.state.status === "stray") group.rotation.z = 0.6;
      else if (pet.state.status === "scruffy") group.rotation.x = 0.25;
      if (pet.nft?.staked) {
        const collar = new THREE.Mesh(
          new THREE.TorusGeometry(0.28, 0.035, 8, 18),
          new THREE.MeshStandardMaterial({ color: "#c6a15a", roughness: 0.45, metalness: 0.35 }),
        );
        collar.rotation.x = Math.PI / 2;
        collar.position.y = 0.95;
        group.add(collar);
      }
      root.add(group);
      pets.set(pet.owner, { group, phase: place.x, status: pet.state.status, key: "", target });
    }
  }
  function loop() {
    if (!running) return;
    frame += 1;
    const now = performance.now();
    if (!reduced) {
      for (const [owner, pet] of pets) {
        const energy = pet.status === "bouncy" ? 0.06 : pet.status === "peckish" ? 0.025 : 0;
        if (pet.target) {
          const step = pet.target.clone().sub(pet.group.position);
          step.y = 0;
          const distance = step.length();
          if (distance < 0.2) {
            pet.group.position.x = pet.target.x;
            pet.group.position.z = pet.target.z;
            const arrived = pet.target;
            pet.target = null;
            if (owner === follow) arrive(arrived.x, arrived.z);
          } else {
            step.multiplyScalar(Math.min(1, 4.2 / distance) * 0.016);
            pet.group.position.add(step);
            pet.group.lookAt(pet.target.x, pet.group.position.y, pet.target.z);
          }
        }
        pet.group.position.y = Math.sin(frame / 28 + pet.phase) * energy;
      }
    }
    if (follow && pets.has(follow)) {
      const at = pets.get(follow)!.group.position;
      camera.position.lerp(new THREE.Vector3(at.x + 7, 6.4, at.z + 9), 0.06);
      camera.lookAt(at.x, 0.4, at.z);
    }
    resize();
    renderer.render(scene, camera);
    void now;
    requestAnimationFrame(loop);
  }
  loop();
  return {
    update,
    follow(owner: string) {
      follow = owner;
    },
    onArrive(listener: (x: number, z: number) => void) {
      arrive = listener;
    },
    stop: () => (running = false),
  };
}
