// Phase 1S — danh mục nội dung cho Xưởng nội dung AI.
// 7 NHÓM biên tập (theo OWNER) → ánh xạ vào 6 CHỦ ĐỀ có sẵn của kt_articles (không đổi schema).
// IDEAS: danh sách ý tưởng gợi ý sẵn (dùng cho mock provider và làm "hạt giống" cho AI thật).
// Mỗi ý tưởng có cờ rủi ro chuyên môn → bộ kiểm tra chất lượng áp quy tắc chặt hơn.

export const GROUPS = [
  { id: 'nguoi-moi',  name: 'Kiến thức cho người mới',            topic: 'co-ban',            layout: 'chuan' },
  { id: 'doi-song',   name: 'Đời sống và hành vi Yến Phụng',      topic: 'co-ban',            layout: 'tap-chi' },
  { id: 'genetics',   name: 'Mutation, phenotype và genetics',    topic: 'sinh-san-genetics', layout: 'so-sanh' },
  { id: 'cham-soc',   name: 'Chăm sóc, dinh dưỡng và sức khỏe',   topic: 'cham-soc-suc-khoe', layout: 'huong-dan' },
  { id: 'sinh-san',   name: 'Sinh sản và chăm sóc chim non',      topic: 'sinh-san-genetics', layout: 'huong-dan' },
  { id: 'hoi-dap',    name: 'Giải đáp thắc mắc thường gặp',       topic: 'co-ban',            layout: 'hoi-dap' },
  { id: 'ban-chim',   name: 'Hỗ trợ bán chim có trách nhiệm',     topic: 'co-ban',            layout: 'chuan' }
];
export const groupById = id => GROUPS.find(g => g.id === id) || null;

// Cờ rủi ro → quy tắc bắt buộc của OWNER (xem qa.mjs)
export const RISK = {
  sex: 'Giới tính: không kết luận chắc chắn khi thiếu dấu hiệu; không dùng ảnh làm bằng chứng',
  genetics: 'Genetics: không suy gene ẩn (split) từ phenotype',
  vet: 'Sức khỏe: không đưa liều thuốc / chẩn đoán; khuyên gặp bác sĩ thú y chim',
  handfeed: 'Chim non: không khuyến khích người mới tự đút bột chim chưa cai sữa',
  sale: 'Bán chim: không hứa hẹn giới tính / sức khỏe / tuổi thọ'
};

// Ý tưởng hạt giống — tiêu đề viết sẵn bằng tiếng Việt, đã tránh trùng 25 bài Cẩm nang hiện có.
export const IDEAS = [
  { group: 'nguoi-moi', title: 'Vòng đời của chim Yến Phụng – Từ trứng đến trưởng thành', risk: [] },
  { group: 'nguoi-moi', title: '7 sai lầm khi mới nuôi Yến Phụng và cách phòng tránh', risk: ['handfeed', 'vet'] },
  { group: 'nguoi-moi', title: 'Đọc hiểu ngôn ngữ cơ thể của Yến Phụng trong tuần đầu', risk: [] },
  { group: 'doi-song', title: 'Yến Phụng ngoài tự nhiên sống như thế nào ở Úc?', risk: [] },
  { group: 'doi-song', title: 'Vì sao Yến Phụng thích sống theo đàn?', risk: [] },
  { group: 'doi-song', title: 'Tiếng hót và khả năng bắt chước âm thanh của Yến Phụng', risk: ['sex'] },
  { group: 'genetics', title: 'Phenotype và genotype: vì sao không thể nhìn màu đoán gene ẩn', risk: ['genetics'] },
  { group: 'genetics', title: 'Mutation trội, lặn và liên kết giới tính – giải thích dễ hiểu', risk: ['genetics', 'sex'] },
  { group: 'genetics', title: 'Opaline, Cinnamon, Spangle: nhận diện các mutation phổ biến', risk: ['genetics'] },
  { group: 'cham-soc', title: 'Lịch chăm sóc Yến Phụng theo mùa ở Việt Nam', risk: ['vet'] },
  { group: 'cham-soc', title: 'Thay lông ở Yến Phụng: bình thường hay bất thường?', risk: ['vet'] },
  { group: 'cham-soc', title: 'Chuẩn bị tủ đồ sơ cứu cơ bản và khi nào cần gặp bác sĩ thú y', risk: ['vet'] },
  { group: 'sinh-san', title: 'Chuẩn bị cho một cặp Yến Phụng sinh sản lần đầu', risk: ['handfeed', 'vet'] },
  { group: 'sinh-san', title: 'Theo dõi chim non trong tổ: mốc phát triển từng tuần', risk: ['handfeed'] },
  { group: 'sinh-san', title: 'Khi nào nên cho cặp chim nghỉ đẻ?', risk: ['vet'] },
  { group: 'hoi-dap', title: 'Phân biệt Yến Phụng trống mái theo độ tuổi và mutation', risk: ['sex', 'genetics'] },
  { group: 'hoi-dap', title: '10 câu hỏi thường gặp về tuổi thọ và sức khỏe Yến Phụng', risk: ['vet'] },
  { group: 'hoi-dap', title: 'Yến Phụng có nói được không? Những điều cần biết', risk: ['sex'] },
  { group: 'ban-chim', title: 'Cách chọn một bé Yến Phụng khỏe mạnh khi mua', risk: ['sale', 'sex'] },
  { group: 'ban-chim', title: 'Những câu nên hỏi người bán trước khi đón chim về', risk: ['sale'] },
  { group: 'ban-chim', title: 'Vì sao trại không cam kết giới tính chim non?', risk: ['sale', 'sex'] }
];

