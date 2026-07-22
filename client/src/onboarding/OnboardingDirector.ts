import * as THREE from 'three';
import type { Updatable } from '../engine/Game';
import type { GameStorage } from '../persistence/GameStorage';
import { GUIDE_TOPICS, ONBOARDING_STEPS, ONBOARDING_STORAGE_KEY } from './TutorialRegistry';
import { parseOnboardingSave, stepIsComplete, type StepEntry } from './OnboardingProgress';
import type { OnboardingSave, OnboardingSignal, OnboardingSnapshot } from './types';

export interface OnboardingDirectorOptions {
  scene: THREE.Scene;
  storage: GameStorage;
  snapshot: () => OnboardingSnapshot;
  heightAt: (x: number, z: number) => number;
  autoStart: boolean;
}

/**
 * Presentation-only guided adventure. It observes existing gameplay state and events;
 * it never mutates combat, quest, economy, monster or boat authority.
 */
export class OnboardingDirector implements Updatable {
  private readonly root: HTMLDivElement;
  private readonly guide: HTMLDivElement;
  private readonly helpButton: HTMLButtonElement;
  private readonly beacon: THREE.Mesh;
  private readonly signalCounts = new Map<OnboardingSignal, number>();
  private save: OnboardingSave;
  private active = false;
  private entry: StepEntry | null = null;
  private elapsedOnStep = 0;
  private updateAccumulator = 0;
  private highlighted: HTMLElement | null = null;

