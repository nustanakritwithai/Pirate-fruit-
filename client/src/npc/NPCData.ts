import { WORLD_POIS } from '../world/WorldPOI';
import type { IslandId } from '../island/IslandTypes';
import { layoutPoint } from '../island/IslandRegistry';

export interface NPCDefinition {
  id: string;
  islandId: IslandId;
  name: string;
  role: string;
  x: number;
  z: number;
  color: number;
  dialogue: string[];
  action?: 'boat-shop' | 'quest-board' | 'dealer-shop' | 'potion-shop' | 'trade-shop';
  dockId?: string;
  tradeVendorId?: string;
}

export const STARTER_NPCS: NPCDefinition[] = [
  {
    id: 'village-chief-mali',
    islandId: 'starter-island',
    name: 'หัวหน้ามะลิ',
    role: 'ผู้นำหมู่บ้าน',
    x: WORLD_POIS.village.x + 2.5,
    z: WORLD_POIS.village.z + 4,
    color: 0x2d7694,
    action: 'quest-board',
    dialogue: [
      'ยินดีต้อนรับสู่เกาะเริ่มต้น นักเดินทาง! ที่นี่คือที่พักของเหล่าโจรสลัดฝึกหัด',
      'ลองสำรวจหาดฝึกฝน สวนผลไม้ลึกลับ และท่าเรือให้ทั่ว ก่อนออกเดินทางสู่ทะเลใหญ่',
      'เลือกงานที่เหมาะกับระดับของเจ้า แล้วกลับมารับงานใหม่ได้เมื่อทำสำเร็จ',
    ],
  },
  {
    id: 'harbor-master-kram',
    islandId: 'starter-island',
    name: 'กัปตันคราม',
    role: 'นายท่า',
    x: 0.9,
    z: -31,
    color: 0x8b4c36,
    action: 'boat-shop',
    dockId: 'starter-harbor',
    dialogue: [
      'อู่เรือเปิดแล้ว! ข้ามีเรือพายฝึกหัดให้เจ้ารับฟรีหนึ่งลำ',
      'เรียกเรือข้างท่า แล้วเดินไปกดขึ้นเรือ ใช้จอยหรือ WASD เพื่อควบคุม',
      'เรือทุกลำมีความเร็วและ HP ของตัวเอง ระวังอย่าพุ่งชนเกาะแรงเกินไป',
    ],
  },
  {
    id: 'fruit-researcher-lin',
    islandId: 'starter-island',
    name: 'หลิน',
    role: 'ดีลเลอร์ผลไม้ปีศาจ',
    x: WORLD_POIS.fruitGrove.x - 3,
    z: WORLD_POIS.fruitGrove.z + 1,
    color: 0x78489b,
    action: 'dealer-shop',
    dialogue: [
      'ต้นไม้เรืองแสงต้นนี้ให้ผลที่มีพลังประหลาด และข้าสกัดพลังมันมาใส่กล่องสุ่มได้แล้ว!',
      'จ่ายเหรียญเพื่อสุ่มดาบ ปืน สไตล์ต่อสู้ หรือผลไม้ปีศาจ แต่ละชิ้นมีชุดสกิลของตัวเอง',
      'ติดตั้งอาวุธ 1 อย่างและผลไม้ 1 ลูก แล้วกดปุ่มสลับ (R) เพื่อสลับชุดสกิลระหว่างสองอย่าง',
    ],
  },
  {
    id: 'shopkeeper-pao',
    islandId: 'starter-island',
    name: 'เถ้าแก่เปา',
    role: 'ร้านขายยา',
    x: 7,
    z: 8.5,
    color: 0xa67935,
    action: 'potion-shop',
    dialogue: [
      'มีทั้งยาฟื้น HP และ MP นะ ซื้อไปเผื่อไว้ตอนสู้',
      'ซื้อแล้วอย่าลืมจัดลงช่องลัดที่กระเป๋า (B) จะได้กดใช้ตอนสู้ได้ทัน',
      'ช่างเรือเมฆที่ท่าเรือขายชิ้นส่วนเรือ ถ้าต้องการค้าวัสดุอู่',
    ],
  },
  {
    id: 'market-trader-nok',
    islandId: 'starter-island',
    name: 'นก',
    role: 'พ่อค้าเกาะใบไม้',
    x: 9.5,
    z: 10,
    color: 0x4a8a5a,
    action: 'trade-shop',
    tradeVendorId: 'vendor-starter-pao',
    dialogue: [
      'ยินดีต้อนรับสู่ตลาดเกาะใบไม้! ราคาอาหารและไม้เปลี่ยนตามสต็อกจริง',
      'ซื้อถูกเมื่อเกาะล้น แล่นเรือไปขายเกาะที่ขาด — ดูข่าวตลาดด้านล่างจอ',
      'เถ้าแก่เปาข้างๆ ขายยา ถ้าต้องการเตรียมของก่อนออกเดินทาง',
    ],
  },
  {
    id: 'shipwright-mek',
    islandId: 'starter-island',
    name: 'ช่างเรือเมฆ',
    role: 'ช่างอู่เรือ',
    x: 4,
    z: -33,
    color: 0x5a8a9a,
    action: 'trade-shop',
    tradeVendorId: 'vendor-starter-shipyard',
    dialogue: [
      'อู่เรือผลิตชิ้นส่วนจากไม้ เหล็ก และผ้า — ราคาขึ้นลงตามวัตถุดิบ',
      'ถ้าวัตถุดิบขาด การผลิตหยุด ราคาชิ้นส่วนเรือจะพุ่ง',
      'นำของมาขายหรือซื้อชิ้นส่วนไปค้าต่อที่เกาะอื่นได้',
    ],
  },
];

