export const OWNERSHIP = Object.freeze({
  sharedImmutable: 'sharedImmutable',
  instanceOwnedMutable: 'instanceOwnedMutable',
  pooledTransient: 'pooledTransient',
});

const shared = new Map();
const ownedByHandle = new WeakMap();

function mark(resource, kind) {
  if (!resource || typeof resource !== 'object') return resource;
  resource.userData ??= {};
  resource.userData.assetOwnership = kind;
  if (kind === OWNERSHIP.sharedImmutable) resource.userData.shared = true;
  return resource;
}

export function resetOwnership() {
  shared.clear();
}

export function registerShared(key, resource) {
  if (shared.has(key)) return shared.get(key);
  const recorded = mark(resource, OWNERSHIP.sharedImmutable);
  shared.set(key, recorded);
  return recorded;
}

export function registerOwned(handle, resource, kind = OWNERSHIP.instanceOwnedMutable) {
  const recorded = mark(resource, kind);
  const bag = ownedByHandle.get(handle) || [];
  bag.push(recorded);
  ownedByHandle.set(handle, bag);
  return recorded;
}

export function isShared(resource) {
  return resource?.userData?.assetOwnership === OWNERSHIP.sharedImmutable || resource?.userData?.shared === true;
}

export function disposeHandle(handle) {
  const bag = ownedByHandle.get(handle) || [];
  let disposed = 0;
  for (const resource of bag) {
    if (isShared(resource)) continue;
    if (typeof resource.dispose === 'function' && resource.userData?.disposed !== true) {
      resource.dispose();
      resource.userData.disposed = true;
      disposed++;
    }
  }
  ownedByHandle.set(handle, []);
  return { disposed, skippedShared: bag.filter(isShared).length };
}

export function disposeSharedCache() {
  let count = 0;
  for (const resource of shared.values()) {
    if (typeof resource.dispose === 'function') {
      resource.dispose();
      count++;
    }
  }
  shared.clear();
  return count;
}

export function sharedSize() {
  return shared.size;
}