  constructor(private readonly options: OnboardingDirectorOptions) {
    this.injectStyles();
    const restored = parseOnboardingSave(
      options.storage.getItem(ONBOARDING_STORAGE_KEY),
      ONBOARDING_STEPS.length,
    );
    this.save = restored ?? { version: 1, stepIndex: 0, completed: false, skipped: false };
    this.active = Boolean(restored && !restored.completed && !restored.skipped)
      || (!restored && options.autoStart);

    this.root = document.createElement('div');
    this.root.className = 'onboarding-root';
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = `
      <section class="onboarding-card" role="status" aria-label="คำแนะนำผู้เล่นใหม่">
        <div class="onboarding-top">
          <span class="onboarding-kicker"></span>
          <button class="onboarding-guide-open" type="button" aria-label="เปิดคู่มือเกม">คู่มือ</button>
        </div>
        <h2 class="onboarding-title"></h2>
        <p class="onboarding-body"></p>
        <div class="onboarding-waypoint" hidden>
          <span class="onboarding-arrow">➤</span>
          <span class="onboarding-waypoint-text"></span>
        </div>
        <p class="onboarding-hint"></p>
        <div class="onboarding-actions">
          <button class="onboarding-prev" type="button">ย้อน</button>
          <button class="onboarding-pause" type="button">พักไว้</button>
          <button class="onboarding-next" type="button">ทำต่อ</button>
        </div>
      </section>`;
    document.body.appendChild(this.root);

    this.helpButton = document.createElement('button');
    this.helpButton.type = 'button';
    this.helpButton.className = 'onboarding-help-button';
    this.helpButton.textContent = '❔ คู่มือ';
    this.helpButton.setAttribute('aria-label', 'เปิดคู่มือนักผจญภัย');
    document.body.appendChild(this.helpButton);

    this.guide = document.createElement('div');
    this.guide.className = 'onboarding-guide-root';
    this.guide.innerHTML = this.guideMarkup();
    document.body.appendChild(this.guide);

    this.root.querySelector<HTMLButtonElement>('.onboarding-guide-open')!
      .addEventListener('click', () => this.openGuide(true));
    this.root.querySelector<HTMLButtonElement>('.onboarding-prev')!
      .addEventListener('click', () => this.previous());
    this.root.querySelector<HTMLButtonElement>('.onboarding-pause')!
      .addEventListener('click', () => this.pause());
    this.root.querySelector<HTMLButtonElement>('.onboarding-next')!
      .addEventListener('click', () => this.manualAdvance());
    this.helpButton.addEventListener('click', () => this.openGuide(true));
    this.guide.querySelector<HTMLButtonElement>('.onboarding-guide-close')!
      .addEventListener('click', () => this.closeGuide());
    this.guide.querySelector<HTMLButtonElement>('[data-guide-action="resume"]')!
      .addEventListener('click', () => { this.resume(); this.closeGuide(); });
    this.guide.querySelector<HTMLButtonElement>('[data-guide-action="restart"]')!
      .addEventListener('click', () => { this.restart(); this.closeGuide(); });
    this.guide.querySelector<HTMLButtonElement>('[data-guide-action="disable"]')!
      .addEventListener('click', () => { this.disableAutomatic(); this.closeGuide(); });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.guide.style.display !== 'none') this.closeGuide();
      if (event.code === 'KeyH' && !event.repeat && !this.isTypingTarget(event.target)) this.openGuide(false);
      if (event.code === 'Enter' && this.active
        && ONBOARDING_STEPS[this.save.stepIndex]?.completion.type === 'manual') {
        this.manualAdvance();
      }
    });

    const material = new THREE.MeshBasicMaterial({
      color: 0xffdd72,
      transparent: true,
      opacity: 0.78,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.beacon = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.22, 28), material);
    this.beacon.rotation.x = -Math.PI / 2;
    this.beacon.renderOrder = 999;
    this.beacon.visible = false;
    options.scene.add(this.beacon);

    if (this.active) this.enterCurrentStep();
    this.render();
  }

  signal(signal: OnboardingSignal): void {
    this.signalCounts.set(signal, (this.signalCounts.get(signal) ?? 0) + 1);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.elapsedOnStep += dt;
    this.updateAccumulator += dt;
    this.updateBeacon(dt);
    if (this.updateAccumulator < 0.1) return;
    this.updateAccumulator = 0;

    const step = ONBOARDING_STEPS[this.save.stepIndex];
    if (!step || !this.entry) return;
    const snapshot = this.options.snapshot();
    if (stepIsComplete(
      step,
      snapshot,
      this.entry,
      this.signalCounts,
      (selector) => this.isElementVisible(selector),
    )) {
      this.advance();
      return;
    }
    this.renderDynamic(snapshot);
    if (this.elapsedOnStep >= 20) this.render();
  }

  private enterCurrentStep(): void {
    this.cleanupHighlight();
    const step = ONBOARDING_STEPS[this.save.stepIndex];
    if (!step) return;
    this.entry = {
      snapshot: this.options.snapshot(),
      signalCounts: new Map(this.signalCounts),
    };
    this.elapsedOnStep = 0;
    this.updateAccumulator = 0;
    if (step.highlightSelector) {
      const element = document.querySelector<HTMLElement>(step.highlightSelector);
      if (element) {
        element.classList.add('onboarding-highlight');
        this.highlighted = element;
      }
    }
    this.persist();
    this.render();
  }

  private advance(): void {
    if (this.save.stepIndex >= ONBOARDING_STEPS.length - 1) {
      this.finish();
      return;
    }
    this.save.stepIndex += 1;
    this.enterCurrentStep();
  }

  private manualAdvance(): void {
    const step = ONBOARDING_STEPS[this.save.stepIndex];
    if (!step) return;
    if (step.completion.type !== 'manual') {
      this.advance();
      return;
    }
    this.advance();
  }

  private previous(): void {
    if (!this.active || this.save.stepIndex <= 0) return;
    this.save.stepIndex -= 1;
    this.enterCurrentStep();
  }

  private pause(): void {
    this.active = false;
    this.cleanupHighlight();
    this.beacon.visible = false;
    this.persist();
    this.render();
  }

  private resume(): void {
    if (this.save.completed) this.save.stepIndex = 0;
    this.save.completed = false;
    this.save.skipped = false;
    this.active = true;
    this.enterCurrentStep();
  }

  private restart(): void {
    this.save = { version: 1, stepIndex: 0, completed: false, skipped: false };
    this.active = true;
    this.enterCurrentStep();
  }

  private disableAutomatic(): void {
    this.active = false;
    this.save.skipped = true;
    this.cleanupHighlight();
    this.beacon.visible = false;
    this.persist();
    this.render();
  }

  private finish(): void {
    this.save.completed = true;
    this.save.skipped = false;
    this.active = false;
    this.cleanupHighlight();
    this.beacon.visible = false;
    this.persist();
    this.render();
  }

  private persist(): void {
    this.options.storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(this.save));
  }

  private render(): void {
    this.root.style.display = this.active ? 'block' : 'none';
    if (!this.active) return;
    const step = ONBOARDING_STEPS[this.save.stepIndex];
    if (!step) return;
    this.root.querySelector<HTMLElement>('.onboarding-kicker')!.textContent =
      `บทสอน ${this.save.stepIndex + 1}/${ONBOARDING_STEPS.length}`;
    this.root.querySelector<HTMLElement>('.onboarding-title')!.textContent = step.title;
    this.root.querySelector<HTMLElement>('.onboarding-body')!.textContent = step.body;
    const hint = this.root.querySelector<HTMLElement>('.onboarding-hint')!;
    hint.textContent = this.elapsedOnStep >= 20 ? `💡 ${step.hint}` : step.hint;
    hint.classList.toggle('strong', this.elapsedOnStep >= 20);
    const next = this.root.querySelector<HTMLButtonElement>('.onboarding-next')!;
    next.style.display = step.completion.type === 'manual' ? 'inline-flex' : 'none';
    next.textContent = step.id === 'welcome'
      ? 'เริ่มผจญภัย'
      : step.id === 'complete' ? 'จบบทสอน' : 'เข้าใจแล้ว';
    this.root.querySelector<HTMLButtonElement>('.onboarding-prev')!
      .toggleAttribute('disabled', this.save.stepIndex === 0);
    this.renderDynamic(this.options.snapshot());
  }

  private renderDynamic(snapshot: OnboardingSnapshot): void {
    const step = ONBOARDING_STEPS[this.save.stepIndex];
    const waypoint = this.root.querySelector<HTMLElement>('.onboarding-waypoint')!;
    if (!step?.target) {
      waypoint.hidden = true;
      this.beacon.visible = false;
      return;
    }
    waypoint.hidden = false;
    const text = waypoint.querySelector<HTMLElement>('.onboarding-waypoint-text')!;
    if (snapshot.islandId !== step.target.islandId) {
      text.textContent = `${step.target.label} · อยู่เกาะเริ่มต้น`;
      this.beacon.visible = false;
      return;
    }
    const dx = step.target.x - snapshot.x;
    const dz = step.target.z - snapshot.z;
    const distance = Math.hypot(dx, dz);
    const relative = Math.atan2(dx, dz) - snapshot.cameraYaw;
    waypoint.querySelector<HTMLElement>('.onboarding-arrow')!
      .style.transform = `rotate(${relative}rad)`;
    text.textContent = `${step.target.label} · ${Math.round(distance)} ม.`;
    this.beacon.visible = true;
    this.beacon.position.set(
      step.target.x,
      this.options.heightAt(step.target.x, step.target.z) + 0.12,
      step.target.z,
    );
  }

  private updateBeacon(dt: number): void {
    if (!this.beacon.visible) return;
    const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.12;
    this.beacon.scale.setScalar(pulse);
    this.beacon.rotation.z += dt * 0.8;
  }

  private openGuide(interactive: boolean): void {
    // Keyboard users can read/close the guide without losing pointer lock. A click/tap
    // explicitly requests an interactive dialog and may release it for cursor access.
    if (interactive && document.pointerLockElement) document.exitPointerLock();
    this.guide.style.display = 'flex';
  }

  private closeGuide(): void {
    this.guide.style.display = 'none';
  }

  private guideMarkup(): string {
    const topics = GUIDE_TOPICS.map((topic) => `
      <article class="onboarding-topic">
        <h3><span>${topic.icon}</span>${topic.title}</h3>
        <p>${topic.summary}</p>
        <ul>${topic.tips.map((tip) => `<li>${tip}</li>`).join('')}</ul>
      </article>`).join('');
    return `<section class="onboarding-guide" role="dialog" aria-modal="true" aria-label="คู่มือนักผจญภัย">
      <header><div><h2>📖 คู่มือนักผจญภัย</h2><p>พื้นฐานทุกระบบของ Pirate Fruit</p></div>
        <button class="onboarding-guide-close" type="button" aria-label="ปิดคู่มือ">×</button></header>
      <div class="onboarding-topics">${topics}</div>
      <footer>
        <button type="button" data-guide-action="resume">ทำบทสอนต่อ</button>
        <button type="button" data-guide-action="restart">เริ่มบทสอนใหม่</button>
        <button type="button" data-guide-action="disable" class="secondary">ไม่แสดงอัตโนมัติ</button>
      </footer>
    </section>`;
  }

  private isElementVisible(selector: string): boolean {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return false;
    const style = globalThis.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return Boolean(element && (
      element.tagName === 'INPUT'
      || element.tagName === 'TEXTAREA'
      || element.isContentEditable
    ));
  }

  private cleanupHighlight(): void {
    this.highlighted?.classList.remove('onboarding-highlight');
    this.highlighted = null;
  }

  dispose(): void {
    this.cleanupHighlight();
    this.beacon.geometry.dispose();
    (this.beacon.material as THREE.Material).dispose();
    this.options.scene.remove(this.beacon);
    this.root.remove();
    this.guide.remove();
    this.helpButton.remove();
  }

  private injectStyles(): void {
    if (document.getElementById('onboarding-styles')) return;
    const style = document.createElement('style');
    style.id = 'onboarding-styles';
    style.textContent = `
      .onboarding-root{position:fixed;left:50%;bottom:max(10px,env(safe-area-inset-bottom));z-index:34;
        width:min(440px,calc(100vw - 18px));transform:translateX(-50%);pointer-events:none;
        font-family:'Segoe UI',Tahoma,sans-serif;color:#eefcff}
      .onboarding-card{pointer-events:auto;padding:12px 14px;border-radius:15px;
        border:1px solid rgba(108,232,211,.55);background:linear-gradient(145deg,rgba(5,31,43,.96),rgba(12,62,67,.96));
        box-shadow:0 8px 28px rgba(0,0,0,.48);backdrop-filter:blur(8px)}
      .onboarding-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .onboarding-kicker{font-size:10px;font-weight:800;letter-spacing:.08em;color:#7ce9bd;text-transform:uppercase}
      .onboarding-guide-open,.onboarding-actions button,.onboarding-guide footer button{border:0;border-radius:9px;padding:7px 10px;
        color:#072028;background:#ffd875;font-weight:800;cursor:pointer}
      .onboarding-guide-open{padding:4px 8px;font-size:10px;background:rgba(126,231,202,.18);color:#bfffe9}
      .onboarding-title{margin:4px 0 2px;font-size:16px;color:#ffe59a}
      .onboarding-body{margin:0;font-size:12px;line-height:1.45;color:#d6e9eb}
      .onboarding-hint{margin:6px 0 0;font-size:10px;color:#9ec6ca}.onboarding-hint.strong{color:#ffe292;font-weight:700}
      .onboarding-waypoint{display:flex;align-items:center;gap:8px;margin-top:7px;padding:6px 9px;border-radius:10px;
        color:#fff4b9;background:rgba(255,210,90,.12);font-size:11px;font-weight:700}
      .onboarding-arrow{display:inline-block;color:#ffd75f;font-size:18px;line-height:1;transition:transform .12s linear}
      .onboarding-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}
      .onboarding-actions button{font-size:10px;padding:6px 9px}.onboarding-actions .onboarding-prev,
      .onboarding-actions .onboarding-pause{color:#d2e9ec;background:rgba(125,182,190,.15)}
      .onboarding-actions button:disabled{opacity:.35;cursor:default}
      .onboarding-help-button{position:fixed;left:50%;bottom:max(5px,env(safe-area-inset-bottom));z-index:33;
        transform:translateX(-50%);border:1px solid rgba(121,224,203,.5);border-radius:999px;padding:6px 11px;
        color:#d9fff2;background:rgba(6,44,52,.9);font-size:10px;font-weight:800;cursor:pointer}
      .onboarding-root[style*="block"]~.onboarding-help-button{display:none}
      .onboarding-guide-root{position:fixed;inset:0;z-index:96;display:none;align-items:center;justify-content:center;
        padding:12px;background:rgba(1,10,17,.72);backdrop-filter:blur(6px);font-family:'Segoe UI',Tahoma,sans-serif}
      .onboarding-guide{width:min(820px,100%);max-height:88vh;overflow:auto;padding:16px;border-radius:17px;
        color:#edfafa;background:linear-gradient(145deg,#082632,#114950);border:1px solid rgba(125,230,205,.48);
        box-shadow:0 18px 58px rgba(0,0,0,.58)}
      .onboarding-guide header{display:flex;justify-content:space-between;gap:10px;position:sticky;top:-16px;z-index:2;
        padding:10px 0;background:#0a3039}.onboarding-guide h2{margin:0;color:#ffe18c;font-size:20px}
      .onboarding-guide header p{margin:3px 0;color:#9fc6ca;font-size:11px}
      .onboarding-guide-close{border:0;color:#e8f8f8;background:transparent;font-size:28px;cursor:pointer}
      .onboarding-topics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .onboarding-topic{padding:11px;border-radius:12px;background:rgba(2,20,28,.48);border:1px solid rgba(126,215,205,.16)}
      .onboarding-topic h3{display:flex;gap:7px;margin:0;color:#fff0b9;font-size:13px}
      .onboarding-topic p{margin:5px 0;color:#c2dadd;font-size:10px;line-height:1.45}
      .onboarding-topic ul{margin:5px 0 0;padding-left:17px;color:#9fc7ca;font-size:9px;line-height:1.55}
      .onboarding-guide footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px;margin-top:12px}
      .onboarding-guide footer .secondary{color:#d6e9eb;background:rgba(130,181,187,.16)}
      .onboarding-highlight{animation:onboarding-pulse 1.05s ease-in-out infinite!important;
        outline:3px solid #ffe16f!important;outline-offset:3px!important}
      @keyframes onboarding-pulse{50%{filter:brightness(1.35);box-shadow:0 0 0 8px rgba(255,221,105,.18)}}
      @media(max-width:700px){.onboarding-root{bottom:max(5px,env(safe-area-inset-bottom));
        left:36%;width:min(250px,calc(100vw - 170px))}
        .onboarding-card{padding:6px 8px;border-radius:11px}
        .onboarding-kicker{font-size:8px}.onboarding-guide-open{padding:3px 6px;font-size:8px}
        .onboarding-title{margin:2px 0 1px;font-size:12px;line-height:1.2}
        .onboarding-body{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;
          font-size:9px;line-height:1.3}
        .onboarding-waypoint{margin-top:4px;padding:3px 6px;font-size:9px}
        .onboarding-arrow{font-size:14px}.onboarding-hint{margin-top:3px;font-size:8px;line-height:1.25}
        .onboarding-actions{gap:4px;margin-top:4px}.onboarding-actions button{padding:4px 6px;font-size:8px}
        .onboarding-topics{grid-template-columns:1fr}
        .onboarding-guide-root{align-items:flex-end;padding:6px}.onboarding-guide{max-height:82vh;padding:13px}}
      @media(max-width:700px) and (max-height:500px){
        .onboarding-root{width:min(260px,calc(100vw - 150px))}
        .onboarding-body{-webkit-line-clamp:1}.onboarding-hint{display:none}}
      @media(prefers-reduced-motion:reduce){.onboarding-highlight{animation:none!important}}
    `;
    document.head.appendChild(style);
  }
}
