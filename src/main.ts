import { GameAudio } from './audio';
import { cueLength, cuePose } from './cue-geometry';
import { traceShot } from './aim-guide';
import { OnlineGame } from './online';
import { groupOf, poolTargets, resolvePoolShot, type Groups } from './pool-rules';
import { validGame, type SavedGame } from './saved-game';
import { constrainOrbit } from './camera-bounds';
import {
  ArcRotateCamera, Camera, Color3, Color4, DirectionalLight, DynamicTexture, Engine,
  HemisphericLight, ShadowGenerator, Matrix, MeshBuilder, Quaternion, Scene, StandardMaterial, Vector3,
} from '@babylonjs/core';
import { furnishRoom } from './room';
import { chooseShot } from './opponent';
import { isMoving, length, pockets, rack, radius, shotSpeed, step, strikeBall, width } from './physics';

const canvas = document.querySelector<HTMLCanvasElement>('#table')!;
const status = document.querySelector<HTMLElement>('#status')!;
const quality = document.querySelector<HTMLSelectElement>('#quality')!;
const mobileMenu = document.querySelector<HTMLButtonElement>('#mobileMenu')!;
const tableActions = document.querySelector<HTMLElement>('#tableActions')!;
const hudHeader = document.querySelector<HTMLElement>('header')!;
const menuDialog = document.querySelector<HTMLDialogElement>('#mobileGameMenu')!;
const menuActions = document.querySelector<HTMLElement>('#gameMenuActions')!;
const mobileLayout = window.matchMedia('(max-width: 600px)');
const actionDescriptions: Record<string, string> = {
  viewMode: 'Look around the table',
  camera: 'Switch between top-down and 3D',
  reset: 'Set up a fresh game',
  openOnline: 'Your profile, QR code & online play',
  openSettings: 'Game, equipment, sound & guides',
};
for (const button of tableActions.querySelectorAll<HTMLButtonElement>('button')) {
  const description = document.createElement('span');
  description.className = 'menu-description';
  description.textContent = actionDescriptions[button.id];
  button.append(description);
}
function setMobileMenu(open: boolean, restoreFocus = false) {
  open = open && mobileLayout.matches;
  if (open && !menuDialog.open) {
    menuActions.append(tableActions);
    menuDialog.showModal();
  } else if (!open) {
    if (menuDialog.open) menuDialog.close();
    menuDialog.classList.remove('modal-parent');
    delete menuDialog.dataset.activeChild;
    if (tableActions.parentElement !== hudHeader) hudHeader.append(tableActions);
  }
  hudHeader.dataset.menuOpen = String(open);
  mobileMenu.setAttribute('aria-expanded', String(open));
  mobileMenu.setAttribute('aria-label', open ? 'Close game menu' : 'Open game menu');
  if (restoreFocus && !document.querySelector('dialog[open]')) mobileMenu.focus();
}
mobileMenu.onclick = () => setMobileMenu(!menuDialog.open);
tableActions.addEventListener('click', event => {
  const button = (event.target as Element).closest('button');
  if (!menuDialog.open || !button || button.disabled) return;
  const childId = button.id === 'openSettings' ? 'settings' : button.id === 'openOnline' ? 'online' : button.id === 'reset' && needsRerackConfirmation() ? 'rerackConfirm' : undefined;
  if (childId) {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      button.animate([
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(2px) scale(.985)', offset: 0.35 },
        { transform: 'translateY(0) scale(1)' },
      ], { duration: 180, easing: 'ease-out' });
    }
    menuDialog.dataset.activeChild = childId;
    menuDialog.classList.add('modal-parent');
    document.getElementById(childId)!.classList.add('modal-child');
  } else setMobileMenu(false);
}, true);
for (const child of document.querySelectorAll<HTMLDialogElement>('#settings, #online, #rerackConfirm')) {
  child.addEventListener('close', () => {
    child.classList.remove('modal-child');
    if (menuDialog.dataset.activeChild !== child.id) return;
    menuDialog.classList.remove('modal-parent');
    delete menuDialog.dataset.activeChild;
    if (child.id === 'settings' && child.returnValue === 'start' || child.id === 'rerackConfirm' && child.returnValue === 'rerack') setMobileMenu(false);
  });
}
document.querySelector<HTMLButtonElement>('#closeGameMenu')!.onclick = () => setMobileMenu(false, true);
menuDialog.addEventListener('cancel', event => {
  event.preventDefault();
  setMobileMenu(false, true);
});
menuDialog.addEventListener('close', () => {
  if (!menuDialog.open) setMobileMenu(false);
});
menuDialog.addEventListener('click', event => {
  if (event.target !== menuDialog) return;
  const bounds = menuDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setMobileMenu(false, true);
});
mobileLayout.addEventListener('change', () => setMobileMenu(false));
const zoomSlider = document.querySelector<HTMLInputElement>('#cameraZoom')!;
const zoomFit = document.querySelector<HTMLButtonElement>('#zoomFit')!;
let cameraZoom = 1;
try {
  const saved = Number(localStorage.getItem('billiard-camera-zoom'));
  if (Number.isFinite(saved) && saved >= 0.65 && saved <= 2.5) cameraZoom = saved;
} catch {}
function zoomFov() { return 2 * Math.atan(Math.tan(1.1 / 2) / cameraZoom); }
function showZoom() {
  zoomSlider.value = String(cameraZoom);
  zoomSlider.setAttribute('aria-valuetext', cameraZoom.toFixed(1) + ' times zoom');
  zoomFit.textContent = cameraZoom.toFixed(1) + '×';
}
function setCameraZoom(value: number) {
  if (!Number.isFinite(value)) return;
  cameraZoom = Math.max(0.65, Math.min(2.5, Math.round(value * 20) / 20));
  showZoom();
  if (overhead && !viewMode) fitOverheadCamera();
  else camera.fov = zoomFov();
  try { localStorage.setItem('billiard-camera-zoom', String(cameraZoom)); } catch {}
}
zoomSlider.oninput = () => setCameraZoom(Number(zoomSlider.value));
document.querySelector<HTMLButtonElement>('#zoomIn')!.onclick = () => setCameraZoom(cameraZoom + 0.1);
document.querySelector<HTMLButtonElement>('#zoomOut')!.onclick = () => setCameraZoom(cameraZoom - 0.1);
zoomFit.onclick = () => setCameraZoom(1);
showZoom();
const guidesToggle = document.querySelector<HTMLButtonElement>('#guidesToggle')!;
let guidesEnabled = true;
try { guidesEnabled = localStorage.getItem('billiard-guides') !== 'off'; } catch {}
function updateGuides() {
  guidesToggle.textContent = guidesEnabled ? 'Guides on' : 'Guides off';
  guidesToggle.setAttribute('aria-pressed', String(guidesEnabled));
}
guidesToggle.onclick = () => {
  guidesEnabled = !guidesEnabled;
  try { localStorage.setItem('billiard-guides', guidesEnabled ? 'on' : 'off'); } catch {}
  updateGuides();
};
updateGuides();
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
const camera = new ArcRotateCamera('camera', -Math.PI / 2, 0.025, 2.5, Vector3.Zero(), scene);
camera.lowerRadiusLimit = 0.7;
camera.lowerBetaLimit = 0.025;
camera.upperBetaLimit = 1.28;
camera.allowUpsideDown = false;
camera.panningSensibility = 0;
camera.minZ = 0.03;
camera.fov = zoomFov();
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
const pocketCallMaterial = material('called pocket marker', '#e8bd72');
pocketCallMaterial.disableLighting = true;
pocketCallMaterial.emissiveColor = Color3.FromHexString('#e8bd72');
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
  ctx.fillStyle = '#000000';
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
    const railCenter = end * (0.085 + length / 2 - 0.12) / 2;
    box('side rail', side * (width / 2 + 0.061), 0.018, railCenter, 0.122, 0.09, length / 2 - 0.205, wood);
    box('rail edge inlay', side * (width / 2 + 0.114), 0.064, railCenter, 0.004, 0.002, length / 2 - 0.225, brass);
    box('side cushion', side * (width / 2 + 0.012), 0.039, railCenter, 0.034, 0.042, length / 2 - 0.205, rubber);
  }
  box('end rail', 0, 0.018, side * (length / 2 + 0.061), width - 0.24, 0.09, 0.122, wood);
  box('end edge inlay', 0, 0.064, side * (length / 2 + 0.114), width - 0.26, 0.002, 0.004, brass);
  for (const x of [-0.31, 0, 0.31]) {
    const sight = box('end rail sight', x, 0.064, side * (length / 2 + 0.078), 0.012, 0.002, 0.012, pearl);
    sight.rotation.y = Math.PI / 4;
  }
  box('end cushion', 0, 0.039, side * (length / 2 + 0.012), width - 0.24, 0.042, 0.034, rubber);
  for (const z of [-0.92, -0.63, -0.34, 0.34, 0.63, 0.92]) {
    const sight = box('rail sight', side * (width / 2 + 0.078), 0.064, z, 0.012, 0.002, 0.012, pearl);
    sight.rotation.y = Math.PI / 4;
  }
}
const pocketSelectors = pockets.map((pocket, index) => {
  const disc = MeshBuilder.CreateDisc('call pocket ' + index, {radius: 0.09, tessellation: 32, sideOrientation: 2}, scene);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(pocket.x, 0.07, pocket.z);
  disc.visibility = 0;
  disc.isPickable = true;
  disc.setEnabled(false);
  return disc;
});
const pocketCallRings = pockets.map(pocket => {
  const ring = MeshBuilder.CreateTorus('pocket call selection', {diameter: 0.16, thickness: 0.003, tessellation: 48}, scene);
  ring.position.set(pocket.x, 0.035, pocket.z);
  ring.material = pocketCallMaterial;
  ring.isPickable = false;
  ring.isVisible = false;
  return ring;
});
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
const online = new OnlineGame();
let onlineMode = false;
let groups: Groups = [null, null];
let winner: number | undefined;
let breaking = true;
let shotWasBreak = false;
let calledPocket: number | undefined;
let turn = 0;
let scores = [0, 0];
let colourAfterRed = false;
let finished = false;
let firstContact: number | undefined;
let shotTargets: number[] = [];
let previouslyPocketed: boolean[] = [];
let cpuWait = 0;
let balls = rack();
function canControl() {
  return onlineMode ? online.active && turn === online.seat && online.remainingMs() > 0 : !versusComputer || turn === 0;
}
function playerName(seat: number) {
  return onlineMode ? seat === online.seat ? online.name : online.peerName : seat === 0 ? online.name : versusComputer ? 'Computer' : 'Player 2';
}
const colourNames = ['yellow', 'green', 'brown', 'blue', 'pink', 'black'];

