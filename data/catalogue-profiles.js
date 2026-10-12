// ================== HỒ SƠ CHI TIẾT — 10 mục ==================
// Nội dung chuyên môn cho trang chi tiết. Tách khỏi data/catalogue.js để MASTER LIST
// (số thứ tự, Level, tên quốc tế) không bao giờ bị sửa khi bổ sung hồ sơ.
//
// PHẠM VI: chỉ 10 mã trong CATALOGUE_PROFILE_SCOPE được có trang chi tiết.
// 40 mục còn lại chỉ hiện tên trong Catalogue, không có link, không có trang.
//
// BẢN PHÁT HÀNH: chỉ gồm tên tiếng Việt chính thức. Nội dung chuyên môn chưa xác minh
// không nằm trong bản này. Trang chỉ CÔNG KHAI khi hồ sơ đạt đủ CATALOGUE_PUBLISH_RULES (xem cuối file).
//
// CÁC TRƯỜNG
//   status            'draft' (chưa xác minh) | 'verified' (đã duyệt)
//   nameInternational phải trùng MASTER LIST (dùng để đối chiếu, không thay MASTER LIST)
//   nameVietnamese    tên Việt chính thức · nameSource: ai cung cấp/duyệt tên (bắt buộc khi có tên)
//   posterCrop        { level, x, y, w, h } vùng ảnh chim trên poster Level (bản 1536×1024)
//   posterCropApproved true = đã duyệt dùng vùng cắt poster làm ảnh tham khảo tạm thời
//   image             { src, alt, approved } — ảnh riêng, đặt tại assets/catalogue/items/
//   identification    ['…'] đặc điểm nhận dạng (bắt buộc ≥ 1 dòng để xuất bản)
//   confusedWith      [{ code: 'NN', note: '…' }] dễ nhầm với (không bắt buộc)
//   notes             ['…'] ghi chú chuyên môn (không bắt buộc)
//   source            nguồn · masterListVersion · reviewedBy · reviewedAt ('YYYY-MM-DD')

const CATALOGUE_PROFILE_SCOPE = ['01', '02', '04', '11', '12', '15', '18', '19', '31', '38'];

// Tên Việt: danh sách chính thức OWNER cung cấp (Phase 1E, 08/10/2026).
const NAME_SOURCE_1E = 'OWNER — danh sách chính thức Phase 1E (08/10/2026)';

const CATALOGUE_PROFILES = {
  '01': { status: 'draft', nameInternational: 'Normal Light Green', nameVietnamese: 'Xanh lá thường', nameSource: NAME_SOURCE_1E,
    image: { src: '', alt: '', approved: false }, posterCropApproved: false,
    source: '', masterListVersion: '', reviewedBy: '', reviewedAt: '' },
  '02': { status: 'draft', nameInternational: 'Normal Sky Blue', nameVietnamese: 'Xanh da trời', nameSource: NAME_SOURCE_1E,
    image: { src: '', alt: '', approved: false }, posterCropApproved: false,
    source: '', masterListVersion: '', reviewedBy: '', reviewedAt: '' },
  '04': { status: 'draft', nameInternational: 'Cobalt Blue', nameVietnamese: 'Xanh Cobalt', nameSource: NAME_SOURCE_1E,
    image: { src: '', alt: '', approved: false }, posterCropApproved: false,
    source: '', masterListVersion: '', reviewedBy: '', reviewedAt: '' },
  '11': { status: 'draft', nameInternational: 'Violet Blue / Visual Violet', nameVietnamese: 'Xanh tím', nameSource: NAME_SOURCE_1E,
    image: { src: '', alt: '', approved: false }, posterCropApproved: false,
    source: '', masterListVersion: '', reviewedBy: '', reviewedAt: '' },
  '12': { status: 'draft', nameInternational: 'Opaline', nameVietnamese: 'Opaline', nameSource: NAME_SOURCE_1E,
    image: { src: '', alt: '', approved: false }, posterCropApproved: false,
    source: '', masterListVersion: '', reviewedBy: '', reviewedAt: '' },
  '15': { status: 'draft', nameInternational: 'Dominant Pied', nameVietnamese: 'Bông trội', nameSource: NAME_SOURCE_1E,
    image: { src: '', alt: '', approved: false }, posterCropApproved: false,
    source: '', masterListVersion: '', reviewedBy: '', reviewedAt: '' },
  '18': { status: 'draft', nameInternational: 'Lutino', nameVietnamese: 'Vàng mắt đỏ', nameSource: NAME_SOURCE_1E,
    image: { src: '', alt: '', approved: false }, posterCropApproved: false,
    source: '', masterListVersion: '', reviewedBy: '', reviewedAt: '' },
  '19': { status: 'draft', nameInternational: 'Albino', nameVietnamese: 'Trắng mắt đỏ', nameSource: NAME_SOURCE_1E,
    image: { src: '', alt: '', approved: false }, posterCropApproved: false,
    source: '', masterListVersion: '', reviewedBy: '', reviewedAt: '' },
  '31': { status: 'draft', nameInternational: 'Rainbow', nameVietnamese: 'Rainbow chuẩn', nameSource: NAME_SOURCE_1E,
    image: { src: '', alt: '', approved: false }, posterCropApproved: false,
    source: '', masterListVersion: '', reviewedBy: '', reviewedAt: '' },
  '38': { status: 'draft', nameInternational: 'Full Crested', nameVietnamese: 'Mào tròn chuẩn', nameSource: NAME_SOURCE_1E,
    image: { src: '', alt: '', approved: false }, posterCropApproved: false,
    source: '', masterListVersion: '', reviewedBy: '', reviewedAt: '' }
};

