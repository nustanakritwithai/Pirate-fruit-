export const HANDLE_METHODS = Object.freeze([
  'play', 'update', 'anchor', 'bounds', 'setAppearance', 'dispose',
]);

export const HANDLE_FIELDS = Object.freeze(['root', 'rig']);

export function assertAssetHandle(handle) {
  if (!handle || typeof handle !== 'object') throw new Error('AssetHandle must be an object');
  for (const field of HANDLE_FIELDS) {
    if (!(field in handle)) throw new Error(`AssetHandle missing ${field}`);
  }
  for (const method of HANDLE_METHODS) {
    if (typeof handle[method] !== 'function') throw new Error(`AssetHandle missing ${method}()`);
  }
  return handle;
}

export function createNullHandle({ id = 'null', role = 'player' } = {}) {
  const root = { position: { x: 0, y: 0, z: 0 }, rotation: { y: 0 } };
  const rest = Object.freeze({ headY: 1.56, throwY: 1.15, hitTextY: 1.45, labelY: 2.0 });
  let disposed = false;
  const handle = {
    id,
    role,
    root,
    rig: Object.freeze({ rest, pivots: Object.freeze({}) }),
    play() { return handle; },
    update() { return handle; },
    anchor(name, target) {
      const out = target || { x: root.position.x, y: root.position.y, z: root.position.z };
      out.x = root.position.x;
      out.z = root.position.z;
      if (name === 'throwOrigin') out.y = root.position.y + rest.throwY;
      else if (name === 'hitText') out.y = root.position.y + rest.hitTextY;
      else if (name === 'label' || name === 'headTop') out.y = root.position.y + rest.labelY;
      else if (name === 'feet') out.y = root.position.y;
      else out.y = root.position.y + rest.throwY;
      return out;
    },
    bounds(target) {
      const out = target || { minY: 0, maxY: 0 };
      out.minY = root.position.y;
      out.maxY = root.position.y + rest.labelY;
      return out;
    },
    setAppearance() { return handle; },
    dispose() {
      disposed = true;
      return handle;
    },
    get disposed() { return disposed; },
  };
  return assertAssetHandle(handle);
}