function legalTargets() {
  const active = balls.flatMap((ball, index) => index && !ball.pocketed ? [index] : []);
  if (!snooker) return poolTargets(balls.map(ball => ball.pocketed), groups[turn]);
  const reds = active.filter(index => index <= 15);
  const colours = active.filter(index => index > 15);
  if (colourAfterRed) return colours;
  return reds.length ? reds : colours.slice(0, 1);
}

function showScore() {
  score.replaceChildren(...[0, 1].map(seat => {
    const item = document.createElement('span');
    item.className = 'player-score' + (turn === seat && !finished ? ' active' : '');
    if (turn === seat) item.setAttribute('aria-current', 'true');
    const marker = document.createElement('span');
    marker.className = 'group-marker ' + (snooker || !groups[seat] ? 'open' : groups[seat]!.toLowerCase());
    marker.setAttribute('aria-hidden', 'true');
    const left = balls.filter((ball, index) => !ball.pocketed && groupOf(index) === groups[seat]).length;
    const name = document.createElement('strong');
    name.className = 'player-name';
    name.textContent = playerName(seat);
    const detail = document.createElement('span');
    detail.className = 'player-group';
    detail.textContent = snooker ? 'Score · ' + scores[seat] : groups[seat] ? groups[seat] + ' · ' + left + ' left' : 'Open table';
    const tray = document.createElement('span');
    tray.className = 'potted-balls';
    if (!snooker && groups[seat]) {
      const numbers = balls.flatMap((ball, index) => groupOf(index) === groups[seat] ? [{number: index, potted: ball.pocketed}] : []);
      numbers.sort((a, b) => Number(a.potted) - Number(b.potted) || a.number - b.number);
      for (const ball of numbers) {
        const badge = document.createElement('span');
        badge.className = 'score-ball ' + (ball.potted ? 'achieved' : 'pending') + (ball.number > 8 ? ' stripe' : '');
        badge.style.setProperty('--ball-color', palette[(ball.number - 1) % 8]);
        if (ball.number > 8) {
          const number = document.createElement('span');
          number.className = 'ball-number';
          number.textContent = String(ball.number);
          badge.append(number);
        } else badge.textContent = String(ball.number);
        badge.title = 'Ball ' + ball.number + (ball.potted ? ' · pocketed' : ' · on table');
        badge.setAttribute('aria-label', badge.title);
        tray.append(badge);
      }
    } else {
      tray.classList.add('empty');
      tray.textContent = snooker ? 'Snooker' : 'Groups unassigned';
    }
    item.append(marker, name, detail, tray);
    return item;
  }));
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
  if (!snooker) {
    const eightPocket = balls[8].pocketed ? pockets.reduce((closest, pocket, index) =>
      Math.hypot(pocket.x - balls[8].x, pocket.z - balls[8].z) < Math.hypot(pockets[closest].x - balls[8].x, pockets[closest].z - balls[8].z) ? index : closest, 0) : undefined;
    const result = resolvePoolShot({ turn, groups, targets: shotTargets, firstContact, potted, scratch, breaking: shotWasBreak, calledPocket, eightPocket });
    groups = result.groups;
    winner = result.winner;
    finished = winner !== undefined;
    if (result.respotEight) respot(8);
    if (scratch) respot(0);
    if (!finished) turn = result.turn;
    placement = result.foul && !finished ? 'foul' : undefined;
    if (placement && canControl() && viewMode) viewToggle.click();
    breaking = false;
    calledPocket = undefined;
    cpuWait = 0.85;
    showScore();
    showReadyStatus();
    return;
  }
  const foul = scratch || (snooker && (
    firstContact === undefined || !shotTargets.includes(firstContact) ||
    potted.some(index => !shotTargets.includes(index)) || (colourAfterRed && potted.length > 1)
  ));
  const value = (index: number) => index <= 15 ? 1 : index - 14;
  if (snooker) {
    if (foul) scores[1 - turn] += Math.max(4, value(shotTargets[0] ?? 0), value(firstContact ?? 0), ...potted.map(value));
    if (colourAfterRed || shotTargets[0] <= 15 || foul) {
      for (const index of potted) if (index > 15) respot(index);
    }
    colourAfterRed = !foul && potted.some(index => index <= 15);
  }
  if (!foul || !snooker) scores[turn] += snooker ? potted.reduce((sum, index) => sum + value(index), 0) : potted.length;
  if (scratch) respot(0);
  finished = legalTargets().length === 0;
  if (!finished && (foul || !potted.length)) turn = 1 - turn;
  if (foul && !finished) {
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
let overhead = true;
let cameraTarget: number | undefined;
let accumulator = 0;
const fixedStep = 1 / 300;
const aimLine = MeshBuilder.CreateLines('aim guide', {
  points: [Vector3.Zero(), Vector3.Forward()], updatable: true,
}, scene);
aimLine.color = Color3.FromHexString('#f0e6ba');
aimLine.isPickable = false;
const objectGuide = MeshBuilder.CreateDashedLines('object ball path', { points: [Vector3.Zero(), Vector3.Forward()], dashNb: 36, updatable: true }, scene);
objectGuide.color = Color3.FromHexString('#83ded0');
objectGuide.isPickable = false;
const ghostBall = MeshBuilder.CreateTorus('predicted cue ball contact', {diameter: 2 * radius, thickness: 0.002, tessellation: 40}, scene);
ghostBall.material = material('contact guide', '#83ded0');
ghostBall.isPickable = false;
const pocketGuide = MeshBuilder.CreateTorus('lined up pocket', {diameter: 0.16, thickness: 0.004, tessellation: 48}, scene);
pocketGuide.material = ghostBall.material;
pocketGuide.isPickable = false;
const handRing = MeshBuilder.CreateTorus('ball in hand indicator', {diameter: radius * 3.4, thickness: 0.003, tessellation: 48}, scene);
handRing.material = pocketCallMaterial;
handRing.isPickable = false;
handRing.isVisible = false;
const cue = MeshBuilder.CreateCylinder('cue', { height: cueLength, diameterTop: 0.011, diameterBottom: 0.027, tessellation: 16 }, scene);
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
  if (!canControl() || !event.isPrimary || event.button !== 0 || rolling || strike || strokePointer !== undefined) return;
  tip.setPointerCapture(event.pointerId);
  selectTip(event);
};
tip.onpointermove = event => {
  if (!rolling && !strike && strokePointer === undefined && tip.hasPointerCapture(event.pointerId)) selectTip(event);
};
tip.onkeydown = event => {
  if (!canControl() || rolling || strike || strokePointer !== undefined) return;
  const offsets: Record<string, [number, number]> = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] };
  const offset = offsets[event.key];
  if (event.key === "Home") setTip(0, 0);
  else if (offset) setTip(tipX + offset[0], tipY + offset[1]);
  else return;
  event.preventDefault();
};
function fire(strength: number) {
  if (rolling || strike) return;
  if (onlineMode && (!online.active || online.remainingMs() <= 0)) return;
  if (!snooker && legalTargets().includes(8) && calledPocket === undefined) {
    status.textContent = 'Call a pocket for the black 8 before shooting.';
    return;
  }
  aimLocked = false;
  tableStroke = undefined;
  if (onlineMode && online.seat === 1) {
    online.send({ type: 'input', input: { action: 'shoot', strength, aim: [aim.x, aim.z], tip: [tipX, tipY], position: [balls[0].x, balls[0].z], calledPocket } });
    return;
  }
  shotWasBreak = breaking;
  placement = undefined;
  firstContact = undefined;
  shotTargets = legalTargets();
  previouslyPocketed = balls.map(ball => ball.pocketed);
  shotPower = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 0));
  strike = 0.19;
}
stroke.onpointerdown = event => {
  if (!event.isPrimary || event.button !== 0 || rolling || strike || !canControl() || finished) return;
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
let aimLocked = false;
let lastCueTap = 0;
let tableStroke: { x: number; y: number; dx: number; dy: number } | undefined;
let viewMode = false;
const viewToggle = document.querySelector<HTMLButtonElement>('#viewMode')!;
const lockButton = document.querySelector<HTMLButtonElement>('#lockAim')!;
const pocketChoice = document.querySelector<HTMLSelectElement>('#pocketChoice')!;
pocketChoice.onchange = () => {
  if (!canControl() || rolling || strike || !legalTargets().includes(8)) return;
  calledPocket = pocketChoice.value === '' ? undefined : Number(pocketChoice.value);
  showReadyStatus();
};
function toggleAimLock() {
  if (!canControl() || rolling || strike || finished || viewMode) return;
  aimLocked = !aimLocked;
  lastCueTap = 0;
  tableStroke = undefined;
  clearStroke();
  showReadyStatus();
}
lockButton.onclick = toggleAimLock;

function showReadyStatus() {
  if (finished) {
    status.textContent = !snooker && winner !== undefined ? playerName(winner) + ' wins! Re-rack to play again.' :
      scores[0] === scores[1] ? 'Match drawn.' : playerName(scores[0] > scores[1] ? 0 : 1) + ' wins!';
    return;
  }
  if (!canControl()) {
    status.textContent = onlineMode ? online.active ? playerName(turn) + ' is lining up a shot.' : 'Online game paused. Reconnect or leave through Profile.' : 'Computer is lining up a shot.';
    return;
  }
  if (aimLocked && !viewMode) {
    status.textContent = 'Aim locked · Drag back on the table and release to shoot. Double-tap the cue ball to unlock.';
    return;
  }
  if (!snooker && legalTargets().includes(8) && calledPocket === undefined) {
    status.textContent = 'Black 8 · Choose a pocket on the table or in the controls before shooting.';
    return;
  }
  if (placement && !viewMode) {
    status.textContent = placement === 'break' ? 'Drag the cue ball behind the head string. Aim on the cloth.' : 'Ball in hand. Drag the cue ball or aim on the cloth.';
    return;
  }
  status.textContent = viewMode ? 'Drag to orbit. Pinch or scroll to zoom.' : playerName(turn) + ' to shoot · Aim, then double-tap the cue ball to lock.';
}

viewToggle.onclick = () => {

  viewMode = !viewMode;
  viewToggle.querySelector<HTMLElement>('.hud-label')!.textContent = viewMode ? 'Orbit on' : 'Orbit';
  viewToggle.setAttribute('aria-pressed', String(viewMode));
  if (viewMode) {
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    camera.fov = zoomFov();
    camera.attachControl(canvas, true);
  } else {
    camera.detachControl();
    fitOverheadCamera();
  }
  if (!rolling && !strike) showReadyStatus();
};

function aimAtPointer(event: PointerEvent, starting = false) {
  if (aimLocked || viewMode || rolling || strike || !canControl() || finished || strokePointer !== undefined) return;
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
  if (viewMode || !canControl() || finished || strokePointer !== undefined || !event.isPrimary || event.button !== 0 || rolling || strike) return;
  const bounds = canvas.getBoundingClientRect();
  if (!snooker && legalTargets().includes(8)) {
    const selected = scene.pick(event.clientX - bounds.left, event.clientY - bounds.top, mesh => pocketSelectors.some(selector => selector === mesh));
    if (selected?.pickedMesh) {
      calledPocket = pocketSelectors.findIndex(selector => selector === selected.pickedMesh);
      showReadyStatus();
      return;
    }
  }
  const hit = scene.pick(event.clientX - bounds.left, event.clientY - bounds.top, mesh => mesh === bed)?.pickedPoint;
  const cueTap = hit && Math.hypot(hit.x - balls[0].x, hit.z - balls[0].z) < 2.5 * radius;
  if (cueTap && event.timeStamp - lastCueTap < 350 && lastCueTap > 0) {
    toggleAimLock();
    return;
  }
  lastCueTap = cueTap ? event.timeStamp : 0;
  aimPointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  movingCueBall = false;
  if (aimLocked) {
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const origin = new Vector3(balls[0].x, radius, balls[0].z);
    const from = Vector3.Project(origin, Matrix.Identity(), scene.getTransformMatrix(), viewport);
    const to = Vector3.Project(origin.add(aim), Matrix.Identity(), scene.getTransformMatrix(), viewport);
    const dx = (to.x - from.x) * bounds.width / engine.getRenderWidth();
    const dy = (to.y - from.y) * bounds.height / engine.getRenderHeight();
    const magnitude = Math.max(1, Math.hypot(dx, dy));
    tableStroke = { x: event.clientX, y: event.clientY, dx: dx / magnitude, dy: dy / magnitude };
    return;
  }
  aimAtPointer(event, true);
});
function updateTablePull(event: PointerEvent) {
  if (!tableStroke) return;
  pull = Math.max(0, Math.min(1, -((event.clientX - tableStroke.x) * tableStroke.dx + (event.clientY - tableStroke.y) * tableStroke.dy) / 110));
  showPull();
}
canvas.addEventListener('pointermove', event => {
  if (aimPointer !== event.pointerId) return;
  if (tableStroke) updateTablePull(event);
  else aimAtPointer(event);
});
canvas.addEventListener('pointerup', event => {
  if (aimPointer !== event.pointerId) return;
  aimPointer = undefined;
  if (tableStroke) {
    updateTablePull(event);
    const strength = pull;
    tableStroke = undefined;
    clearStroke();
    if (strength >= 0.08) fire(strength);
    return;
  }
  aimAtPointer(event);
  movingCueBall = false;
});
canvas.addEventListener('lostpointercapture', event => {
  if (aimPointer !== event.pointerId) return;
  aimPointer = undefined;
  movingCueBall = false;
  tableStroke = undefined;
  clearStroke();
});