export const MIST_JUNGLE_NPCS: NPCDefinition[] = [
  {
    id: 'explorer-dara',
    islandId: 'mist-jungle',
    name: 'ดารา',
    role: 'หัวหน้าคณะสำรวจ',
    x: 153,
    z: -37,
    color: 0x327a68,
    action: 'quest-board',
    dialogue: [
      'ยินดีต้อนรับสู่เกาะพงไพรหมอก ที่นี่เหมาะกับนักเดินทาง Level 15 ขึ้นไป',
      'โจรป่ายึดทางใต้ ส่วนผู้พิทักษ์ศิลาคอยเฝ้าซากวิหารด้านตะวันออก',
      'ลึกเข้าไปทางเหนือมีวานรพิษโบราณ อย่าเข้าใกล้ถ้ายังไม่พร้อมรับท่าหนักของมัน',
    ],
  },
  {
    id: 'harbor-master-niran',
    islandId: 'mist-jungle',
    name: 'นิรันดร์',
    role: 'นายท่าคณะสำรวจ',
    x: 139,
    z: -36.8,
    color: 0x80543a,
    action: 'boat-shop',
    dockId: 'mist-jungle-harbor',
    dialogue: [
      'ถึงท่าพงไพรหมอกอย่างปลอดภัยแล้วสินะ เรือของเจ้าสามารถเรียกจากท่านี้ได้',
      'ทางกลับเกาะเริ่มต้นอยู่ตรงตะวันตก แล่นตามช่องทะเลไปจนเห็นหมู่บ้าน',
      'ถ้าตายหรือตกทะเลหลังขึ้นฝั่ง เจ้าจะกลับมาเกิดที่ค่ายนักสำรวจ',
    ],
  },
  {
    id: 'archaeologist-wan',
    islandId: 'mist-jungle',
    name: 'ว่าน',
    role: 'นักโบราณคดี',
    x: 173,
    z: -31,
    color: 0x6d628e,
    dialogue: [
      'เสาหินเหล่านี้เก่าแก่กว่าหมู่บ้านโจรสลัดหลายร้อยปี รอยสลักกล่าวถึงผู้พิทักษ์แห่งหมอก',
      'ผู้พิทักษ์ศิลาตื่นขึ้นเมื่อมีคนบุกรุก ส่วนวานรพิษน่าจะเป็นสิ่งมีชีวิตที่เฝ้าผนึกด้านใน',
    ],
  },
  {
    id: 'field-medic-sai',
    islandId: 'mist-jungle',
    name: 'สาย',
    role: 'พ่อค้าเกาะเหมือง',
    x: 157,
    z: -43,
    color: 0x8a3653,
    action: 'trade-shop',
    tradeVendorId: 'vendor-mist-expedition',
    dialogue: [
      'เกาะเหมืองขาดอาหารบ่อย — ราคาอาหารที่นี่แพงกว่าเกาะใบไม้',
      'ซื้อเหล็กที่นี่ถูกเมื่อผลิตล้น แล้วขายที่เกาะทอผ้าหรืออู่เรือ',
      'ดูแถบข่าวตลาดด้านล่างก่อนตัดสินใจเดินทาง',
    ],
  },
  {
    id: 'dock-trader-lamai',
    islandId: 'mist-jungle',
    name: 'ละไม',
    role: 'พ่อค้าท่าเรือ',
    x: 141,
    z: -40,
    color: 0x4a7a68,
    action: 'trade-shop',
    tradeVendorId: 'vendor-mist-harbor',
    dialogue: [
      'ตลาดท่าเรือ — ราคาสดอัปเดตทุก 5 วินาที',
      'ลงสินค้าจากเรือก่อนออกเดินทาง อย่าลืมเช็ค cargo มุมขวาล่าง',
    ],
  },
];

