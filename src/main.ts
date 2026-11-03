import { GameAudio } from './audio';
import { constrainOrbit } from './camera-bounds';
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, Engine,
  HemisphericLight, ShadowGenerator, MeshBuilder, Quaternion, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import { furnishRoom } from './room';
import { chooseShot } from './opponent';
import { length, pockets, rack, radius, step, width } from './physics';

const canvas = document.querySelector<HTMLCanvasElement>('#table')!;
const status = document.querySelector<HTMLElement>('#status')!;
const quality = document.querySelector<HTMLSelectElement>('#quality')!;
const sound = new GameAudio();
const soundToggle = document.querySelector<HTMLButtonElement>('#soundToggle')!;
const volume = document.querySelector<HTMLInputElement>('#volume')!;
const volumeLabel = document.querySelector<HTMLOutputElement>('#volumeLabel')!;
function updateSound() {
  sound.configure(sound.enabled, Number(volume.value) / 100);
  soundToggle.textContent = sound.enabled ? 'Sound on' : 'Sound off';
  soundToggle.setAttribute('aria-pressed', String(sound.enabled));
  volumeLabel.value = volume.value + '%';
  try { localStorage.setItem('3dbilliard-sound', JSON.stringify({ enabled: sound.enabled, volume: sound.volume })); } catch {}
}
try {
  const saved = JSON.parse(localStorage.getItem('3dbilliard-sound') ?? 'null');
  if (saved && typeof saved.enabled === 'boolean' && typeof saved.volume === 'number' && Number.isFinite(saved.volume)) {
    sound.enabled = saved.enabled;
    volume.value = String(Math.max(0, Math.min(100, saved.volume * 100)));
  }
} catch {}
updateSound();
soundToggle.onclick = () => {
  sound.enabled = !sound.enabled;
  updateSound();
  void sound.unlock();
};
volume.oninput = updateSound;
document.addEventListener('pointerdown', () => { void sound.unlock(); });
document.addEventListener('keydown', () => { void sound.unlock(); });
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.045, 0.062, 0.057, 1);
const camera = new ArcRotateCamera('camera', -Math.PI / 2, 0.83, 3.65, Vector3.Zero(), scene);
camera.lowerRadiusLimit = 0.7;
camera.lowerBetaLimit = 0.025;
camera.upperBetaLimit = 1.28;
camera.allowUpsideDown = false;
camera.panningSensibility = 0;
camera.minZ = 0.03;
camera.fov = 1.1;
camera.onAfterCheckInputsObservable.add(() => {
  const safe = constrainOrbit(camera.alpha, camera.beta, camera.radius);
  if (safe.radius !== camera.radius) camera.inertialRadiusOffset = 0;
  if (safe.beta !== camera.beta) camera.inertialBetaOffset = 0;
  camera.radius = safe.radius;
  camera.beta = safe.beta;
});
camera.upperRadiusLimit = 6;
camera.wheelDeltaPercentage = 0.035;


const ambient = new HemisphericLight('room fill', Vector3.Up(), scene);
ambient.intensity = 0.64;
const lamp = new DirectionalLight('table light', new Vector3(-0.35, -1, 0.24), scene);
lamp.intensity = 1.15;
lamp.position.set(1.2, 3.5, -1);
lamp.diffuse = Color3.FromHexString("#fff0d6");
ambient.groundColor = Color3.FromHexString("#34302a");
const shadows = new ShadowGenerator(1024, lamp);
shadows.useBlurExponentialShadowMap = true;
shadows.blurKernel = 16;
shadows.darkness = 0.30;

function material(name: string, hex: string, shine = 0.03) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(shine, shine, shine);
  m.specularPower = 80;
  return m;
}
const wood = material('walnut', '#63452e', 0.34);
const cloth = material('green baize', '#23735a');
const rubber = material('cushion', '#184739');
const leather = material('pocket leather', '#211916', 0.14);
const dark = material('pocket interior', '#090909');
const brass = material('brass', '#bca074', 0.65);
const pearl = material('mother of pearl sights', '#e8dfc9', 0.4);
const trim = material('ebony frame accents', '#201e1b', 0.3);
const floor = material('room floor', '#202923');

function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, m: StandardMaterial) {
  const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  mesh.position.set(x, y, z);
  mesh.material = m;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  shadows.addShadowCaster(mesh);
  return mesh;
}

