// ================== CATALOGUE — 50 MÀU & DÒNG YẾN PHỤNG ==================
// NGUỒN CHUẨN: MASTER LIST đã được OWNER duyệt (Phase 1B). KHÔNG thêm, bớt, đổi tên,
// đổi thứ tự hoặc chuyển mục giữa các Level. KHÔNG lấy dữ liệu từ OCR poster.
//
// - nameInternational: theo MASTER LIST (chuẩn).
// - nameVietnamese: chỉ điền khi OWNER/GPT đã duyệt rõ ràng. Hiện để null.
// - profileAvailable: true khi đã có trang chi tiết (poster + nội dung) được duyệt.
// - SPECIAL / REFERENCE: KHÔNG thuộc 50 mục này.

const CATALOGUE_LEVELS = [
  { level: 1, id: 'lv1', title: 'Level 1', poster: 'assets/catalogue/catalogue-lv1-1536.webp', posterMid: 'assets/catalogue/catalogue-lv1-960.webp', teaser: 'assets/catalogue/catalogue-lv1-teaser.webp' },
  { level: 2, id: 'lv2', title: 'Level 2', poster: 'assets/catalogue/catalogue-lv2-1536.webp', posterMid: 'assets/catalogue/catalogue-lv2-960.webp', teaser: 'assets/catalogue/catalogue-lv2-teaser.webp' },
  { level: 3, id: 'lv3', title: 'Level 3', poster: 'assets/catalogue/catalogue-lv3-1536.webp', posterMid: 'assets/catalogue/catalogue-lv3-960.webp', teaser: 'assets/catalogue/catalogue-lv3-teaser.webp' },
  { level: 4, id: 'lv4', title: 'Level 4', poster: 'assets/catalogue/catalogue-lv4-1536.webp', posterMid: 'assets/catalogue/catalogue-lv4-960.webp', teaser: 'assets/catalogue/catalogue-lv4-teaser.webp' },
  { level: 5, id: 'lv5', title: 'Level 5', poster: 'assets/catalogue/catalogue-lv5-1536.webp', posterMid: 'assets/catalogue/catalogue-lv5-960.webp', teaser: 'assets/catalogue/catalogue-lv5-teaser.webp' }
];

// [no, level, nameInternational]
const CATALOGUE_MASTER = [
  // LEVEL 1
  [1, 1, 'Normal Light Green'],
  [2, 1, 'Normal Sky Blue'],
  [3, 1, 'Dark Green'],
  [4, 1, 'Cobalt Blue'],
  [5, 1, 'Olive Green'],
  [6, 1, 'Mauve'],
  [7, 1, 'Grey Green'],
  [8, 1, 'Grey'],
  [9, 1, 'Yellowface Blue Type 1 & 2'],
  [10, 1, 'Clearflight Pied'],
  // LEVEL 2
  [11, 2, 'Violet Blue / Visual Violet'],
  [12, 2, 'Opaline'],
  [13, 2, 'Cinnamon'],
  [14, 2, 'Single Factor Spangle (SF)'],
  [15, 2, 'Dominant Pied'],
  [16, 2, 'Recessive Pied / Danish Pied'],
  [17, 2, 'Dutch Pied'],
  [18, 2, 'Lutino'],
  [19, 2, 'Albino'],
  [20, 2, 'Greywing'],
  // LEVEL 3
  [21, 3, 'Clearwing'],
  [22, 3, 'Continental Clearwing'],
  [23, 3, 'Dilute'],
  [24, 3, 'Double Factor Spangle (DF)'],
  [25, 3, 'Mottled'],
  [26, 3, 'Black-Eyed Self'],
  [27, 3, 'Opaline Cinnamon'],
  [28, 3, 'Opaline Spangle'],
  [29, 3, 'Cinnamon Spangle'],
  [30, 3, 'Tufted / Tuft Crest'],
  // LEVEL 4
  [31, 4, 'Rainbow'],
  [32, 4, 'Goldenface Blue'],
  [33, 4, 'Fullbody Greywing'],
  [34, 4, 'Lacewing'],
  [35, 4, 'Texas Clearbody (TCB)'],
  [36, 4, 'Dark-Eyed Clear (DEC)'],
  [37, 4, 'German Fallow'],
  [38, 4, 'Full Crested'],
  [39, 4, 'Violet Rainbow'],
  [40, 4, 'Goldenface Rainbow'],
  // LEVEL 5
  [41, 5, 'Double Factor Anthracite'],
  [42, 5, 'Blackwing'],
  [43, 5, 'Slate'],
  [44, 5, 'English Fallow'],
  [45, 5, 'Hagoromo / Japanese Crested'],
  [46, 5, 'Blackwing Rainbow'],
  [47, 5, 'TCB Rainbow'],
  [48, 5, 'Blackface'],
  [49, 5, 'Easley Clearbody'],
  [50, 5, 'Manto Negro / Brazilian Black Mantle']
];

function catalogueSlug(name){
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const CATALOGUE_ITEMS = CATALOGUE_MASTER.map(([no, level, nameInternational]) => ({
  no,
  code: String(no).padStart(2, '0'),
  level,
  nameInternational,
  nameVietnamese: null,
  slug: catalogueSlug(nameInternational),
  published: true,
  profileAvailable: false
}));

// Kiểm tra cấu trúc. Trả về danh sách lỗi (rỗng = hợp lệ).
function validateCatalogue(items, levels){
  const errors = [];
  if (items.length !== 50) errors.push('Tổng số mục phải là 50, hiện có ' + items.length);
  for (let lv = 1; lv <= 5; lv++) {
    const n = items.filter(i => i.level === lv).length;
    if (n !== 10) errors.push('Level ' + lv + ' phải có đúng 10 mục, hiện có ' + n);
  }
  const nos = items.map(i => i.no);
  if (new Set(nos).size !== nos.length) errors.push('Số thứ tự bị trùng');
  const expected = Array.from({ length: 50 }, (_, i) => i + 1);
  if (nos.slice().sort((a, b) => a - b).join(',') !== expected.join(',')) errors.push('Số thứ tự phải đúng từ 01 đến 50');
  items.forEach(i => {
    if (!Number.isInteger(i.level) || i.level < 1 || i.level > 5) errors.push('#' + i.code + ': level không hợp lệ (' + i.level + ')');
    if (/special|reference/i.test(String(i.level)) || /^(special|reference)$/i.test(i.slug)) errors.push('#' + i.code + ': SPECIAL/REFERENCE không được nằm trong 01–50');
    if (i.level !== Math.ceil(i.no / 10)) errors.push('#' + i.code + ' nằm sai Level (Level ' + i.level + ')');
    if (!i.nameInternational) errors.push('#' + i.code + ': thiếu tên');
  });
  const slugs = items.map(i => i.slug);
  if (new Set(slugs).size !== slugs.length) errors.push('Slug bị trùng');
  if (levels.length !== 5 || levels.some((l, idx) => l.level !== idx + 1)) errors.push('Phải có đúng 5 Level theo thứ tự 1–5');
  return errors;
}