// Điều kiện để một trang chi tiết được CÔNG KHAI (tất cả phải đúng):
// mã thuộc phạm vi · hồ sơ hợp lệ · status 'verified' · có source + reviewedBy + reviewedAt
// · có tên Việt · có ≥ 1 đặc điểm nhận dạng · (requireImage) có ảnh riêng đã duyệt HOẶC vùng cắt poster đã duyệt.
const CATALOGUE_PUBLISH_RULES = {
  requireImage: true // OWNER DECISION: false = cho phép công khai khi chưa có ảnh riêng
};

// Kiểm tra cấu trúc hồ sơ. Trả về danh sách lỗi dạng '#NN: …' (rỗng = hợp lệ).
// Hồ sơ lỗi chỉ bị coi là chưa xuất bản, không làm hỏng catalogue.
function validateCatalogueProfiles(profiles, items, scope){
  const errors = [];
  const codes = new Set(items.map(i => i.code));
  const inScope = new Set(scope);
  const isText = v => typeof v === 'string' && v.trim() !== '';
  const isTextList = v => Array.isArray(v) && v.every(isText);
  if (inScope.size !== scope.length) errors.push('#--: CATALOGUE_PROFILE_SCOPE có mã trùng');
  scope.forEach(c => { if (!codes.has(c)) errors.push('#' + c + ': mã trong phạm vi không có trong MASTER LIST'); });
  Object.entries(profiles).forEach(([code, p]) => {
    const tag = '#' + code;
    if (!codes.has(code)) { errors.push(tag + ': mã không có trong MASTER LIST'); return; }
    if (!inScope.has(code)) { errors.push(tag + ': mã không thuộc phạm vi 10 hồ sơ Phase 1D'); return; }
    if (!p || typeof p !== 'object') { errors.push(tag + ': hồ sơ không hợp lệ'); return; }
    if (!['draft', 'verified'].includes(p.status)) errors.push(tag + ': status phải là draft hoặc verified');
    if (p.status === 'verified' && !(isText(p.source) && isText(p.reviewedBy) && isText(p.reviewedAt))) {
      errors.push(tag + ': verified nhưng thiếu source / reviewedBy / reviewedAt');
    }
    if (p.nameVietnamese != null && !isText(p.nameVietnamese)) errors.push(tag + ': nameVietnamese rỗng (để null nếu chưa có)');
    if (isText(p.nameVietnamese) && !isText(p.nameSource)) errors.push(tag + ': có nameVietnamese nhưng thiếu nameSource');
    const item = items.find(i => i.code === code);
    if (p.nameInternational != null && p.nameInternational !== item.nameInternational) {
      errors.push(tag + ': nameInternational "' + p.nameInternational + '" khác MASTER LIST "' + item.nameInternational + '"');
    }
    if (p.posterCrop != null) {
      const c = p.posterCrop, n = v => Number.isFinite(v) && v >= 0;
      if (typeof c !== 'object' || c.level !== item.level || !['x', 'y', 'w', 'h'].every(k => n(c[k]))
          || c.w < 1 || c.h < 1 || c.x + c.w > 1536 || c.y + c.h > 1024) {
        errors.push(tag + ': posterCrop không hợp lệ (phải đúng Level của mục, nằm trong 1536×1024)');
      }
    }
    if (p.posterCropApproved && !p.posterCrop) errors.push(tag + ': posterCropApproved nhưng không có posterCrop');
    ['identification', 'notes'].forEach(k => {
      if (p[k] != null && !isTextList(p[k])) errors.push(tag + ': ' + k + ' phải là danh sách chuỗi');
    });
    if (p.confusedWith != null) {
      if (!Array.isArray(p.confusedWith)) errors.push(tag + ': confusedWith phải là danh sách');
      else p.confusedWith.forEach(c => {
        if (c && c.code == null && isText(c.label)) return; // mục chỉ có nhãn, không có mã (Phase 1F)
        if (!c || !codes.has(c.code)) errors.push(tag + ': confusedWith có mã không hợp lệ (' + (c && c.code) + ')');
        else if (c.code === code) errors.push(tag + ': confusedWith không được trỏ về chính nó');
      });
    }
    if (p.image != null) {
      if (typeof p.image !== 'object') errors.push(tag + ': image không hợp lệ');
      else if (p.image.approved && !(isText(p.image.src) && isText(p.image.alt))) errors.push(tag + ': image đã duyệt phải có src và alt');
    }
    if (p.draft != null) {
      const d = p.draft;
      if (typeof d !== 'object') errors.push(tag + ': draft không hợp lệ');
      else {
        if (typeof d.expertReviewRequired !== 'boolean') errors.push(tag + ': draft.expertReviewRequired phải là true/false');
        if (d.sourceDocuments != null && !isTextList(d.sourceDocuments)) errors.push(tag + ': draft.sourceDocuments phải là danh sách chuỗi');
      }
    }
  });
  return errors;
}
