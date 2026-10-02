import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Effects } from '../Effects';

function fixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const effects = new Effects(scene);
  const compileAsync = vi.fn(async (root: THREE.Object3D) => root);
  const programs: { getUniforms: ReturnType<typeof vi.fn> }[] = [];
  const renderer = { compileAsync, info: { programs } } as unknown as THREE.WebGLRenderer;
  return { scene, camera, effects, renderer, compileAsync, programs };
}

describe('shadercacheเอฟเฟกต์พื้นฐาน ไม่ใช่combat authority', () => {
  it('compileครั้งเดียวด้วยฉากเดิมและไม่เพิ่มobjectหรือeffectในโลกจริง', async () => {
    const f = fixture();
    const first = f.effects.prepareCombatShaders(f.renderer, f.camera);
    expect(f.effects.prepareCombatShaders(f.renderer, f.camera)).toBe(first);
    await first;
    expect(f.compileAsync).toHaveBeenCalledTimes(1);
    const root = f.compileAsync.mock.calls[0][0];
    expect(f.compileAsync).toHaveBeenCalledWith(root, f.camera, f.scene);
    expect(root.parent).toBeNull();
    expect(root.visible).toBe(false);
    expect(f.scene.children).toHaveLength(0);
    expect(root.children).toHaveLength(2);
    f.effects.dispose();
  });

  it('ใช้material flagsเดียวกับเอฟเฟกต์จริง ไม่ปิดshader error checks', async () => {
    const f = fixture();
    await f.effects.prepareCombatShaders(f.renderer, f.camera);
    const root = f.compileAsync.mock.calls[0][0];
    const mesh = root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const sprite = root.children[1] as THREE.Sprite;
    f.effects.spawnSlash(new THREE.Vector3(), 0);
    const slash = f.scene.getObjectByName('effect:slash')?.children[0] as typeof mesh;
    for (const field of ['transparent', 'side', 'blending', 'depthWrite', 'toneMapped'] as const)
      expect(mesh.material[field]).toBe(slash.material[field]);
    expect(sprite.material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(sprite.material.transparent).toBe(true);
    expect(sprite.material.depthTest).toBe(false);
    expect(sprite.material.depthWrite).toBe(false);
    expect(sprite.material.toneMapped).toBe(false);
    expect(Object.keys(f.renderer).sort()).toEqual(['compileAsync', 'info']);
    f.effects.dispose();
  });

  it('VFXหมดอายุยังไม่disposecache anchorsจนปิดEffectsเอง', async () => {
    const f = fixture();
    await f.effects.prepareCombatShaders(f.renderer, f.camera);
    const root = f.compileAsync.mock.calls[0][0];
    const material = (root.children[0] as THREE.Mesh).material as THREE.Material;
    const dispose = vi.spyOn(material, 'dispose');
    f.effects.spawnSlash(new THREE.Vector3(), 0);
    f.effects.update(0.3);
    expect(f.scene.children).toHaveLength(0);
    expect(dispose).not.toHaveBeenCalled();
    f.effects.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposeคืนcachematerialและtextureเพียงครั้งเดียว ไม่เหลือobjectในฉาก', async () => {
    const f = fixture();
    await f.effects.prepareCombatShaders(f.renderer, f.camera);
    const root = f.compileAsync.mock.calls[0][0];
    const mesh = root.children[0] as THREE.Mesh;
    const sprite = root.children[1] as THREE.Sprite;
    const meshDispose = vi.spyOn(mesh.material as THREE.Material, 'dispose');
    const spriteDispose = vi.spyOn(sprite.material, 'dispose');
    const textureDispose = vi.spyOn(sprite.material.map!, 'dispose');
    f.effects.dispose();
    f.effects.dispose();
    expect(meshDispose).toHaveBeenCalledTimes(1);
    expect(spriteDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(root.children).toHaveLength(0);
    expect(f.scene.children).toHaveLength(0);
  });

  it('compileล้มเหลวยังคงส่งerrorเดิม ไม่กลบให้startupผ่าน', async () => {
    const f = fixture();
    f.compileAsync.mockRejectedValueOnce(new Error('compile-test-only'));
    await expect(f.effects.prepareCombatShaders(f.renderer, f.camera)).rejects.toThrow('compile-test-only');
    await expect(f.effects.prepareCombatShaders(f.renderer, f.camera)).rejects.toThrow('compile-test-only');
    expect(f.compileAsync).toHaveBeenCalledTimes(1);
    expect(f.scene.children).toHaveLength(0);
    f.effects.dispose();
  });

  it('initializeเฉพาะprogramใหม่ของanchorsหลังcompileพร้อม ไม่แตะprogramเดิมหรือที่เพิ่มภายหลัง', async () => {
    const f = fixture();
    const previous = { getUniforms: vi.fn() };
    const anchor = { getUniforms: vi.fn() };
    const later = { getUniforms: vi.fn() };
    f.programs.push(previous);
    let ready!: () => void;
    f.compileAsync.mockImplementationOnce(() => {
      f.programs.push(anchor);
      return new Promise(resolve => { ready = () => resolve(new THREE.Group()); });
    });
    const preparing = f.effects.prepareCombatShaders(f.renderer, f.camera);
    f.programs.push(later);
    expect(anchor.getUniforms).not.toHaveBeenCalled();
    ready();
    await preparing;
    expect(anchor.getUniforms).toHaveBeenCalledTimes(1);
    expect(previous.getUniforms).not.toHaveBeenCalled();
    expect(later.getUniforms).not.toHaveBeenCalled();
    await f.effects.prepareCombatShaders(f.renderer, f.camera);
    expect(anchor.getUniforms).toHaveBeenCalledTimes(1);
    f.effects.dispose();
  });

  it('first-useerrorไม่ถูกกลบเป็นstartupสำเร็จ', async () => {
    const f = fixture();
    f.compileAsync.mockImplementationOnce(async root => {
      f.programs.push({ getUniforms: vi.fn(() => { throw new Error('first-use-test-only'); }) });
      return root;
    });
    await expect(f.effects.prepareCombatShaders(f.renderer, f.camera)).rejects.toThrow('first-use-test-only');
    f.effects.dispose();
  });

  it('disposeระหว่างcompileไม่initializeprogramที่ถูกคืนresourceไปแล้ว', async () => {
    const f = fixture();
    const anchor = { getUniforms: vi.fn() };
    let ready!: () => void;
    f.compileAsync.mockImplementationOnce(() => {
      f.programs.push(anchor);
      return new Promise(resolve => { ready = () => resolve(new THREE.Group()); });
    });
    const preparing = f.effects.prepareCombatShaders(f.renderer, f.camera);
    f.effects.dispose();
    ready();
    await preparing;
    expect(anchor.getUniforms).not.toHaveBeenCalled();
  });
});
