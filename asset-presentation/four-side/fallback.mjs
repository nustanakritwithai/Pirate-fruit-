const EDITABLE = ['front', 'right', 'back', 'left'];

export function resolveFaceSource(part = {}, face) {
  const direct = part[face];
  if (direct) return { face, source: direct, mirrored: false, fallback: false };
  if (face === 'left' && part.right) return { face, source: part.right, mirrored: false, fallback: 'opposite' };
  if (face === 'right' && part.left) return { face, source: part.left, mirrored: false, fallback: 'opposite' };
  if (face === 'back') return { face, source: part.backColor || part.topColor || '#64748B', mirrored: false, fallback: 'color' };
  if (face === 'top') return { face, source: part.topColor || '#F97316', mirrored: false, fallback: 'color' };
  if (face === 'bottom') return { face, source: part.bottomColor || '#FFC4A3', mirrored: false, fallback: 'color' };
  if (EDITABLE.includes(face) && part.single) return { face, source: part.single, mirrored: false, fallback: 'single' };
  return { face, source: part.topColor || '#94A3B8', mirrored: false, fallback: 'color' };
}

export function resolvePartFaces(part = {}) {
  return {
    front: resolveFaceSource(part, 'front'),
    right: resolveFaceSource(part, 'right'),
    back: resolveFaceSource(part, 'back'),
    left: resolveFaceSource(part, 'left'),
    top: resolveFaceSource(part, 'top'),
    bottom: resolveFaceSource(part, 'bottom'),
  };
}
