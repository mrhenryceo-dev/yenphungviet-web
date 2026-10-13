// Phase 1R — cấu hình dùng chung cho "Kiến thức chuyên sâu" (chạy được cả trong trình duyệt và Node).
// Chỉ chứa thông tin CÔNG KHAI (URL + anon key giống assets/js/config.js). Không bao giờ đặt service_role ở đây.

export const KT = {
  siteUrl: 'https://yenphungviet.vercel.app',
  brand: 'YẾN PHỤNG PET',
  sectionName: 'KIẾN THỨC CHUYÊN SÂU',
  basePath: '/kien-thuc/',
  phone: '0967653899',
  zaloUrl: 'https://zalo.me/0967653899',
  supabaseUrl: 'https://bnumqtjzbyrtavsdlleq.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJudW1xdGp6YnlydGF2c2RsbGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTk1NjMsImV4cCI6MjA5NTg3NTU2M30.-Hhyqfe366_Xn8ECav4pg8MWWHJn_o_wsuh-OfI7HHo',
  bucket: 'kien-thuc',
  topics: [
    { id: 'co-ban',              name: 'Kiến thức cơ bản',      icon: '📘' },
    { id: 'gioi-tinh-nhan-dang', name: 'Giới tính & nhận dạng', icon: '🔎' },
    { id: 'dinh-duong',          name: 'Dinh dưỡng',            icon: '🌾' },
    { id: 'cham-soc-suc-khoe',   name: 'Chăm sóc & sức khỏe',   icon: '🩺' },
    { id: 'sinh-san-genetics',   name: 'Sinh sản & genetics',   icon: '🧬' },
    { id: 'avi-moi-truong',      name: 'AVI & môi trường nuôi', icon: '🌿' }
  ]
};

export const topicName = id => (KT.topics.find(t => t.id === id) || { name: 'Kiến thức' }).name;
