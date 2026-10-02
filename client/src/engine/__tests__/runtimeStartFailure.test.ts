import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PIRATE_RUNTIME_FAILED_MESSAGE,
  PIRATE_RUNTIME_START_FAILED,
  showRuntimeStartFailure,
} from '../RuntimeStartFailure';

function createBrowser(search = '?parentOrigin=https%3A%2F%2Fpocket.example', embedded = true) {
  const panels: Array<ReturnType<typeof createPanel>> = [];
  const removeLoading = vi.fn();
  const postMessage = vi.fn();
  const parent = { postMessage };
  const host = {
    location: { search, origin: 'https://pirate.example' },
    // A sandboxed document has an opaque global origin, while location.origin
    // still describes the URL. The bridge must use the latter for validation.
    origin: embedded ? 'null' : 'https://pirate.example',
    parent,
    postMessage,
  };
  if (!embedded) host.parent = host;
  vi.stubGlobal('window', host);
  vi.stubGlobal('document', {
    querySelector: vi.fn(() => ({ remove: removeLoading })),
    getElementById: (id: string) => panels.find((panel) => panel.id === id) ?? null,
    createElement: vi.fn(createPanel),
    body: { appendChild: (panel: ReturnType<typeof createPanel>) => panels.push(panel) },
  });
  return { panels, postMessage, removeLoading };
}

function createPanel() {
  const attributes: Record<string, string> = {};
  return {
    id: '',
    textContent: '',
    style: { cssText: '' },
    attributes,
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('runtime startup failure fallback', () => {
  it('reports only the fixed failure contract to the exact parent origin before presence starts', () => {
    const browser = createBrowser();
    showRuntimeStartFailure();
    expect(browser.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: PIRATE_RUNTIME_FAILED_MESSAGE,
      code: PIRATE_RUNTIME_START_FAILED,
    }, 'https://pocket.example');
    expect(browser.removeLoading).toHaveBeenCalledOnce();
  });

  it('renders an accessible generic alert with safe guidance instead of blaming WebGL', () => {
    const browser = createBrowser();
    showRuntimeStartFailure();
    expect(browser.panels).toHaveLength(1);
    expect(browser.panels[0].attributes).toEqual({
      role: 'alert',
      'data-testid': 'pirate-runtime-start-error',
    });
    expect(browser.panels[0].textContent).toContain('เปิดเกมไม่สำเร็จ');
    expect(browser.panels[0].textContent).toContain('ลองโหลดหน้าเกมใหม่');
    expect(browser.panels[0].textContent).not.toMatch(/WebGL|GPU|Chrome/);
  });

  it('keeps only one alert if a failure is reported again', () => {
    const browser = createBrowser();
    showRuntimeStartFailure();
    showRuntimeStartFailure();
    expect(browser.panels).toHaveLength(1);
  });

  it('stays local in standalone mode even with a parentOrigin parameter', () => {
    const browser = createBrowser(undefined, false);
    showRuntimeStartFailure();
    expect(browser.postMessage).not.toHaveBeenCalled();
    expect(browser.panels).toHaveLength(1);
  });

  it('normalizes an explicit local parent origin without broadcasting', () => {
    const browser = createBrowser('?parentOrigin=http%3A%2F%2Flocalhost%3A5173%2F');
    showRuntimeStartFailure();
    expect(browser.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: PIRATE_RUNTIME_FAILED_MESSAGE,
      code: PIRATE_RUNTIME_START_FAILED,
    }, 'http://localhost:5173');
  });

  it.each([
    '',
    '?parentOrigin=*',
    '?parentOrigin=null',
    '?parentOrigin=https%3A%2F%2Fpocket.example%2Fpath',
    '?parentOrigin=https%3A%2F%2Fpocket.example%3Ftoken%3Dsecret',
    '?parentOrigin=https%3A%2F%2Fuser%3Asecret%40pocket.example',
    '?parentOrigin=javascript%3Aalert(1)',
    '?parentOrigin=data%3Atext%2Fhtml%2Ctest',
  ])('does not broadcast to a missing or unsafe parent origin: %s', (search) => {
    const browser = createBrowser(search);
    showRuntimeStartFailure();
    expect(browser.postMessage).not.toHaveBeenCalled();
    expect(browser.panels).toHaveLength(1);
  });

  it('retains the alert if the parent is unavailable', () => {
    const browser = createBrowser();
    browser.postMessage.mockImplementation(() => { throw new Error('parent unavailable'); });
    expect(showRuntimeStartFailure).not.toThrow();
    expect(browser.panels).toHaveLength(1);
  });
});
