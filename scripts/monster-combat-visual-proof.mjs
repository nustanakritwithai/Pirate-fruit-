import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// ใช้ renderer จริงใน Chromium; scene ควบคุมได้รับ snapshot เดียวกันยกเว้นเหตุการณ์ตี
const output = 'combat-visual-proof';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  await page.route('**/__combat_proof', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' }));
  await page.goto('http://127.0.0.1:5173/__combat_proof');
  await page.evaluate(async () => {
    const { PocketOwnedMonsterRenderer } = await import('/src/monster/PocketOwnedMonsterRenderer.ts');
    const { SharedMonsterClient } = await import('/src/monster/SharedMonsterClient.ts');
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const scenes = [new THREE.Scene(), new THREE.Scene()];
    const render = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    render.setSize(960, 640); document.body.appendChild(render.domElement);
    const camera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 100);
    camera.position.set(5, 5, 9); camera.lookAt(0, 1, 0);
    for (const scene of scenes) {
      scene.background = new THREE.Color(0x233044);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x505050, 3));
      const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(3, 6, 3); scene.add(light);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x496952 }));
      floor.rotation.x = -Math.PI / 2; scene.add(floor);
    }
    let time = 0;
    const owned = scenes.map(scene => new PocketOwnedMonsterRenderer(scene, THREE));
    const enemies = scenes.map(scene => new SharedMonsterClient(scene, 'starter-island', () => 0, () => time));
    const authority = () => ({ authorityVersion: 'monster-authority/1', serverTimeUtc: '2026-09-20T00:00:00Z', generation: 3,
      hp: { current: 80, max: 100, revision: 1 }, resultRevision: 0, actionSequence: 0, hit: false, damage: 0, death: false });
    const base = { kind: 'monster', generation: 3, spawnSequence: 1, stateSequence: 1, lifecycle: 'active', locomotion: 'idle' };
    const idle = { combatState: 'idle', category: 'utility', onGround: true, dashing: false, verticalVelocity: 0 };
    const pet = { ...base, actorId: 'owned:proof', ownerId: 'proof-owner', monsterType: 'monster.slime.flameling.bighead.v1', zone: 'pirate-fruit',
      pose: { x: -1.5, y: 0, z: 0, dir: Math.PI / 2 }, animation: idle, authority: authority() };
    const foe = { ...base, actorId: 'monster:proof-crab', monsterType: 'crab', zone: 'starter-island',
      pose: { x: 1.5, y: 0, z: 0, dir: -Math.PI / 2 }, animation: idle, authority: authority() };
    const matrices = (scene, name) => {
      scene.updateMatrixWorld(true);
      const values = []; scene.getObjectByName(name)?.traverse(node => { if (node.isMesh) values.push(...node.matrixWorld.elements); });
      return values;
    };
    const difference = name => {
      const a = matrices(scenes[0], name), b = matrices(scenes[1], name);
      if (!a.length || a.length !== b.length) throw new Error('Missing or mismatched rendered monster: ' + name);
      return Math.max(...a.map((value, index) => Math.abs(value - b[index])));
    };
    function feed(frame, attack = false, skill = false) {
      for (let i = 0; i < 2; i++) {
        const active = i === 0 && attack;
        owned[i].setActors([{ ...pet, stateSequence: frame + 1, authority: { ...pet.authority, actionSequence: active ? (skill ? 2 : 1) : 0 }, animation: active
          ? { ...idle, combatState: skill ? 'casting' : 'attack1', actionSessionId: 'owned-action-3', actionSequence: skill ? 2 : 1, actionDurationMs: 450 } : idle }]);
        const auth = authority();
        if (active) Object.assign(auth, { resultRevision: 1, actionSequence: 1, hit: true, damage: 5,
          attack: { attackId: 'owned-hit-proof-3-1', spawnId: foe.actorId, monsterId: 'crab', islandId: 'pirate-fruit', targetId: pet.actorId, action: 'melee', damage: 5, hitDelayMs: 0 } });
        enemies[i].applyActors('starter-island', [{ ...foe, stateSequence: frame + 1, authority: auth }], 'proof');
      }
    }
    function step() { time += 1000 / 60; for (let i = 0; i < 2; i++) { owned[i].update(1 / 60); enemies[i].update(1 / 60); } render.render(scenes[0], camera); }
    feed(0); step();
    window.proof = { feed, step, difference, render: () => render.render(scenes[0], camera) };
  });
  await page.screenshot({ path: `${output}/before.png` });
  const samples = [];
  for (let frame = 1; frame <= 42; frame++) {
    const sample = await page.evaluate(frame => {
      if (frame % 3 === 1) window.proof.feed(frame, frame < 28);
      window.proof.step();
      return { frame, owned: window.proof.difference('owned:proof'), enemy: window.proof.difference('central-monster:proof:monster:proof-crab') };
    }, frame);
    samples.push(sample);
    if ([5, 10, 18, 42].includes(frame)) await page.screenshot({ path: `${output}/frame-${frame}.png` });
  }
  let skillMotion = 0;
  for (let frame = 43; frame < 65; frame++) {
    const amount = await page.evaluate(frame => {
      if (frame % 3 === 1) window.proof.feed(frame, true, true);
      window.proof.step(); return window.proof.difference('owned:proof');
    }, frame);
    skillMotion = Math.max(skillMotion, amount);
  }
  const result = { ownedMotion: Math.max(...samples.map(s => s.owned)), enemyMotion: Math.max(...samples.map(s => s.enemy)), skillMotion, samples };
  await fs.writeFile(`${output}/result.json`, JSON.stringify(result, null, 2));
  assert.ok(result.ownedMotion > 0.15, 'owned attack must visibly move geometry beyond idle');
  assert.ok(result.enemyMotion > 0.03, 'enemy retaliation must visibly move geometry beyond idle');
  assert.ok(skillMotion > 0.15, 'owned skill must visibly move geometry beyond idle');
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
