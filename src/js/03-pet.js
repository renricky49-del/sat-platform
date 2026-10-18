/* ============ 像素萌宠 ============ */
// 由 tools/pets.py 量出的头部位置（相对猫图宽高）
const PET_META = {
  orange: { w: 291, h: 320, headX: 0.4704, headTop: 0.0616, headW: 0.7685 },
  tuxedo: { w: 230, h: 320, headX: 0.5008, headTop: 0.0997, headW: 0.7563 },
  calico: { w: 315, h: 320, headX: 0.529, headTop: 0.0946, headW: 0.6935 },
};
// 配饰：[宽度占头宽比例, 底边相对头顶下移(按头宽), 水平偏移(按头宽)]
const WEAR_FIT = { bow: [0.40, 0.10, 0.20], party: [0.36, 0.12, 0], gradcap: [0.66, 0.17, 0], crown: [0.44, 0.13, 0], wizard: [0.80, 0.22, 0] };

function petHTML({ cat, wear, mode = 'idle', h = 150, extraClass = '' }) {
  const m = PET_META[cat] || PET_META.orange;
  let wearHTML = '';
  if (wear && WEAR_FIT[wear]) {
    const [f, dy, dx] = WEAR_FIT[wear];
    const wPct = f * m.headW * 100;
    const left = (m.headX + dx * m.headW - (f * m.headW) / 2) * 100;
    const bottomY = m.headTop + dy * m.headW * (m.w / m.h);
    wearHTML = `<img class="wear" alt="" src="img/acc_${wear}.png" style="width:${wPct.toFixed(2)}%;left:${left.toFixed(2)}%;bottom:${((1 - bottomY) * 100).toFixed(2)}%">`;
  }
  return `<div class="pet ${mode} ${extraClass}" style="--ph:${h}px;--pr:${m.w / m.h}">
    <div class="pet-inner">
      <img class="pose base" alt="" src="img/cat_${cat}.png">
      <img class="pose blink" alt="" src="img/cat_${cat}_blink.png">
      <img class="pose cheer" alt="" src="img/cat_${cat}_cheer.png">
      ${wearHTML}
    </div>
    <div class="pet-shadow"></div>
    <i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><i class="spark s5"></i>
  </div>`;
}

function activePet(coins = coinsEarned()) {
  const ps = petState();
  const cat = isUnlocked(ps.cat, coins) ? ps.cat : 'orange';
  const wear = ps.wear && isUnlocked(ps.wear, coins) ? ps.wear : null;
  return { cat, wear, hideDeco: ps.hideDeco || [] };
}
function petName(id) { return (PETS.find((p) => p.id === id) || PETS[0]).name; }

// 小窝场景：房间背景 + 已解锁的装饰 + 当前萌宠
const DECO_POS = {
  plant: { x: 0.215, b: 0.10, w: 0.105 },
  fishbowl: { x: 0.095, b: 0.415, w: 0.072 },
  yarn: { x: 0.33, b: 0.035, w: 0.07 },
  cattree: { x: 0.70, b: 0.03, w: 0.105 },
  trophy: { x: 0.885, b: 0.04, w: 0.062 },
  bed: { x: 0.50, b: 0.012, w: 0.25 },
};
function roomHTML({ coins = coinsEarned(), mode = 'idle', id = '' } = {}) {
  const ap = activePet(coins);
  const decos = DECOS.filter((d) => coins >= unlockAt(d) && !ap.hideDeco.includes(d.id));
  const hasBed = decos.some((d) => d.id === 'bed');
  const decoHTML = decos.map((d) => {
    const p = DECO_POS[d.id];
    return `<img class="deco deco-${d.id}" alt="${esc(d.name)}" src="img/deco_${d.id}.png" style="left:${(p.x - p.w / 2) * 100}%;bottom:${p.b * 100}%;width:${p.w * 100}%">`;
  }).join('');
  return `<div class="room" ${id ? `id="${id}"` : ''}>
    <img class="room-bg" alt="" src="img/room.webp">
    ${decoHTML}
    <div class="room-pet ${hasBed ? 'on-bed' : ''}" data-cat="${ap.cat}">${petHTML({ cat: ap.cat, wear: ap.wear, mode, h: 0, extraClass: 'fluid' })}</div>
  </div>`;
}

// 点一下萌宠：跳一下
function bindPetPoke(root) {
  $$('.room-pet .pet, .pet.pokeable', root).forEach((el) => {
    el.addEventListener('click', () => playPet(el, 'hop'));
  });
}
function playPet(el, mode, ms) {
  if (!el) return;
  el.classList.remove('idle', 'hop', 'party');
  void el.offsetWidth;
  el.classList.add(mode);
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.classList.remove(mode); el.classList.add('idle'); }, ms || (mode === 'party' ? 2600 : 800));
}
