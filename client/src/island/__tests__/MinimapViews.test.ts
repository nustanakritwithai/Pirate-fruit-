import { describe, expect, it } from 'vitest';
import { getMinimapView } from '../../ui/Minimap';

describe('multi-island minimap views', () => {
  it('selects a local view on each island', () => {
    expect(getMinimapView(0, 8).id).toBe('starter-island');
    expect(getMinimapView(170, -40).id).toBe('mist-jungle');
    expect(getMinimapView(170, 125).id).toBe('sunscar-desert');
  });

  it('switches to an ocean overview between islands', () => {
    const view = getMinimapView(88, -30);
    expect(view.id).toBe('ocean-overview');
    expect(view.radius).toBeGreaterThan(140);
  });

  it('keeps all three island centers inside the ocean overview', () => {
    const view = getMinimapView(170, 43);
    expect(view.id).toBe('ocean-overview');
    for (const [x, z] of [[0, 0], [170, -40], [170, 125]]) {
      expect(Math.hypot(x - view.centerX, z - view.centerZ)).toBeLessThan(view.radius);
    }
  });
});