export const SUNSCAR_DESERT_NPCS: NPCDefinition[] = [
  {
    id: 'caravan-chief-amara',
    islandId: 'sunscar-desert',
    name: 'อมรา',
    role: 'ผู้นำคาราวานสุริยะ',
    x: 168,
    z: 103,
    color: 0xa44f35,
    action: 'quest-board',
    dialogue: [
      'ยินดีต้อนรับสู่นครคาราวาน เกาะนี้เหมาะกับนักเดินทาง Level 31 ขึ้นไป',
      'แมงป่องเนินทรายซ่อนใต้ผืนทราย โจรคาราวานยึดทางตะวันตก และโกเลมเฝ้าเหมืองตะวันออก',
      'พีระมิดทางเหนือเก็บผู้พิทักษ์สุริยะเอาไว้ อย่าเปิดผนึกจนกว่าจะพร้อมสู้ท่าหนัก',
    ],
  },
  {
    id: 'sunscar-harbor-master-rafi',
    islandId: 'sunscar-desert',
    name: 'ราฟี',
    role: 'นายท่าทะเลทราย',
    x: 174,
    z: 97,
    color: 0x795037,
    action: 'boat-shop',
    dockId: 'sunscar-desert-harbor',
    dialogue: [
      'ท่าใต้เชื่อมตรงไปยังเกาะพงไพรหมอก แล่นลงใต้แล้วอ้อมชายฝั่งตะวันตกเล็กน้อย',
      'เรือที่เจ้ามีอยู่เรียกจากท่านี้ได้ทันที ไม่ต้องซื้อซ้ำ',
      'เมื่อขึ้นฝั่งแล้ว จุดเกิดของเจ้าจะย้ายมาที่นครคาราวานโดยอัตโนมัติ',
    ],
  },
  {
    id: 'sunscar-dealer-zahra',
    islandId: 'sunscar-desert',
    name: 'ซารา',
    role: 'พ่อค้าแห่งเส้นทางทราย',
    x: 176,
    z: 109,
    color: 0x286f78,
    action: 'dealer-shop',
    dialogue: [
      'คาราวานของข้านำอาวุธและผลไม้หายากข้ามทะเลมา เจ้าสุ่มของจากที่นี่ได้เช่นเดียวกับเกาะแรก',
      'ศัตรูบนเกาะนี้มี HP สูง เตรียม Mastery และค่าสถานะของอุปกรณ์หลักให้พร้อม',
    ],
  },
  {
    id: 'caravan-trader-sahir',
    islandId: 'sunscar-desert',
    name: 'ซาฮีร์',
    role: 'พ่อค้าเกาะทอผ้า',
    x: 168,
    z: 98,
    color: 0xc47a3a,
    action: 'trade-shop',
    tradeVendorId: 'vendor-sunscar-bazaar',
    dialogue: [
      'เกาะทอผ้า — ผ้าไหมราคาตามตลาดจริง ซื้อถูกเมื่อผลิตล้น',
      'ต้องการอาหาร ไม้ และเหล็กจากเกาะอื่น — โอกาสทำกำไรสูง',
      'ชิ้นส่วนเรือจากอู่เรือขายดีที่นี่เมื่ออู่ขาดวัสดุ',
    ],
  },
  {
    id: 'dock-trader-hadi',
    islandId: 'sunscar-desert',
    name: 'ฮาดี',
    role: 'พ่อค้าท่าเรือทราย',
    x: 172,
    z: 95,
    color: 0x9a6b45,
    action: 'trade-shop',
    tradeVendorId: 'vendor-sunscar-harbor',
    dialogue: [
      'ท่าเรือทะเลทราย — ราคาเปลี่ยนตามเศรษฐกิจภูมิภาค',
      'ขายของก่อนกลับทะเล หรือเติมสินค้าที่ราคากำลังขึ้น',
    ],
  },
  {
    id: 'sunscar-scholar-senen',
    islandId: 'sunscar-desert',
    name: 'เซเนน',
    role: 'นักอ่านอักษรสุริยะ',
    x: 158,
    z: 118,
    color: 0x76628f,
    dialogue: [
      'พีระมิดไม่ได้สร้างเป็นสุสาน แต่มันคือผนึกพลังของผู้พิทักษ์สุริยะ',
      'โกเลมในเหมืองคือเศษหินที่รับพลังจากผนึก หากผู้พิทักษ์ตื่น ทั้งเกาะอาจถูกพายุทรายกลืนกิน',
    ],
  },
];

