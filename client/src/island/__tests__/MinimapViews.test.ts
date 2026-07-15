import { describe, expect, it } from 'vitest';
import { getMinimapView } from '../../ui/Minimap';

describe('multi-island minimap views', () => {
  it('selects a local view on each island', () => {
    expect(getMinimapView(0, 8).id).toBe('starter-island');
    expect(getMinimapView(170, -120).id).toBe('mist-jungle');
    expect(getMinimapView(360, -40).id).toBe('sunscar-desert');
    expect(getMinimapView(500, 110).id).toBe('azure-frost');
    expect(getMinimapView(430, 330).id).toBe('tempest-sky');
    expect(getMinimapView(220, 470).id).toBe('ember-volcano');
  });

  it('switches to an ocean overview between islands', () => {
    const view = getMinimapView(260, -80);
    expect(view.id).toBe('ocean-overview');
    expect(view.radius).toBeGreaterThan(140);
  });

  it('keeps all six island centers inside the ocean overview', () => {
    const view = getMinimapView(260, 250);
    expect(view.id).toBe('ocean-overview');
    for (const [x, z] of [[0, 0], [170, -120], [360, -40], [500, 110], [430, 330], [220, 470]]) {
      expect(Math.hypot(x - view.centerX, z - view.centerZ)).toBeLessThan(view.radius);
    }
  });
});