// 25 bài Cẩm nang đang có trên trang chủ (data/guides.js) — dùng chống trùng + liên kết nội bộ /#cam-nang/<id>.
export const GUIDES = [
  ['chon-non-hay-tu-an', 'Người mới nên chọn chim non hay chim đã tự ăn?'], ['mot-con-hay-mot-cap', 'Nên nuôi một con hay một cặp?'],
  ['chuan-bi-truoc-khi-don', 'Cần chuẩn bị gì trước khi đón chim về?'], ['bay-ngay-dau', 'Bảy ngày đầu tiên sau khi đón chim về'],
  ['yen-phung-an-gi', 'Yến Phụng ăn gì?'], ['thuc-pham-khong-nen-an', 'Những thực phẩm không nên cho chim ăn'],
  ['san-cat-tieu-hoa', 'Chim có cần ăn sạn hoặc cát tiêu hóa không?'], ['nuoc-uong-thay-bao-lau', 'Nước uống cho chim phải thay bao lâu một lần?'],
  ['chon-long', 'Chọn lồng như thế nào?'], ['bo-tri-cau-dau', 'Cách bố trí cầu đậu trong lồng'], ['dat-long-o-dau', 'Đặt lồng chim ở đâu trong nhà?'],
  ['ngu-va-che-ao-long', 'Chim cần ngủ bao nhiêu và che áo lồng thế nào?'], ['tam-cho-chim', 'Có cần tắm cho Yến Phụng không?'],
  ['ve-sinh-long', 'Vệ sinh lồng chim đúng cách'], ['lam-quen-bot-so', 'Cách làm quen để chim bớt sợ người'],
  ['tha-bay-trong-nha', 'Khi nào có thể thả chim bay trong nhà?'], ['do-choi-phu-hop', 'Đồ chơi nào phù hợp với Yến Phụng?'],
  ['guong-trong-long', 'Có nên đặt gương trong lồng?'], ['dau-hieu-khoe-manh', 'Dấu hiệu nhận biết một bé chim khỏe mạnh'],
  ['dau-hieu-benh', 'Những dấu hiệu chim đang bị bệnh'], ['chim-bo-an', 'Làm gì khi chim bỏ ăn?'],
  ['tu-mua-thuoc', 'Có nên tự mua thuốc điều trị cho chim?'], ['nuoi-chung-ngay', 'Chim mới mua có nên nuôi chung ngay không?'],
  ['sinh-san-ngay-khong', 'Có nên cho Yến Phụng sinh sản ngay không?'], ['checklist-hang-ngay', 'Checklist chăm sóc Yến Phụng mỗi ngày']
].map(([id, title]) => ({ id, title, url: `/#cam-nang/${id}` }));