export const AZURE_FROST_NPCS: NPCDefinition[] = [
  { id: 'frost-chief-nalin', islandId: 'azure-frost', name: 'นลิน', role: 'หัวหน้าหมู่บ้านนักล่า', x: 58, z: 204, color: 0x416f8e, action: 'quest-board', dialogue: ['ยินดีต้อนรับสู่เกาะเหมันต์คราม ดินแดนนี้เหมาะกับนักเดินทาง Level 51 ขึ้นไป', 'แมงมุมน้ำแข็งยึดทะเลสาบ โจรน้ำแข็งตั้งค่ายตะวันตก และโกเลมคริสตัลเฝ้าเหมืองทางเหนือ', 'ราชันน้ำแข็งหลับอยู่ในป้อมเหนือสุด เตรียมรับท่าฟาดที่ทะลุการป้องกันให้ดี'] },
  { id: 'frost-harbor-master-tarin', islandId: 'azure-frost', name: 'ธาริน', role: 'นายท่าเหมันต์', x: 67, z: 193, color: 0x6c4f3d, action: 'boat-shop', dockId: 'azure-frost-harbor', dialogue: ['ท่าเรือฝั่งตะวันออกเฉียงใต้เชื่อมกลับไปยังเกาะทะเลทรายสุริยะ', 'น้ำแถบนี้เย็นจัดแต่เรือเดิมของเจ้ายังใช้ได้ เรียกเรือจากท่านี้ได้ทันที', 'เมื่อขึ้นฝั่ง จุดเกิดจะย้ายมาที่หมู่บ้านนักล่าโดยไม่กระทบเงินหรือ Progression เดิม'] },
  { id: 'frost-dealer-iris', islandId: 'azure-frost', name: 'ไอริส', role: 'พ่อค้าคริสตัล', x: 63, z: 207, color: 0x725a92, action: 'dealer-shop', dialogue: ['คริสตัลครามช่วยเก็บพลังของอาวุธและผลไม้ไว้ได้นาน ข้าจึงเปิดกล่องสุ่มให้เจ้าที่นี่ได้', 'ศัตรูบนเกาะนี้แข็งแกร่งมาก ตรวจ Stats และ Mastery ของอุปกรณ์หลักก่อนออกล่า'] },
  { id: 'frost-scholar-yura', islandId: 'azure-frost', name: 'ยูรา', role: 'นักสำรวจธารน้ำแข็ง', x: 35, z: 197, color: 0x397d83, dialogue: ['คริสตัลในเหมืองคือเศษพลังจากมงกุฎของราชันน้ำแข็ง พวกมันทำให้โกเลมตื่นขึ้น', 'หากเจ้าจะเข้าป้อม จงหลบท่าหนักแทนการยกโล่ เพราะความเย็นนั้นทะลุการป้องกันได้'] },
];

export const TEMPEST_SKY_NPCS: NPCDefinition[] = [
  { id: 'tempest-elder-arun', islandId: 'tempest-sky', name: 'อรุณ', role: 'ผู้อาวุโสนครหน้าผา', x: -96, z: 213, color: 0x536fa2, action: 'quest-board', dialogue: ['เกาะนภาวายุเหมาะกับนักเดินทาง Level 71 ขึ้นไป ลมที่นี่แรงกว่าทะเลเบื้องล่างหลายเท่า', 'ปูเมฆเกาะตามสวน โจรเวหายึดฝั่งตะวันตก และโกเลมผลึกพายุเฝ้าโรงตีทางเหนือ', 'ยอดวิหารคือรังของเจ้าแห่งพายุ ท่าหนักของมันทะลุ Block จงใช้ Dash หลบให้พ้น'] },
  { id: 'tempest-harbor-master-lom', islandId: 'tempest-sky', name: 'ลม', role: 'นายท่านภา', x: -99, z: 207, color: 0x6a5542, action: 'boat-shop', dockId: 'tempest-sky-harbor', dialogue: ['ท่าฝั่งตะวันออกเชื่อมตรงกลับเกาะเหมันต์คราม แล่นไปทางตะวันออกตามแนวคลื่น', 'เรือเดิมของเจ้าเรียกจากท่านี้ได้ และระบบปืนเรือยังใช้งานได้ตามปกติ', 'ขึ้นฝั่งแล้ว Checkpoint จะย้ายมาที่หมู่บ้านหน้าผาโดยไม่ลบ Cargo หรือ Progression'] },
  { id: 'tempest-dealer-sora', islandId: 'tempest-sky', name: 'โซรา', role: 'พ่อค้าผลึกเวหา', x: -90, z: 216, color: 0x66558f, action: 'dealer-shop', dialogue: ['ผลึกพายุสะสมพลังจากท้องฟ้า ข้าใช้มันดูแลอาวุธและผลไม้หายากของนักเดินทาง', 'ตรวจ Mastery และ Stats ให้พร้อมก่อนขึ้นวิหาร ศัตรูบนยอดเกาะมี HP สูงมาก'] },
  { id: 'tempest-scholar-megha', islandId: 'tempest-sky', name: 'เมฆา', role: 'นักพยากรณ์พายุ', x: -119, z: 194, color: 0x4c8192, dialogue: ['วิหารนี้เคยควบคุมลมเดินเรือทั้งภูมิภาค แต่ผลึกแกนกลางแตกและปลุกเจ้าแห่งพายุขึ้นมา', 'โกเลมคือเศษเกราะของมัน หากฟ้าร้องต่อเนื่อง แสดงว่าบอสกำลังเตรียมท่าหนัก'] },
];

