import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ActiveLoadoutItem, LoadoutCategory } from '../../progression/ProgressionTypes';
import { EquipmentVisuals } from '../EquipmentVisuals';

function item(category: LoadoutCategory, itemId: string = category): ActiveLoadoutItem {
  return { category, itemId, name: itemId };
}

describe('EquipmentVisuals', () => {
  it('shows exactly the visual matching the active loadout category', () => {
    const root = new THREE.Group();
    let active = item('style', 'combat');
    const visuals = new EquipmentVisuals(root, () => active);

    const categories: LoadoutCategory[] = ['style', 'sword', 'gun', 'fruit', 'utility'];
    for (const category of categories) {
      active = item(category, `${category}-test`);
      visuals.update(1 / 60);
      for (const candidate of categories) {
        expect(root.getObjectByName(`equipment:${candidate}`)?.visible).toBe(candidate === category);
      }
    }
  });

  it('keeps a single set of reusable equipment groups while switching items', () => {
    const root = new THREE.Group();
    let active = item('fruit', 'flame');
    const visuals = new EquipmentVisuals(root, () => active);
    const initialChildren = root.children.length;

    active = item('fruit', 'ice');
    visuals.update(1 / 60);

    expect(root.children).toHaveLength(initialChildren);
    expect(root.getObjectByName('equipment:fruit')?.visible).toBe(true);
  });
});
