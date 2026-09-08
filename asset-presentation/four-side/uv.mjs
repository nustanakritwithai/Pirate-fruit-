export const FACE_ORDER = Object.freeze(['front', 'right', 'back', 'left', 'top', 'bottom']);

export const FACE_AXES = Object.freeze({
  front: Object.freeze({ axis: 'z', sign: -1, label: 'Front' }),
  right: Object.freeze({ axis: 'x', sign: 1, label: 'Right' }),
  back: Object.freeze({ axis: 'z', sign: 1, label: 'Back' }),
  left: Object.freeze({ axis: 'x', sign: -1, label: 'Left' }),
  top: Object.freeze({ axis: 'y', sign: 1, label: 'Top' }),
  bottom: Object.freeze({ axis: 'y', sign: -1, label: 'Bottom' }),
});

export function faceOffset(depth, epsilon = 0.002) {
  return -(depth / 2 + epsilon);
}

export const DEFAULT_ATLAS = Object.freeze({ tile: 256, gutter: 4, atlas: 1024 });

export const BOX_FACE_INDEX = Object.freeze({
  right: 0,
  left: 1,
  top: 2,
  bottom: 3,
  back: 4,
  front: 5,
});

export function atlasLayout({
  tile = DEFAULT_ATLAS.tile,
  gutter = DEFAULT_ATLAS.gutter,
  atlas = DEFAULT_ATLAS.atlas,
} = {}) {
  if (gutter < 4) throw new Error('four-side gutter must be at least 4px');
  const cells = {
    front: [0, 0],
    right: [1, 0],
    back: [0, 1],
    left: [1, 1],
    top: [0, 2],
    bottom: [1, 2],
  };
  const needed = 2 * tile;
  const neededY = 3 * tile;
  if (needed > atlas || neededY > atlas) {
    throw new Error(`atlas ${atlas} is too small for 2x3 tiles of ${tile}`);
  }
  const faces = {};
  for (const [name, [col, row]] of Object.entries(cells)) {
    const x = col * tile;
    const y = row * tile;
    faces[name] = {
      name,
      ...FACE_AXES[name],
      pixel: { x, y, w: tile, h: tile },
      uv: {
        u0: (x + gutter) / atlas,
        v0: 1 - (y + tile - gutter) / atlas,
        u1: (x + tile - gutter) / atlas,
        v1: 1 - (y + gutter) / atlas,
      },
    };
  }
  return Object.freeze({ tile, gutter, atlas, columns: 2, rows: 3, faces: Object.freeze(faces) });
}

export function boxFaceUvCorners(face, layout) {
  const { u0, v0, u1, v1 } = layout.faces[face].uv;
  if (face === 'right') {
    return [
      [u1, v1],
      [u0, v1],
      [u1, v0],
      [u0, v0],
    ];
  }
  return [
    [u0, v1],
    [u1, v1],
    [u0, v0],
    [u1, v0],
  ];
}

export function assertOrientation(layout = atlasLayout()) {
  const errors = [];
  if (layout.faces.front.sign !== -1 || layout.faces.front.axis !== 'z') errors.push('Front must be -Z');
  if (layout.faces.right.sign !== 1 || layout.faces.right.axis !== 'x') errors.push('Right must be +X');
  if (layout.faces.back.sign !== 1 || layout.faces.back.axis !== 'z') errors.push('Back must be +Z');
  if (layout.faces.left.sign !== -1 || layout.faces.left.axis !== 'x') errors.push('Left must be -X');
  if (layout.faces.top.axis !== 'y' || layout.faces.top.sign !== 1) errors.push('Top must be +Y');
  if (layout.faces.bottom.axis !== 'y' || layout.faces.bottom.sign !== -1) errors.push('Bottom must be -Y');
  if (layout.faces.front.uv.u0 === layout.faces.right.uv.u0) errors.push('Front/Right must not share the same tile');
  return errors;
}
