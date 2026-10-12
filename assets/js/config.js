// ================== YẾN PHỤNG PET — CẤU HÌNH TRUNG TÂM ==================
// Sửa thông tin thương hiệu, liên hệ, asset và tính năng tại đây.
// Lưu ý: <title>, meta description và thẻ OG trong index.html phải sửa trực tiếp
// trong HTML (Facebook/Zalo không chạy JavaScript khi đọc link).

const SITE = {
  brandName: 'YẾN PHỤNG PET',
  tagline: 'Thế giới Yến Phụng dành cho người yêu chim',
  positioning: ['Yến Phụng Hà Lan', 'Chim đang tìm chủ', 'Kiến thức & màu sắc'],

  contactName: 'Ji',
  phone: '0967653899',
  zaloUrl: 'https://zalo.me/0967653899',
  zaloCopyTemplate: 'Mình muốn xem video thực tế của bé {code}',
  location: 'Di Linh – Lâm Đồng',
  consultHours: '08:00–20:00 hằng ngày',

  social: {
    tiktok: 'https://www.tiktok.com/@chimyenphungviet',
    facebook: '',
    youtube: ''
  },

  supabase: {
    url: 'https://bnumqtjzbyrtavsdlleq.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJudW1xdGp6YnlydGF2c2RsbGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTk1NjMsImV4cCI6MjA5NTg3NTU2M30.-Hhyqfe366_Xn8ECav4pg8MWWHJn_o_wsuh-OfI7HHo',
    leadFunction: 'notify-lead'
  },

  features: {
    catalogue: true,    // Phase 1B — catalogue 50 màu & dòng (data/catalogue.js). Tắt = ẩn menu, teaser, route
    catalogueDetail: true, // Phase 1C/1D — trang chi tiết cho hồ sơ ĐÃ XUẤT BẢN (data/catalogue-profiles.js). Tắt = không mục nào có trang
    farm: false,        // Hậu trường TẮT — chỉ bật lại khi OWNER có nội dung THẬT tại trại (không dùng AI)
    contactPortrait: false // OWNER DECISION: Ji có xuất hiện ảnh không
  },

  // ---------- VISUAL ASSET (OWNER + GPT tạo & duyệt; chính sách AI-first) ----------
  // Đặt file đúng path rồi đổi ready:false → true. Khi ready:false, website hiện khối
  // giữ chỗ trung tính (không có hình chim). Chi tiết: YENPHUNGPET_PHASE1A_ASSET_REQUEST.md
  assets: {
    // Nguồn gốc OWNER: Ảnh/03_LOGO_YENPHUNGPET.png (bản gốc lưu ở assets/brand/originals/)
    logo:            { id: 'LOGO-01',    path: 'assets/brand/logo-yenphungpet.webp', width: 545, height: 180, ready: true },
    // Hero = artwork thương hiệu (có thể là AI). Không ghi "ảnh thật"/"tại trại"; không cần badge.
    // Nguồn gốc OWNER: Ảnh/01_HERO_YENPHUNGPET.png. srcset/sizes khớp với thẻ preload trong index.html.
    hero:            { id: 'HERO-01',    path: 'assets/brand/hero-yenphungpet-1254.webp',
                       srcset: 'assets/brand/hero-yenphungpet-640.webp 640w, assets/brand/hero-yenphungpet-1254.webp 1254w',
                       sizes: '(max-width: 860px) 100vw, 430px', width: 1254, height: 1254,
                       alt: 'Minh họa chim Yến Phụng — YẾN PHỤNG PET', ready: true },
    // Ảnh người phụ trách — tuỳ chọn, chỉ dùng ảnh thật nếu OWNER muốn.
    contactPortrait: { id: 'CONTACT-01', path: 'assets/brand/contact-ji.webp', alt: 'Ji — YẾN PHỤNG PET', ready: false },
    // Hậu trường chỉ dành cho nội dung THẬT do OWNER cung cấp. Hiện để trống.
    farm: []
  },

  // ---------- ẢNH MINH HỌA CHO CHIM ĐANG TÌM CHỦ ----------
  // Mỗi visual minh họa một màu/dòng và DÙNG LẠI được cho nhiều bé cùng màu/dòng.
  // Visual chỉ để minh họa — giới tính, tuổi, sức khỏe… luôn lấy từ dữ liệu của bé.
  // Cách website chọn ảnh cho một bé (theo thứ tự):
  //   1. image_url / gallery_urls trong Supabase (trừ các URL trong legacyUnapprovedMedia)
  //   2. inventoryVisualByCode[mã bé]  → id visual
  //   3. visual có `match` trùng với cột color_name của bé (không phân biệt hoa/thường)
  //   4. khối giữ chỗ trung tính
  // `label`, `match`: tên màu/dòng do OWNER/GPT cung cấp theo Master List — Claude không tự điền.
  inventoryVisuals: [
    // { id: 'INV-01', path: 'assets/inventory/inv-<slug-mau-dong>.webp', label: '<tên màu/dòng>', match: ['<color_name>'], ready: false }
  ],
  inventoryVisualByCode: {
    // 'YP002': 'INV-01'
  },

  // Ảnh cũ trên Supabase chưa được OWNER duyệt. Website KHÔNG hiển thị các URL này.
  legacyUnapprovedMedia: [
    'https://bnumqtjzbyrtavsdlleq.supabase.co/storage/v1/object/public/Yenphunggiong/Giong.jpg',
    'https://bnumqtjzbyrtavsdlleq.supabase.co/storage/v1/object/public/Chimto/To.jpg',
    'https://bnumqtjzbyrtavsdlleq.supabase.co/storage/v1/object/public/Sinhsan/5.jpg',
    'https://bnumqtjzbyrtavsdlleq.supabase.co/storage/v1/object/public/Anhbia1/3.jpg',
    'https://bnumqtjzbyrtavsdlleq.supabase.co/storage/v1/object/public/Phothong/Phothong.jpg',
    'https://bnumqtjzbyrtavsdlleq.supabase.co/storage/v1/object/public/Halan/Halan.jpg',
    'https://bnumqtjzbyrtavsdlleq.supabase.co/storage/v1/object/public/Hago/hago.jpg'
  ],

  // Mã chim DEMO trong Supabase (không phải chim thật đang bán). Website gắn nhãn "Dữ liệu minh họa".
  // Khi đăng chim thật: xóa mã demo khỏi danh sách này (không cần sửa dữ liệu Supabase).
  demoBirdCodes: ['YP003', 'YP002', '001'],

  statusLabels: {
    available: { label: 'Đang tìm chủ', cls: 'st-available' },
    held:      { label: 'Đã giữ chỗ', cls: 'st-held' },
    sold:      { label: 'Đã có chủ', cls: 'st-sold' },
    watch:     { label: 'Đang theo dõi thêm', cls: 'st-watch' }
  }
};