document.querySelector<HTMLButtonElement>('#camera')!.onclick = event => {
  overhead = !overhead;
  cameraTarget = overhead ? 0.025 : 0.83;
  if (overhead) fitOverheadCamera();
  else {
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    camera.fov = zoomFov();
  }
  const button = event.currentTarget as HTMLButtonElement;
  button.querySelector<HTMLElement>('.hud-label')!.textContent = overhead ? '3D view' : 'Top view';
  button.setAttribute('aria-label', overhead ? 'Switch to perspective view' : 'Switch to top-down view');
};
function resetMatch() {
  balls = rack(snooker);
  turn = 0;
  scores = [0, 0];
  groups = [null, null];
  winner = undefined;
  breaking = true;
  calledPocket = undefined;
  shotWasBreak = false;
  firstContact = undefined;
  shotTargets = [];
  previouslyPocketed = [];
  shotPower = 0;
  aimLocked = false;
  lastCueTap = 0;
  tableStroke = undefined;
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
function needsRerackConfirmation() {
  return !finished && (!breaking || rolling || strike > 0);
}
const rerackDialog = document.querySelector<HTMLDialogElement>('#rerackConfirm')!;
document.querySelector<HTMLButtonElement>('#reset')!.onclick = () => {
  if (onlineMode && (online.seat !== 0 || !online.active)) return;
  if (needsRerackConfirmation()) {
    rerackDialog.returnValue = '';
    rerackDialog.showModal();
  } else resetMatch();
};
rerackDialog.addEventListener('close', () => {
  if (rerackDialog.returnValue !== 'rerack') return;
  rerackDialog.returnValue = '';
  if (!onlineMode || online.seat === 0 && online.active) resetMatch();
});
document.querySelector<HTMLButtonElement>('#noticeRematch')!.onclick = () => {
  if (!onlineMode || online.active && online.seat === 0) resetMatch();
};
document.querySelector<HTMLButtonElement>('#openSettings')!.onclick = () => {
  select('game').value = snooker ? 'snooker' : 'pool';
  select('opponent').value = versusComputer ? 'computer' : 'solo';
  settings.showModal();
};
settings.addEventListener('close', () => {
  if (settings.returnValue !== 'start') return;
  settings.returnValue = '';
  if (onlineMode) { online.leave(); onlineMode = false; }
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
function gameState(): SavedGame {
  return { version: 1, balls, snooker, versusComputer, onlineMode, turn, scores, groups, winner, breaking, shotWasBreak,
    colourAfterRed, finished, firstContact, shotTargets, previouslyPocketed, rolling, placement, aim: [aim.x, aim.z],
    strike, shotPower, tip: [tipX, tipY], aimLocked, calledPocket };
}
function applyGame(s: SavedGame, preserveLocalAim = false) {
  balls = structuredClone(s.balls);
  snooker = s.snooker;
  versusComputer = s.versusComputer;
  turn = s.turn;
  scores = [...s.scores];
  groups = [...s.groups];
  winner = s.winner;
  breaking = s.breaking;
  shotWasBreak = s.shotWasBreak;
  colourAfterRed = s.colourAfterRed;
  finished = s.finished;
  firstContact = s.firstContact;
  shotTargets = [...s.shotTargets];
  previouslyPocketed = [...s.previouslyPocketed];
  rolling = s.rolling;
  placement = s.placement;
  strike = s.strike;
  shotPower = s.shotPower;
  if (!preserveLocalAim) {
    aim.set(s.aim[0], 0, s.aim[1]).normalize();
    setTip(...s.tip);
    aimLocked = s.aimLocked;
    calledPocket = s.calledPocket;
  }
  if (rolling || strike) aimLocked = false;
  accumulator = 0;
  ballMeshes.forEach((mesh, i) => {
    mesh.isVisible = Boolean(balls[i]) && !balls[i].pocketed;
    contacts[i].isVisible = Boolean(balls[i]) && !balls[i].pocketed;
    if (!balls[i]) return;
    mesh.material = snooker && i > 0 ? i <= 15 ? redFinish : colourFinishes[i - 16] : poolFinishes[i];
    mesh.position.set(balls[i].x, balls[i].pocketed ? -0.12 : radius, balls[i].z);
  });
  showScore();
  if (!rolling && !strike) showReadyStatus();
  else status.textContent = 'Balls in motion';
}
function saveGame() {
  try { localStorage.setItem('billiard-game-v1', JSON.stringify(gameState())); } catch {}
}
online.onPaired = resume => {
  setMobileMenu(false);
  onlineMode = true;
  versusComputer = false;
  snooker = false;
  if (validGame(resume)) applyGame(resume);
  else resetMatch();
};
online.onProfile = showScore;
online.onTimeout = expiredTurn => {
  if (!onlineMode || online.seat !== 0 || !online.active || turn !== expiredTurn || rolling || strike || finished) return;
  turn = 1 - turn;
  calledPocket = undefined;
  aimLocked = false;
  tableStroke = undefined;
  clearStroke();
  placement = 'foul';
  showScore();
  showReadyStatus();
  online.send({ type: 'state', state: gameState() });
  saveGame();
};
online.onState = value => {
  if (!onlineMode || online.seat !== 1 || !validGame(value)) return;
  const keepAim = canControl() && !value.rolling && !value.strike && turn === value.turn;
  applyGame(value, keepAim);
};
online.onInput = value => {
  if (!onlineMode || online.seat !== 0 || turn !== 1 || rolling || strike || finished || !value || typeof value !== 'object') return;
  const input = value as { action?: string; strength?: number; aim?: number[]; tip?: number[]; position?: number[]; calledPocket?: number };
  const pair = (v: unknown): v is number[] => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n));
  if (!pair(input.aim) || !pair(input.tip) || !pair(input.position)) return;
  const direction = new Vector3(input.aim[0], 0, input.aim[1]);
  if (direction.lengthSquared() < 0.5 || direction.lengthSquared() > 1.5) return;
  aim = direction.normalize();
  setTip(input.tip[0], input.tip[1]);
  if (!snooker && legalTargets().includes(8)) {
    calledPocket = Number.isInteger(input.calledPocket) && input.calledPocket! >= 0 && input.calledPocket! < 6 ? input.calledPocket : undefined;
  }
  if (placement) {
    const [x, z] = input.position;
    const legal = Math.abs(x) <= width / 2 - radius && Math.abs(z) <= length / 2 - radius &&
      (placement !== 'break' || z <= -length / 4) &&
      !pockets.some(p => Math.hypot(p.x - x, p.z - z) < 0.085) &&
      !balls.slice(1).some(b => !b.pocketed && Math.hypot(b.x - x, b.z - z) < 2 * radius + 0.001);
    if (legal) Object.assign(balls[0], { x, z });
  }
  if (input.action === 'shoot' && typeof input.strength === 'number' && Number.isFinite(input.strength) && input.strength >= 0.08 && input.strength <= 1) fire(input.strength);
};
online.onEnded = () => {
  if (!onlineMode) return;
  clearStroke();
  tableStroke = undefined;
  aimPointer = undefined;
  if (online.seat === undefined) { onlineMode = false; resetMatch(); }
  else showReadyStatus();
};
try {
  const saved: unknown = JSON.parse(localStorage.getItem('billiard-game-v1') ?? 'null');
  if (validGame(saved)) {
    onlineMode = saved.onlineMode;
    applyGame(saved);
    if (onlineMode) online.open();
  }
} catch {}
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
showScore();
showReadyStatus();

function fitOverheadCamera() {
  if (!overhead || viewMode) return;
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const header = document.querySelector('header')!.getBoundingClientRect();
  document.documentElement.style.setProperty('--notice-top', header.bottom + 8 + 'px');
  const footer = document.querySelector('footer')!.getBoundingClientRect();
  // Phones keep the long axis vertical, including when held sideways.
  const mobile = window.matchMedia('(max-width: 600px), (pointer: coarse) and (max-height: 600px)').matches;
  const landscape = !mobile && bounds.width > bounds.height;
  const top = header.bottom - bounds.top + 6;
  const bottom = footer.top - bounds.top - 6;
  const availableHeight = Math.max(1, bottom - top);
  const availableWidth = Math.max(1, bounds.width - 16);
  const tableWidth = (landscape ? length : width) + 0.27;
  const tableHeight = (landscape ? width : length) + 0.27;
  const unitsPerPixel = Math.max(tableWidth / availableWidth, tableHeight / availableHeight) / cameraZoom;
  const centerY = (top + bottom) / 2;
  // Orthographic framing fills the usable area without perspective shrinkage.
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.alpha = landscape ? 0 : -Math.PI / 2;
  camera.beta = 0.025;
  camera.radius = 2.5;
  cameraTarget = undefined;
  camera.orthoLeft = -bounds.width * unitsPerPixel / 2;
  camera.orthoRight = bounds.width * unitsPerPixel / 2;
  camera.orthoTop = centerY * unitsPerPixel;
  camera.orthoBottom = -(bounds.height - centerY) * unitsPerPixel;
}

function resize() {
  const scales: Record<string, number> = { Low: 0.65, Medium: 0.85, High: 1, Ultra: 1.5 };
  shadows.getShadowMap()!.renderList = scene.meshes.filter(mesh => mesh.name.startsWith("ball ") || ["cabinet", "leg", "side rail", "end rail"].includes(mesh.name));
  scene.shadowsEnabled = quality.value !== "Low";
  const shadowSize = quality.value === "Ultra" ? 2048 : quality.value === "High" ? 1024 : 512;
  shadows.mapSize = shadowSize;
  engine.setHardwareScalingLevel(1 / Math.min(scales[quality.value], window.devicePixelRatio || 1));
  engine.resize();
  fitOverheadCamera();
}
quality.onchange = resize;
new ResizeObserver(resize).observe(canvas);
const controlsObserver = new ResizeObserver(fitOverheadCamera);
controlsObserver.observe(document.querySelector('header')!);
controlsObserver.observe(document.querySelector('footer')!);
resize();

let networkElapsed = 0, saveElapsed = 0;
let noticeKey = '';
const notice = document.querySelector<HTMLElement>('#gameNotice')!;
const confetti = document.querySelector<HTMLElement>('#victoryConfetti')!;
let celebratedWin = false;
let confettiCleanup: number | undefined;
function celebrateWin() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  confetti.replaceChildren();
  window.clearTimeout(confettiCleanup);
  const colors = ['#eac16a', '#fff0b7', '#61baa0', '#e29872', '#f5e8ce'];
  const pieces = document.createDocumentFragment();
  for (let i = 0; i < 54; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = (i / 54 * 100) + '%';
    piece.style.setProperty('--confetti-color', colors[i % colors.length]);
    piece.style.setProperty('--fall-time', (2.7 + Math.random() * 1.1) + 's');
    piece.style.setProperty('--fall-delay', (Math.random() * 0.65) + 's');
    piece.style.setProperty('--drift', (Math.random() * 140 - 70) + 'px');
    piece.style.setProperty('--spin', (Math.random() * 900 - 450) + 'deg');
    pieces.append(piece);
  }
  confetti.append(pieces);
  confettiCleanup = window.setTimeout(() => confetti.replaceChildren(), 4600);
}
function updateGameNotice() {
  const kind = finished ? 'win' : placement && !rolling && !strike ? 'hand' : '';
  const winningPlayer = winner ?? (scores[0] === scores[1] ? undefined : scores[0] > scores[1] ? 0 : 1);
  const key = [kind, turn, winningPlayer, online.active, online.seat, playerName(0), playerName(1), placement].join(':');
  if (key === noticeKey) return;
  noticeKey = key;
  notice.hidden = !kind;
  notice.dataset.kind = kind;
  notice.dataset.outcome = winningPlayer === undefined ? 'draw' : 'winner';
  if (kind === 'win' && winningPlayer !== undefined && !celebratedWin) {
    celebratedWin = true;
    celebrateWin();
  } else if (kind !== 'win') {
    celebratedWin = false;
    window.clearTimeout(confettiCleanup);
    confetti.replaceChildren();
  }
  const rematch = document.querySelector<HTMLButtonElement>('#noticeRematch')!;
  rematch.hidden = kind !== 'win' || onlineMode && online.seat !== 0;
  rematch.disabled = onlineMode && !online.active;
  document.querySelector<HTMLElement>('#noticeLabel')!.textContent = kind === 'win' ? winningPlayer === undefined ? 'HONOURS EVEN' : 'VICTORY' : placement === 'break' ? 'BREAK SETUP' : 'BALL IN HAND';
  document.querySelector<HTMLElement>('#noticeTitle')!.textContent = kind === 'win' ? winningPlayer === undefined ? 'Match drawn' : playerName(winningPlayer) + ' wins!' : playerName(turn) + ' · Ball in hand';
  document.querySelector<HTMLElement>('#noticeDetail')!.textContent = kind === 'win' ? onlineMode && online.seat !== 0 ? 'What a game! Waiting for the host to start the next round.' : winningPlayer === undefined ? 'A close match. Time for a rematch?' : 'What a finish. Ready for another round?' : canControl() ? placement === 'break' ? 'Drag the highlighted cue ball behind the head string.' : 'Drag the highlighted cue ball to place it.' : 'Your opponent is placing the cue ball.';
}
engine.runRenderLoop(() => {
  updateGameNotice();
  handRing.isVisible = Boolean(placement) && !finished && !rolling && !strike;
  handRing.position.set(balls[0].x, 0.004, balls[0].z);
  const clock = document.querySelector<HTMLElement>('#shotClock')!;
  clock.hidden = !onlineMode;
  clock.textContent = finished ? 'Finished' : !online.active ? 'Paused' : rolling || strike ? 'In motion' : Math.ceil(online.remainingMs() / 1000) + 's';
  clock.classList.toggle('urgent', online.active && !rolling && !strike && online.remainingMs() <= 10000);
  const callEligible = !snooker && !finished && !rolling && !strike && legalTargets().includes(8);
  document.querySelector<HTMLElement>('#callPocket')!.hidden = !callEligible || !canControl();
  pocketChoice.value = calledPocket === undefined ? '' : String(calledPocket);
  pocketSelectors.forEach((mesh, index) => {
    mesh.setEnabled(callEligible && canControl() && !viewMode);
    pocketCallRings[index].isVisible = callEligible;
    pocketCallRings[index].scaling.setAll(index === calledPocket ? 1.12 : 1);
    pocketCallRings[index].visibility = index === calledPocket ? 1 : 0.35;
  });
  stroke.disabled = rolling || strike > 0 || !canControl() || finished;
  tip.disabled = stroke.disabled;
  lockButton.disabled = stroke.disabled || viewMode;
  lockButton.querySelector<HTMLElement>('.hud-label')!.textContent = aimLocked ? 'Locked' : 'Aim lock';
  lockButton.setAttribute('aria-label', aimLocked ? 'Unlock aim' : 'Lock aim');
  lockButton.setAttribute('aria-pressed', String(aimLocked));
  document.querySelector<HTMLButtonElement>('#reset')!.disabled = onlineMode && (online.seat !== 0 || !online.active);
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  const authoritative = !onlineMode || online.active && online.seat === 0;
  const cueBall = balls[0];
  if (versusComputer && !onlineMode && turn === 1 && !finished && !rolling && !strike && !settings.open) {
    cpuWait -= dt;
    if (cpuWait <= 0) {
      const shot = chooseShot(balls, legalTargets(), select("difficulty").value);
      if (shot) {
        if (!snooker && legalTargets().includes(8)) {
          calledPocket = shot.pocket ?? pockets.reduce((best, p, index) => Math.hypot(p.x - balls[8].x, p.z - balls[8].z) < Math.hypot(pockets[best].x - balls[8].x, pockets[best].z - balls[8].z) ? index : best, 0);
        }
        aim.set(Math.sin(shot.angle), 0, Math.cos(shot.angle));
        setTip(0, 0);
        fire(shot.power);
      }
    }
  }
  if (strike && authoritative) {
    strike = Math.max(0, strike - dt);
    if (!strike) {
      const speed = shotSpeed(shotPower);
      strikeBall(cueBall, aim.x, aim.z, speed, tipX, tipY);
      rolling = true;
      status.textContent = 'Balls in motion';
    }
  }
  if (rolling && authoritative) {
    accumulator += dt;
    while (accumulator >= fixedStep) {
      const contact = step(balls, fixedStep, sound.queue);
      firstContact ??= contact;
      accumulator -= fixedStep;
    }
    if (!balls.some(isMoving)) {
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
  aimLine.isVisible = guidesEnabled && !rolling && !strike && !movingCueBall && !finished;
  cue.isVisible = !rolling && !movingCueBall && !finished;
  objectGuide.isVisible = ghostBall.isVisible = pocketGuide.isVisible = false;
  if (!rolling) {
    const origin = new Vector3(cueBall.x, radius, cueBall.z);
    const pose = cuePose(balls, aim.x, aim.z, tipX, tipY, strike * shotPower * 0.9 + pull * 0.16);
    cue.position.set(pose.center.x, pose.center.y, pose.center.z);
    const direction = new Vector3(pose.direction.x, pose.direction.y, pose.direction.z);
    const rotationAxis = Vector3.Cross(Vector3.Up(), direction).normalize();
    cue.rotationQuaternion = Quaternion.RotationAxis(rotationAxis, Math.acos(direction.y));
    const guide = traceShot(balls, aim.x, aim.z);
    MeshBuilder.CreateLines('aim guide', { points: [origin.add(aim.scale(radius)), new Vector3(guide.impact.x, radius, guide.impact.z)], instance: aimLine });
    if (aimLine.isVisible && guide.objectStart && guide.objectEnd) {
      objectGuide.isVisible = ghostBall.isVisible = true;
      ghostBall.position.set(guide.impact.x, 0.004, guide.impact.z);
      MeshBuilder.CreateDashedLines('object ball path', {points: [new Vector3(guide.objectStart.x, radius, guide.objectStart.z), new Vector3(guide.objectEnd.x, radius, guide.objectEnd.z)], instance: objectGuide});
      if (guide.pocket) {
        pocketGuide.isVisible = true;
        pocketGuide.position.set(guide.pocket.x, 0.035, guide.pocket.z);
      }
    }
  }
  if (cameraTarget !== undefined) {
    camera.beta += (cameraTarget - camera.beta) * Math.min(dt * 7, 1);
    if (Math.abs(cameraTarget - camera.beta) < 0.003) cameraTarget = undefined;
  }
  sound.flush();
  updateSession(dt);
  scene.render();
});

function updateSession(dt: number) {
  networkElapsed += dt;
  saveElapsed += dt;
  if (networkElapsed >= 0.05) {
    networkElapsed = 0;
    if (onlineMode && online.active) {
      if (online.seat === 0) online.send({ type: 'state', state: gameState() });
      else if (canControl() && !rolling && !strike) online.send({ type: 'input', input: { action: 'aim', aim: [aim.x, aim.z], tip: [tipX, tipY], position: [balls[0].x, balls[0].z], calledPocket } });
    }
  }
  if (saveElapsed >= 0.5) { saveElapsed = 0; saveGame(); }
}



















