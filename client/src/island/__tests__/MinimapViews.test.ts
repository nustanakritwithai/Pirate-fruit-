import { describe, expect, it } from 'vitest';
import { getMinimapView } from '../../ui/Minimap';

describe('multi-island minimap views', () => {
  it('selects a local view on each island', () => {
    expect(getMinimapView(0, 8).id).toBe('starter-island');
    expect(getMinimapView(170, -40).id).toBe('mist-jungle');
  });

  it('switches to an ocean overview between islands', () => {
    const view = getMinimapView(88, -30);
    expect(view.id).toBe('ocean-overview');
    expect(view.radius).toBeGreaterThan(140);
  });
});
