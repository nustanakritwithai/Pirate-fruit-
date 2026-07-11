import {
  nextGraphicsTier,
  saveGraphicsTier,
  type GraphicsProfile,
} from '../engine/GraphicsQuality';

/** ปุ่มเปลี่ยนคุณภาพภาพแบบเบา ๆ การเปลี่ยนระดับจะรีโหลด renderer เพียงครั้งเดียว */
export class GraphicsSettings {
  constructor(profile: GraphicsProfile) {
    const button = document.createElement('button');
    button.className = 'graphics-setting';
    button.type = 'button';
    button.textContent = `⚙️ ภาพ: ${profile.label}`;
    button.title = 'แตะเพื่อเปลี่ยนระดับกราฟิก';
    button.addEventListener('click', () => {
      const next = nextGraphicsTier(profile.tier);
      saveGraphicsTier(next);
      location.reload();
    });
    document.body.appendChild(button);

    const style = document.createElement('style');
    style.textContent = `
      .graphics-setting {
        position: fixed; z-index: 32; right: 12px; top: 58px; border: 1px solid rgba(255,255,255,.35);
        border-radius: 16px; padding: 6px 10px; color: #fff; background: rgba(5,18,31,.62);
        font: 600 11px 'Segoe UI',Tahoma,sans-serif; text-shadow: 0 1px 2px #000;
        backdrop-filter: blur(5px); cursor: pointer; touch-action: manipulation;
      }
      .graphics-setting:active { transform: scale(.96); background: rgba(30,80,110,.8); }
    `;
    document.head.appendChild(style);
  }
}
