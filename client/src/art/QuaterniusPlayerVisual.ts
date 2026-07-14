import * as THREE from 'three';
import { GltfPlayerAnimator } from '../animation/GltfCharacterAnimator';
import type { CharacterAttachmentSockets } from './CharacterRig';
import {
  hideEmbeddedPirateWeapons,
  instantiatePirateAsset,
} from './PirateAssetLibrary';

const PLAYER_MODEL_SCALE = 1.35;

export interface QuaterniusPlayerVisual {
  group: THREE.Group;
  sockets: CharacterAttachmentSockets;
  animator: GltfPlayerAnimator;
  dispose(): void;
}

function socketOn(
  root: THREE.Object3D,
  boneName: string,
  socketName: string,
  position: THREE.Vector3Tuple = [0, 0, 0],
): THREE.Group | null {
  // GLTFLoader sanitize จุดในชื่อ bone จาก Blender (`Middle1.R` -> `Middle1R`).
  // รองรับทั้งชื่อดิบและชื่อ runtime เพื่อให้ asset ที่ export ใหม่ยังเสียบได้ทันที
  const bone = root.getObjectByName(boneName)
    ?? root.getObjectByName(boneName.replaceAll('.', ''));
  if (!bone) return null;
  const socket = new THREE.Group();
  socket.name = socketName;
  socket.position.set(...position);
  socket.userData.equipmentAnchor = true;
  bone.add(socket);
  return socket;
}

/** สร้างผู้เล่นจาก Henry GLB; คืน null เพื่อให้ Player ใช้ Pirate V1 fallback ได้ */
export function createQuaterniusPlayerVisual(): QuaterniusPlayerVisual | null {
  const asset = instantiatePirateAsset('henry');
  if (!asset) return null;

  hideEmbeddedPirateWeapons(asset.root);
  const group = new THREE.Group();
  group.name = 'player:quaternius-henry';
  asset.root.scale.setScalar(PLAYER_MODEL_SCALE);
  group.add(asset.root);

  const leftHand = socketOn(asset.root, 'Middle1.L', 'socket:quaternius-left-hand');
  const rightHand = socketOn(asset.root, 'Middle1.R', 'socket:quaternius-right-hand');
  // Armature ใช้หน่วย 0.01 ก่อน scale 100: 0.0026 ≈ 0.26 เมตรที่สะโพกขวา
  const hips = socketOn(asset.root, 'Hips', 'socket:quaternius-hips', [0.0026, 0, 0]);
  const sockets: CharacterAttachmentSockets = {
    leftHand,
    rightHand,
    hips,
    calibrated: true,
    assetProfile: 'quaternius',
  };
  const animator = new GltfPlayerAnimator(asset.root, asset.animations);

  return {
    group,
    sockets,
    animator,
    dispose: () => {
      animator.dispose();
      asset.disposeMaterials();
    },
  };
}
