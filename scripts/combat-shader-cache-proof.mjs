import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// ใช้VFXจริงในฉากควบคุม ไม่มีlogin/intent/HP; เปรียบเทียบการlinkprogramไม่ใช่FPSมือถือ
const output = 'combat-shader-cache-proof';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  page.on('console', message => { if (message.type() === 'error') errors.push('console-error'); });
  await page.route('**/__shader_cache_proof', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' }));
  await page.goto('http://127.0.0.1:5173/__shader_cache_proof');
  const result = await page.evaluate(async () => {
    const { Effects } = await import('/src/effects/Effects.ts');
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const fixtures = [];
    for (const warm of [false, true]) {
      const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
      renderer.setSize(320, 180);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      if (renderer.debug.checkShaderErrors !== true) throw new Error('shader-errors-must-remain-enabled');
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x182334);
      scene.fog = new THREE.FogExp2(0x182334, 0.01);
      const camera = new THREE.PerspectiveCamera(50, 320 / 180, 0.1, 100);
      camera.position.set(0, 3, 7); camera.lookAt(0, 1, 0);
      const effects = new Effects(scene);
      const gl = renderer.getContext();
      let links = 0, programLogs = 0;
      const linkProgram = gl.linkProgram.bind(gl);
      gl.linkProgram = program => { links++; return linkProgram(program); };
      const getProgramInfoLog = gl.getProgramInfoLog.bind(gl);
      gl.getProgramInfoLog = program => { programLogs++; return getProgramInfoLog(program); };
      if (warm) await effects.prepareCombatShaders(renderer, camera);
      if (scene.children.length !== 0) throw new Error('warmup-must-not-spawn-visible-effect');
      const preparationLinks = links;
      const preparationProgramLogs = programLogs;
      const samples = [];
      for (let cycle = 0; cycle < 5; cycle++) {
        const before = links;
        effects.spawnSlash(new THREE.Vector3(), 0);
        effects.spawnDamageNumber(new THREE.Vector3(), 12);
        const start = performance.now();
        renderer.render(scene, camera);
        samples.push({ cycle, links: links - before, renderMs: performance.now() - start });
        if (cycle === 0) {
          const image = new Image(); image.src = renderer.domElement.toDataURL();
          document.body.appendChild(image);
        }
        effects.update(2);
        if (scene.children.length !== 0) throw new Error('expired-effects-not-removed');
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      fixtures.push({ warm, preparationLinks, effectLinks: links - preparationLinks, samples,
        preparationProgramLogs, effectProgramLogs: programLogs - preparationProgramLogs,
        retainedPrograms: renderer.info.programs.length, checkShaderErrors: renderer.debug.checkShaderErrors });
      effects.dispose(); renderer.dispose();
    }
    return { scope: 'controlled-real-vfx-program-cache-not-authenticated-combat-or-mobile', fixtures };
  });
  await page.screenshot({ path: `${output}/cold-and-warm.png` });
  await fs.writeFile(`${output}/result.json`, JSON.stringify({ ...result, errors }, null, 2));
  assert.deepEqual(errors, [], 'ไม่กลบshaderหรือpage errors');
  assert.ok(result.fixtures[0].effectLinks >= 10, 'baselineต้องเห็นprogramถูกlinkใหม่หลังแต่ละeffectหมดอายุ');
  assert.equal(result.fixtures[1].effectLinks, 0, 'warmcacheต้องไม่linkprogramใหม่ในVFXพื้นฐาน5รอบ');
  assert.ok(result.fixtures[0].effectProgramLogs >= 10, 'baselineมีfirst-useGPUqueryหลังแต่ละVFXหมดอายุ');
  assert.ok(result.fixtures[1].preparationProgramLogs >= 2, 'shadererrorchecksยังทำจริงระหว่างloading');
  assert.equal(result.fixtures[1].effectProgramLogs, 0, 'warmcacheต้องไม่เหลือfirst-useGPUqueryใน5รอบต่อสู้');
  assert.ok(result.fixtures[1].preparationLinks > 0 && result.fixtures[1].retainedPrograms >= 2);
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