function weave() {
  const texture = new DynamicTexture('cloth weave', 1024, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#d2d9d3';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 1024; i += 2) {
    ctx.fillStyle = i % 4 ? '#ffffff18' : '#00000014';
    ctx.fillRect(i, 0, 1, 1024);
    ctx.fillRect(0, i, 1024, 1);
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (const pocket of pockets) {
    ctx.save();
    ctx.translate((pocket.x / width + 0.5) * 1024, (pocket.z / length + 0.5) * 1024);
    ctx.scale(1024 / width, 1024 / length);
    ctx.beginPath();
    ctx.arc(0, 0, 0.067, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  texture.hasAlpha = true;
  texture.update();
  return texture;
}
cloth.diffuseTexture = weave();
cloth.bumpTexture = weave();
cloth.bumpTexture.level = 0.12;
furnishRoom(scene, wood, brass);
box('floor', 0, -0.79, 0, 15, 0.04, 15, floor);
box('cabinet', 0, -0.20, 0, width + 0.24, 0.20, length + 0.22, wood);
box('lower frame', 0, -0.305, 0, width + 0.20, 0.035, length + 0.18, trim);
for (const side of [-1, 1]) {
  box('apron brass inlay', side * (width / 2 + 0.122), -0.16, 0, 0.003, 0.007, length + 0.12, brass);
  box('end apron inlay', 0, -0.16, side * (length / 2 + 0.112), width + 0.20, 0.007, 0.003, brass);
  box('apron inset', side * (width / 2 + 0.123), -0.245, 0, 0.006, 0.035, length - 0.32, trim);
}
for (const x of [-0.54, 0.54]) {
  for (const z of [-0.94, 0.94]) {
    const leg = MeshBuilder.CreateCylinder('leg', { height: 0.43, diameterTop: 0.24, diameterBottom: 0.16, tessellation: 4 }, scene);
    leg.position.set(x, -0.53, z);
    leg.rotation.y = Math.PI / 4;
    leg.material = wood;
    leg.isPickable = false;
    shadows.addShadowCaster(leg);
    box('leg collar', x, -0.34, z, 0.174, 0.045, 0.174, trim);
    box('leg brass band', x, -0.70, z, 0.12, 0.012, 0.12, brass);
    box('foot', x, -0.75, z, 0.17, 0.05, 0.18, brass);
  }
}
cloth.transparencyMode = 1;
const bed = MeshBuilder.CreateGround('playing surface', { width, height: length }, scene);
bed.material = cloth;
bed.receiveShadows = true;
bed.isPickable = true;
for (const side of [-1, 1]) {
  for (const end of [-1, 1]) {
    box('side rail', side * (width / 2 + 0.061), 0.018, end * length / 4, 0.122, 0.09, length / 2 - 0.16, wood);
    box('rail edge inlay', side * (width / 2 + 0.114), 0.064, end * length / 4, 0.004, 0.002, length / 2 - 0.19, brass);
    box('side cushion', side * (width / 2 + 0.012), 0.039, end * length / 4, 0.034, 0.042, length / 2 - 0.17, rubber);
  }
  box('end rail', 0, 0.018, side * (length / 2 + 0.061), width - 0.17, 0.09, 0.122, wood);
  box('end edge inlay', 0, 0.064, side * (length / 2 + 0.114), width - 0.20, 0.002, 0.004, brass);
  for (const x of [-0.31, 0, 0.31]) {
    const sight = box('end rail sight', x, 0.064, side * (length / 2 + 0.078), 0.012, 0.002, 0.012, pearl);
    sight.rotation.y = Math.PI / 4;
  }
  box('end cushion', 0, 0.039, side * (length / 2 + 0.012), width - 0.18, 0.042, 0.034, rubber);
  for (const z of [-0.92, -0.63, -0.34, 0.34, 0.63, 0.92]) {
    const sight = box('rail sight', side * (width / 2 + 0.078), 0.064, z, 0.012, 0.002, 0.012, pearl);
    sight.rotation.y = Math.PI / 4;
  }
}
for (const pocket of pockets) {
  const rim = MeshBuilder.CreateTorus('pocket rim', { diameter: 0.145, thickness: 0.017, tessellation: 32 }, scene);
  rim.position.set(pocket.x, 0.018, pocket.z);
  rim.material = leather;
  rim.isPickable = false;
  const piping = MeshBuilder.CreateTorus('pocket seam', { diameter: 0.153, thickness: 0.002, tessellation: 32 }, scene);
  piping.position.set(pocket.x, 0.022, pocket.z);
  piping.material = pearl;
  piping.isPickable = false;
  const well = MeshBuilder.CreateCylinder('pocket liner', { height: 0.095, diameter: 0.132, tessellation: 32, cap: 0, sideOrientation: 2 }, scene);
  well.position.set(pocket.x, -0.035, pocket.z);
  well.material = leather;
  well.isPickable = false;
  const opening = MeshBuilder.CreateDisc('pocket opening', { radius: 0.067, tessellation: 32 }, scene);
  opening.rotation.x = Math.PI / 2;
  opening.position.set(pocket.x, -0.08, pocket.z);
  opening.material = dark;
  opening.isPickable = false;
}

const palette = ['#e8ad20', '#174ea3', '#be322e', '#634082', '#e77528', '#287352', '#77292c', '#161719'];
const ballMeshes = rack(true).map((_, index) => {
  const mesh = MeshBuilder.CreateSphere('ball ' + index, { diameter: 2 * radius, segments: 24 }, scene);
  shadows.addShadowCaster(mesh);
  const finish = material('polished resin ' + index, '#ffffff', 0.95);
  const texture = new DynamicTexture('ball markings ' + index, { width: 512, height: 256 }, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = index === 0 || index > 8 ? '#f6eedc' : palette[(index - 1) % 8];
  ctx.fillRect(0, 0, 512, 256);
  if (index > 8) {
    ctx.fillStyle = palette[(index - 1) % 8];
    ctx.fillRect(0, 67, 512, 122);
  }
  for (const x of [128, 384]) {
    ctx.beginPath();
    ctx.arc(x, 128, index === 0 ? 6 : 33, 0, Math.PI * 2);
    ctx.fillStyle = index === 0 ? '#a6342c' : '#f6eedc';
    ctx.fill();
    if (index) {
      ctx.fillStyle = '#131719';
      ctx.font = 'bold 35px sans-serif';
  
  
      ctx.fillText(String(index), x - ctx.measureText(String(index)).width / 2, 140);
    }
  }
  texture.update();
  finish.diffuseTexture = texture;
  mesh.material = finish;
  mesh.isPickable = false;
  mesh.rotationQuaternion = Quaternion.Identity();
  mesh.isVisible = index < 16;
  return mesh;
});
const poolFinishes = ballMeshes.map(mesh => mesh.material);
const redFinish = material("snooker red", "#ae272d", 0.95);
const colourFinishes = ["#e5bb25", "#26754d", "#754735", "#275d9e", "#e885a3", "#18191c"]
  .map((hex, index) => material("snooker colour " + index, hex, 0.95));

const contact = new DynamicTexture('soft contact', 64, scene, true);
const ctx = contact.getContext();
const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
gradient.addColorStop(0, '#000000a8');
gradient.addColorStop(1, '#00000000');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 64, 64);
contact.hasAlpha = true;
contact.update();
const shadow = material('contact shadow', '#ffffff', 0);
shadow.disableLighting = true;

shadow.diffuseTexture = contact;
shadow.useAlphaFromDiffuseTexture = true;
const contacts = ballMeshes.map(() => {
  const mesh = MeshBuilder.CreateGround('contact', { width: 0.105, height: 0.105 }, scene);
  mesh.material = shadow;
  mesh.isVisible = false;
  mesh.isPickable = false;
  return mesh;
});

const settings = document.querySelector<HTMLDialogElement>('#settings')!;
const select = (id: string) => document.querySelector<HTMLSelectElement>('#' + id)!;
const score = document.querySelector<HTMLElement>('#score')!;
let snooker = false;
let versusComputer = false;
let turn = 0;
let scores = [0, 0];
let colourAfterRed = false;
let finished = false;
let firstContact: number | undefined;
let shotTargets: number[] = [];
let previouslyPocketed: boolean[] = [];
let cpuWait = 0;
let balls = rack();
const colourNames = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];

function legalTargets() {
  const active = balls.flatMap((ball, index) => index && !ball.pocketed ? [index] : []);
  if (!snooker) return active;
  const reds = active.filter(index => index <= 15);
  const colours = active.filter(index => index > 15);
  if (colourAfterRed) return colours;
  return reds.length ? reds : colours.slice(0, 1);
}

function showScore() {
  const points = versusComputer ? 'You ' + scores[0] + ' · Computer ' + scores[1] : 'Score ' + scores[0];
  const target = legalTargets()[0];
  const on = colourAfterRed ? 'colour' : target <= 15 ? 'red' : colourNames[target - 16];
  score.textContent = (snooker ? 'Snooker' : 'Pool') + ' · ' + points +
    (snooker && !finished && on ? ' · On ' + on : '');
}

function respot(index: number) {
  const spot = rack(snooker)[index];
  const available = (x: number, z: number) => balls.every((ball, other) =>
    other === index || ball.pocketed || Math.hypot(ball.x - x, ball.z - z) >= 2 * radius + 0.001);
  let z = spot.z;
  if (!available(spot.x, z)) {
    for (let offset = 0.005; offset < length; offset += 0.005) {
      const candidate = [spot.z + offset, spot.z - offset].find(value =>
        Math.abs(value) < length / 2 - radius && available(spot.x, value));
      if (candidate !== undefined) {
        z = candidate;
        break;
      }
    }
  }
  Object.assign(balls[index], spot, { z });
  ballMeshes[index].position.set(spot.x, radius, z);
  ballMeshes[index].rotationQuaternion = Quaternion.Identity();
}

function finishShot() {
  const potted = balls.flatMap((ball, index) => index && ball.pocketed && !previouslyPocketed[index] ? [index] : []);
  const scratch = balls[0].pocketed;
  const foul = scratch || (snooker && (
    firstContact === undefined || !shotTargets.includes(firstContact) ||
    potted.some(index => !shotTargets.includes(index)) || (colourAfterRed && potted.length > 1)
  ));
  const value = (index: number) => index <= 15 ? 1 : index - 14;
  if (snooker) {
    if (foul && versusComputer) scores[1 - turn] += Math.max(4, value(shotTargets[0]), value(firstContact ?? 0), ...potted.map(value));
    if (colourAfterRed || shotTargets[0] <= 15 || foul) {
      for (const index of potted) if (index > 15) respot(index);
    }
    colourAfterRed = !foul && potted.some(index => index <= 15);
  }
  if (!foul || !snooker) scores[turn] += snooker ? potted.reduce((sum, index) => sum + value(index), 0) : potted.length;
  if (scratch) respot(0);
  finished = legalTargets().length === 0;
  if (!finished && versusComputer && (foul || !potted.length)) turn = 1 - turn;
  if (foul && turn === 0 && !finished) {
    placement = 'foul';
    if (viewMode) viewToggle.click();
  }
  cpuWait = 0.85;
  showScore();
  showReadyStatus();

}
balls.forEach((ball, index) => ballMeshes[index].position.set(ball.x, radius, ball.z));
let aim = new Vector3(0, 0, 1);
let rolling = false;
let overhead = false;
let cameraTarget: number | undefined;
let accumulator = 0;
const fixedStep = 1 / 300;
const aimLine = MeshBuilder.CreateLines('aim guide', {
  points: [Vector3.Zero(), Vector3.Forward()], updatable: true,
}, scene);
aimLine.color = Color3.FromHexString('#f0e6ba');
aimLine.isPickable = false;
const cue = MeshBuilder.CreateCylinder('cue', { height: 0.68, diameterTop: 0.011, diameterBottom: 0.027, tessellation: 16 }, scene);
cue.material = material('cue maple', '#cb9358', 0.26);
cue.isPickable = false;
let strike = 0;
let placement: "break" | "foul" | undefined = "break";
let shotPower = 0;
let tipX = 0, tipY = 0;
let pull = 0;
let strokePointer: number | undefined;
let strokeStart = 0;
const tip = document.querySelector<HTMLButtonElement>("#tip")!;
const mark = document.querySelector<HTMLElement>("#tipMark")!;
const stroke = document.querySelector<HTMLButtonElement>("#stroke")!;
const powerValue = document.querySelector<HTMLOutputElement>("#powerValue")!;
function showPull() {
  const percent = Math.round(pull * 100);
  powerValue.value = percent + "%";
  stroke.style.setProperty("--power", percent + "%");
  stroke.style.setProperty("--cue-pull", -percent * 0.58 + "%");
}
function setTip(x: number, y: number) {
  const limit = Math.max(1, Math.hypot(x, y) / 0.78);
  tipX = x / limit;
  tipY = y / limit;
  mark.style.left = (50 + tipX * 50) + "%";
  mark.style.top = (50 - tipY * 50) + "%";
  tip.title = "Contact offset: " + Math.round(tipX * 100) + "% horizontal, " + Math.round(tipY * 100) + "% vertical";
}
setTip(0, 0);
function selectTip(event: PointerEvent) {
  const bounds = tip.getBoundingClientRect();
  setTip(2 * (event.clientX - bounds.left) / bounds.width - 1, 1 - 2 * (event.clientY - bounds.top) / bounds.height);
}
tip.onpointerdown = event => {
  if (!event.isPrimary || event.button !== 0 || rolling || strike || strokePointer !== undefined) return;
  tip.setPointerCapture(event.pointerId);
  selectTip(event);
};
tip.onpointermove = event => {
  if (!rolling && !strike && strokePointer === undefined && tip.hasPointerCapture(event.pointerId)) selectTip(event);
};
tip.onkeydown = event => {
  if (rolling || strike || strokePointer !== undefined) return;
  const offsets: Record<string, [number, number]> = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] };
  const offset = offsets[event.key];
  if (event.key === "Home") setTip(0, 0);
  else if (offset) setTip(tipX + offset[0], tipY + offset[1]);
  else return;
  event.preventDefault();
};
function fire(strength: number) {
  if (rolling || strike) return;
  placement = undefined;
  firstContact = undefined;
  shotTargets = legalTargets();
  previouslyPocketed = balls.map(ball => ball.pocketed);
  shotPower = strength;
  strike = 0.19;
}
stroke.onpointerdown = event => {
  if (!event.isPrimary || event.button !== 0 || rolling || strike || turn !== 0 || finished) return;
  if (strokePointer !== undefined || aimPointer !== undefined) return;
  strokePointer = event.pointerId;
  strokeStart = event.clientX;
  stroke.setPointerCapture(event.pointerId);
};
function updatePull(event: PointerEvent) {
  pull = Math.min(1, Math.max(0, (strokeStart - event.clientX) / 110));
  showPull();
}
stroke.onpointermove = event => {
  if (strokePointer === event.pointerId) updatePull(event);
};
function clearStroke() {
  strokePointer = undefined;
  pull = 0;
  showPull();
}
stroke.onpointerup = event => {
  if (strokePointer !== event.pointerId) return;
  updatePull(event);
  const strength = pull;
  clearStroke();
  if (strength >= 0.08) fire(strength);
};
stroke.onlostpointercapture = event => {
  if (strokePointer === event.pointerId) clearStroke();
};
let aimPointer: number | undefined;
let movingCueBall = false;
let viewMode = false;
const viewToggle = document.querySelector<HTMLButtonElement>('#viewMode')!;