export const EMBER_VOLCANO_NPCS: NPCDefinition[] = [
  { id: 'ember-forgemaster-krai', islandId: 'ember-volcano', name: 'ไคร', role: 'หัวหน้าช่างตีอัคคี', x: -218, z: 103, color: 0x8d4935, action: 'quest-board', dialogue: ['เกาะภูผาอัคคีเหมาะกับนักเดินทาง Level 91 ขึ้นไป ความร้อนที่นี่ปลุกสัตว์ใต้ดินให้คลุ้มคลั่ง', 'ตะขาบลาวายึดทุ่งตะวันตก สาวกลัทธิเถ้าถ่านตั้งป้อม และโกเลมออบซิเดียนเฝ้าเหมือง', 'ไททันแมกมาหลับอยู่กลางปล่อง ท่าหนักของมันทะลุ Block และผลักได้ไกล จง Dash ออกจากวงเตือน'] },
  { id: 'ember-harbor-master-prak', islandId: 'ember-volcano', name: 'ประกาย', role: 'นายท่าภูผา', x: -216, z: 104, color: 0x6b4634, action: 'boat-shop', dockId: 'ember-volcano-harbor', dialogue: ['ท่าเรือเหนือเชื่อมกลับเกาะนภาวายุ แล่นไปทางตะวันออกเฉียงเหนือตามแนวเมฆสีเทา', 'เรือ ปืนใหญ่ Cargo และระบบ Boarding เดิมใช้งานจากท่านี้ได้ครบ', 'ขึ้นฝั่งแล้ว Checkpoint จะย้ายมาที่หมู่บ้านช่างตีโดยไม่ลบ Progression หรือเงินของเจ้า'] },
  { id: 'ember-dealer-rin', islandId: 'ember-volcano', name: 'ริน', role: 'พ่อค้าออบซิเดียน', x: -222, z: 100, color: 0x70465f, action: 'dealer-shop', dialogue: ['ออบซิเดียนจากเหมืองกักพลังร้อนได้ดี ข้าจึงตั้งร้านอุปกรณ์และผลไม้หายากอยู่ข้างโรงตี', 'ตรวจ Stats และ Mastery ให้พร้อม ศัตรูใกล้ปล่องมี HP และ Damage สูงกว่าเกาะนภาวายุมาก'] },
  { id: 'ember-scholar-ada', islandId: 'ember-volcano', name: 'อาดา', role: 'นักธรณีเพลิง', x: -250, z: 91, color: 0x9b603c, dialogue: ['รอยแยกลาวาทั้งหมดไหลจากหัวใจของไททัน หากแสงในปล่องสว่างขึ้น แสดงว่ามันกำลังจะตื่น', 'โกเลมออบซิเดียนคือเปลือกภูเขาไฟที่มีชีวิต ส่วนสาวกลัทธิต้องการควบคุมพลังนั้น'] },
];

const LEGACY_ALL_NPCS: readonly NPCDefinition[] = [
  ...STARTER_NPCS,
  ...MIST_JUNGLE_NPCS,
  ...SUNSCAR_DESERT_NPCS,
  ...AZURE_FROST_NPCS,
  ...TEMPEST_SKY_NPCS,
  ...EMBER_VOLCANO_NPCS,
];

export const ALL_NPCS: NPCDefinition[] = LEGACY_ALL_NPCS.map((npc) => ({
  ...npc,
  ...layoutPoint(npc.islandId, npc.x, npc.z),
}));