function showReadyStatus() {
  if (finished) {
    status.textContent = !versusComputer ? "Table cleared. Re-rack to play again." :
      scores[0] === scores[1] ? "Match drawn." : scores[0] > scores[1] ? "You win!" : "Computer wins.";
    return;
  }
  if (turn === 1) {
    status.textContent = "Computer is lining up a shot.";
    return;
  }
  if (placement && !viewMode) {
    status.textContent = placement === 'break' ? 'Drag the cue ball behind the head string. Aim on the cloth.' : 'Ball in hand. Drag the cue ball or aim on the cloth.';
    return;
  }
  status.textContent = viewMode ? 'Drag to orbit. Pinch or scroll to zoom.' : 'Tap or drag on the table to aim.';
}

viewToggle.onclick = () => {

  viewMode = !viewMode;
  viewToggle.textContent = viewMode ? 'View on' : 'View off';
  viewToggle.setAttribute('aria-pressed', String(viewMode));
  if (viewMode) camera.attachControl(canvas, true);
  else camera.detachControl();
  if (!rolling && !strike) showReadyStatus();
};

function aimAtPointer(event: PointerEvent, starting = false) {
  if (viewMode || rolling || strike || turn !== 0 || finished || strokePointer !== undefined) return;
  const bounds = canvas.getBoundingClientRect();
  const hit = scene.pick(event.clientX - bounds.left, event.clientY - bounds.top, mesh => mesh === bed)?.pickedPoint;
  if (!hit) return;
  if (starting) {
    movingCueBall = Boolean(placement) && Math.hypot(hit.x - balls[0].x, hit.z - balls[0].z) <= 2.5 * radius;
  }
  if (placement && movingCueBall) {
    if (starting) return;
    const xLimit = width / 2 - radius;
    const zLimit = length / 2 - radius;
    const x = Math.max(-xLimit, Math.min(xLimit, hit.x));
    const z = Math.max(-zLimit, Math.min(placement === "break" ? -length / 4 : zLimit, hit.z));
    if (pockets.some(pocket => Math.hypot(pocket.x - x, pocket.z - z) < 0.085)) return;
    if (balls.slice(1).some(ball => !ball.pocketed && Math.hypot(ball.x - x, ball.z - z) < 2 * radius + 0.001)) return;
    Object.assign(balls[0], { x, z });
    return;
  }
  const next = new Vector3(hit.x - balls[0].x, 0, hit.z - balls[0].z);
  if (next.lengthSquared() > radius * radius) aim = next.normalize();
}

canvas.addEventListener('pointerdown', event => {
  if (viewMode || !event.isPrimary || event.button !== 0 || rolling || strike) return;
  aimPointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  movingCueBall = false;
  aimAtPointer(event, true);
});
canvas.addEventListener('pointermove', event => {
  if (aimPointer === event.pointerId) aimAtPointer(event);
});
canvas.addEventListener('pointerup', event => {
  if (aimPointer !== event.pointerId) return;
  aimPointer = undefined;
  aimAtPointer(event);
  movingCueBall = false;
});
canvas.addEventListener('lostpointercapture', event => {
  if (aimPointer !== event.pointerId) return;
  aimPointer = undefined;
  movingCueBall = false;
});

document.querySelector<HTMLButtonElement>('#camera')!.onclick = event => {
  overhead = !overhead;
  cameraTarget = overhead ? 0.025 : 0.83;
  (event.currentTarget as HTMLButtonElement).textContent = overhead ? 'Perspective' : 'Overhead';
};
function resetMatch() {
  balls = rack(snooker);
  turn = 0;
  scores = [0, 0];
  finished = colourAfterRed = false;
  cpuWait = 0;
  setTip(0, 0);
  showScore();
  placement = "break";
  aimPointer = undefined;
  movingCueBall = false;
  if (viewMode) viewToggle.click();
  aim = Vector3.Forward();
  rolling = false;
  strike = accumulator = 0;
  clearStroke();
  showReadyStatus();
  ballMeshes.forEach((mesh, index) => {
    const ball = balls[index];
    mesh.isVisible = Boolean(ball);
    contacts[index].isVisible = Boolean(ball);
    if (!ball) return;
    mesh.material = snooker && index > 0 ? (index <= 15 ? redFinish : colourFinishes[index - 16]) : poolFinishes[index];
    mesh.position.set(ball.x, radius, ball.z);
    mesh.rotationQuaternion = Quaternion.Identity();
  });
}
document.querySelector<HTMLButtonElement>('#reset')!.onclick = resetMatch;
document.querySelector<HTMLButtonElement>('#openSettings')!.onclick = () => {
  select('game').value = snooker ? 'snooker' : 'pool';
  select('opponent').value = versusComputer ? 'computer' : 'solo';
  settings.showModal();
};
settings.addEventListener('close', () => {
  if (settings.returnValue !== 'start') return;
  settings.returnValue = '';
  snooker = select('game').value === 'snooker';
  versusComputer = select('opponent').value === 'computer';
  resetMatch();
});

const cueStyles: Record<string, [string, string]> = {
  'Classic Maple': ['#cb9358', '#673925'],
  Rosewood: ['#a95d45', '#572922'],
  'Carbon Black': ['#525762', '#171b23'],
};
const tableStyles: Record<string, [string, string, string]> = {
  'Club Green': ['#23735a', '#184739', '#43271b'],
  'Tournament Blue': ['#286594', '#174464', '#25282d'],
  'Burgundy Lounge': ['#913b4e', '#612b3c', '#523121'],
};
select('cueStyle').onchange = () => {
  const [shaft, butt] = cueStyles[select('cueStyle').value];
  (cue.material as StandardMaterial).diffuseColor = Color3.FromHexString(shaft);
  stroke.style.setProperty('--cue-shaft', shaft);
  stroke.style.setProperty('--cue-butt', butt);
};
select('tableStyle').onchange = () => {
  const [felt, cushion, rail] = tableStyles[select('tableStyle').value];
  cloth.diffuseColor = Color3.FromHexString(felt);
  rubber.diffuseColor = Color3.FromHexString(cushion);
  wood.diffuseColor = Color3.FromHexString(rail);
};
showScore();
showReadyStatus();

function resize() {
  const scales: Record<string, number> = { Low: 0.65, Medium: 0.85, High: 1, Ultra: 1.5 };
  shadows.getShadowMap()!.renderList = scene.meshes.filter(mesh => mesh.name.startsWith("ball ") || ["cabinet", "leg", "side rail", "end rail"].includes(mesh.name));
  scene.shadowsEnabled = quality.value !== "Low";
  const shadowSize = quality.value === "Ultra" ? 2048 : quality.value === "High" ? 1024 : 512;
  shadows.mapSize = shadowSize;
  engine.setHardwareScalingLevel(1 / Math.min(scales[quality.value], window.devicePixelRatio || 1));
  engine.resize();
}
quality.onchange = resize;
new ResizeObserver(resize).observe(canvas);
resize();

engine.runRenderLoop(() => {
  stroke.disabled = rolling || strike > 0 || turn !== 0 || finished;
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  const cueBall = balls[0];
  if (turn === 1 && !finished && !rolling && !strike && !settings.open) {
    cpuWait -= dt;
    if (cpuWait <= 0) {
      const shot = chooseShot(balls, legalTargets(), select("difficulty").value);
      if (shot) {
        aim.set(Math.sin(shot.angle), 0, Math.cos(shot.angle));
        setTip(0, 0);
        fire(shot.power);
      }
    }
  }
  if (strike) {
    strike = Math.max(0, strike - dt);
    if (!strike) {
      const speed = shotPower * 4.3;
      cueBall.spinX = aim.x * tipY * speed * 2.3;
      cueBall.spinZ = aim.z * tipY * speed * 2.3;
      cueBall.sideSpin = tipX * speed;
      cueBall.vx = aim.x * speed;
      cueBall.vz = aim.z * speed;
      rolling = true;
      status.textContent = 'Balls in motion';
    }
  }
  if (rolling) {
    accumulator += dt;
    while (accumulator >= fixedStep) {
      const contact = step(balls, fixedStep, sound.queue);
      firstContact ??= contact;
      accumulator -= fixedStep;
    }
    if (balls.every(ball => ball.vx === 0 && ball.vz === 0)) {
      rolling = false;
      accumulator = 0;
      finishShot();
    }
  }
  balls.forEach((ball, index) => {
    const mesh = ballMeshes[index];
    const dx = ball.x - mesh.position.x, dz = ball.z - mesh.position.z;
    const distance = Math.hypot(dx, dz);
    if (rolling && distance > 0.00001) {
      const rotation = Quaternion.RotationAxis(new Vector3(dz, 0, -dx).normalize(), distance / radius);
      mesh.rotationQuaternion = rotation.multiply(mesh.rotationQuaternion!);
    }
    mesh.position.set(ball.x, ball.pocketed ? Math.max(-0.12, mesh.position.y - dt * 0.48) : radius, ball.z);
    mesh.isVisible = mesh.position.y > -0.04;
    contacts[index].position.set(ball.x, 0.0008, ball.z);
    contacts[index].isVisible = !ball.pocketed;
  });
  aimLine.isVisible = !rolling && !strike && !movingCueBall && !finished;
  cue.isVisible = !rolling && !movingCueBall && !finished;
  if (!rolling) {
    const origin = new Vector3(cueBall.x, radius, cueBall.z);
    const contactOffset = new Vector3(aim.z * tipX, tipY, -aim.x * tipX).scale(radius);
    cue.position.copyFrom(origin.add(contactOffset).subtract(aim.scale(0.37 + strike * shotPower * 0.9 + pull * 0.16)));
    cue.rotationQuaternion = Quaternion.RotationAxis(new Vector3(aim.z, 0, -aim.x), Math.PI / 2);
    const xEdge = aim.x >= 0 ? width / 2 : -width / 2;
    const zEdge = aim.z >= 0 ? length / 2 : -length / 2;
    const reach = Math.min(aim.x ? (xEdge - origin.x) / aim.x : Infinity, aim.z ? (zEdge - origin.z) / aim.z : Infinity);
    MeshBuilder.CreateLines('aim guide', { points: [origin.add(aim.scale(radius)), origin.add(aim.scale(reach))], instance: aimLine });
  }
  if (cameraTarget !== undefined) {
    camera.beta += (cameraTarget - camera.beta) * Math.min(dt * 7, 1);
    if (Math.abs(cameraTarget - camera.beta) < 0.003) cameraTarget = undefined;
  }
  sound.flush();
  scene.render();
});



















