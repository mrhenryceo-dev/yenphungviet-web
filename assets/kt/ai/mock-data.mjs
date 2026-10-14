// Phase 1S — dữ liệu cho MOCK PROVIDER (không gọi AI thật, không chi phí).
// 1) SAMPLES: 3 bài mẫu do Claude (Claude Code) soạn sẵn ngày 2026-10-14, đối chiếu với các nguồn đã mở đọc được:
//    Australian Museum (Budgerigar), Wikipedia (Budgerigar; Polytetrafluoroethylene), Merck Veterinary Manual (Bird Owners).
//    Đây KHÔNG phải nội dung do AI provider tạo; mock trả về đúng các bài này khi tiêu đề trùng.
//    Ảnh trong bài: chưa có công cụ tạo ảnh → ô giữ chỗ có mô tả. Ảnh bìa dùng ảnh minh họa có sẵn của website.
// 2) Chủ đề khác → gói mô phỏng có ghi rõ "[MÔ PHỎNG]" để kiểm thử quy trình.
import { IDEAS, groupById } from './taxonomy.mjs';
import { fold } from './text.mjs';

const AM = { title: 'Budgerigar', publisher: 'Australian Museum', url: 'https://australian.museum/learn/animals/birds/budgerigar/' };
const WIKI = { title: 'Budgerigar', publisher: 'Wikipedia (bách khoa, nguồn thứ cấp)', url: 'https://en.wikipedia.org/wiki/Budgerigar' };
const WIKI_PTFE = { title: 'Polytetrafluoroethylene — mục ảnh hưởng tới chim', publisher: 'Wikipedia (bách khoa, nguồn thứ cấp)', url: 'https://en.wikipedia.org/wiki/Polytetrafluoroethylene' };
const MERCK_FEED = { title: 'Feeding a Pet Bird', publisher: 'Merck Veterinary Manual — Bird Owners', url: 'https://www.merckvetmanual.com/bird-owners/choosing-and-taking-care-of-a-pet-bird/feeding-a-pet-bird' };
const MERCK_ILL = { title: 'Illness in Pet Birds', publisher: 'Merck Veterinary Manual — Bird Owners', url: 'https://www.merckvetmanual.com/bird-owners/routine-care-and-safety-of-birds/illness-in-pet-birds' };
const MERCK_HAZ = { title: 'Household Hazards for Pet Birds', publisher: 'Merck Veterinary Manual — Bird Owners', url: 'https://www.merckvetmanual.com/bird-owners/routine-care-and-safety-of-birds/household-hazards-for-pet-birds' };

// Ảnh bìa lấy từ thư viện ảnh minh họa đã duyệt của website (assets/nhom-choi) — luôn gắn nhãn "Ảnh minh họa".
export const SAMPLE_COVERS = {
  'vong-doi': { path: '/assets/nhom-choi/ss-01-1130.webp', path_sm: '/assets/nhom-choi/ss-01-640.webp', w: 1130, h: 706, w_sm: 640, focus: { x: 50, y: 45 } },
  'sai-lam': { path: '/assets/nhom-choi/pet-01-1600.webp', path_sm: '/assets/nhom-choi/pet-01-800.webp', w: 1600, h: 1000, w_sm: 800, focus: { x: 60, y: 45 } },
  'trong-mai': { path: '/assets/nhom-choi/avi-01-910.webp', path_sm: '/assets/nhom-choi/avi-01-640.webp', w: 910, h: 569, w_sm: 640, focus: { x: 50, y: 40 } }
};

export const SAMPLES = [
  { key: 'vong-doi', pkg: {
    format: 'yp-kt-ai/1', group: 'nguoi-moi', topic: 'co-ban', layout: 'tap-chi',
    title: 'Vòng đời của chim Yến Phụng – Từ trứng đến trưởng thành',
    subtitle: 'Từ quả trứng nhỏ trong tổ đến một chú chim trưởng thành: những mốc phát triển người nuôi nên biết.',
    excerpt: 'Chim Yến Phụng lớn rất nhanh: chỉ khoảng hai tháng từ lúc nở đã có thể tự ăn. Bài viết đi qua từng giai đoạn — trứng, chim non trong tổ, rời tổ, cai sữa, chim tơ và trưởng thành.',
    seo_title: 'Vòng đời chim Yến Phụng: từ trứng đến trưởng thành',
    seo_description: 'Các mốc phát triển của Yến Phụng: thời gian ấp, chim non mở mắt, mọc lông, rời tổ, cai sữa, thay lông đầu đời và tuổi thọ — giải thích dễ hiểu.',
    cover: { prompt: 'A pair of budgerigars perched near a wooden nest box in a bright natural aviary', alt: 'Hai chú Yến Phụng đậu cạnh tổ gỗ trong khu nuôi nhiều cây xanh', caption: 'Ảnh minh họa.' },
    intro: 'Yến Phụng (budgerigar, *Melopsittacus undulatus*) là loài vẹt nhỏ có nguồn gốc từ vùng khô hạn của Úc. Ngoài tự nhiên, chúng sinh sản theo mùa mưa — khi cỏ kết hạt nhiều — và chim non lớn lên rất nhanh.\nHiểu vòng đời giúp người nuôi biết lúc nào chim còn cần bố mẹ, lúc nào có thể về nhà mới, và vì sao một chú chim non trông khác hẳn chim trưởng thành.',
    sections: [
      { heading: 'Trứng và thời gian ấp', kind: 'text',
        md: 'Chim mái thường đẻ **cách ngày một trứng**. Mỗi lứa thường có khoảng 4–8 trứng; ngoài tự nhiên, Australian Museum ghi nhận 6–8 trứng tròn, màu trắng, đẻ trong hốc cây.\nChim mái là bên ấp trứng. Thời gian ấp được các tài liệu ghi trong khoảng **18–21 ngày**, tùy nguồn và điều kiện nuôi. Vì trứng được đẻ cách ngày, các chim non trong cùng một tổ thường hơn kém nhau vài ngày tuổi.',
        image: { prompt: 'Close-up of several small white budgerigar eggs on wood shavings inside a nest box', alt: 'Những quả trứng nhỏ màu trắng trong tổ gỗ', caption: 'Trứng Yến Phụng nhỏ, tròn và màu trắng. Ảnh minh họa.' } },
      { heading: 'Những ngày đầu: chim non phụ thuộc hoàn toàn', kind: 'text',
        md: 'Chim non mới nở **trần trụi và chưa tự làm được gì**. Chúng hoàn toàn dựa vào chim bố mẹ để được giữ ấm và cho ăn.\nKhoảng **10 ngày tuổi**, mắt chim non bắt đầu mở và lớp lông tơ dần xuất hiện. Đây là giai đoạn nhạy cảm: nên hạn chế làm phiền tổ và để bố mẹ chăm con trong môi trường yên tĩnh.' },
      { heading: 'Tuần 3–4: mọc lông', kind: 'text',
        md: 'Khoảng **3 tuần tuổi**, lông thật bắt đầu phát triển rõ. Chim non trông "tròn" và đầy đặn hơn mỗi ngày, màu lông dần lộ ra theo màu và dòng của chúng.\nỞ giai đoạn này chim vẫn ở trong tổ và vẫn được bố mẹ mớm thức ăn.',
        image: { prompt: 'Young budgerigar chicks with emerging feathers huddled together in a nest box, soft light', alt: 'Chim non Yến Phụng đang mọc lông trong tổ', caption: 'Chim non vài tuần tuổi đang mọc lông. Ảnh minh họa.' } },
      { heading: 'Rời tổ ở khoảng tuần thứ 5', kind: 'text',
        md: 'Chim non thường **rời tổ ở khoảng 30–35 ngày tuổi**. Lúc này chúng đã có bộ lông gần đủ và tập bay, nhưng **vẫn được bố mẹ cho ăn thêm** một thời gian.\nNhững ngày đầu ra khỏi tổ, chim non còn vụng về và dễ hoảng — khu nuôi cần an toàn, có chỗ đậu thấp và thức ăn dễ tiếp cận.' },
      { heading: 'Cai sữa: tự ăn ở khoảng 6–8 tuần', kind: 'text',
        md: 'Theo các tài liệu, chim non thường **tự ăn hoàn toàn ở khoảng 6–8 tuần tuổi**. Đây là mốc quan trọng với người mua chim: một bé đã tự ăn ổn định sẽ dễ thích nghi với nhà mới hơn.',
        warning: { title: 'Không khuyến khích người mới tự đút bột', md: 'Chim non chưa cai sữa cần được bố mẹ chim hoặc người có kinh nghiệm chăm sóc. Người mới nuôi **không nên** nhận chim chưa tự ăn về để tự đút bột — rủi ro sặc và thiếu dinh dưỡng rất cao.' },
        image: { prompt: 'A young budgerigar eating seeds by itself from a shallow dish, natural light', alt: 'Chim Yến Phụng non đang tự ăn hạt', caption: 'Mốc tự ăn là lúc chim sẵn sàng hơn để về nhà mới. Ảnh minh họa.' } },
      { heading: 'Chim tơ: 3–4 tháng đầu đời', kind: 'text',
        md: 'Chim tơ khác chim trưởng thành ở vài điểm dễ thấy:\n- **Vằn đen trên trán kéo xuống sát cere** (phần da ở gốc mỏ trên). Các vằn này thường còn tới khoảng 3–4 tháng tuổi.\n- **Mắt tối màu**; ở chim trưởng thành, mống mắt có viền trắng hoặc vàng.\n- **Cere màu hồng** ở chim non.\nSau lần thay lông đầu đời, ngoại hình dần giống chim trưởng thành. Lưu ý: một số mutation (ví dụ Lutino, Albino) không có vằn trán như chim màu thường, nên các dấu hiệu trên không áp dụng cho mọi dòng.' },
      { heading: 'Trưởng thành và tuổi thọ', kind: 'text',
        md: 'Chim trưởng thành có kích thước khoảng 17–18 cm. Trong điều kiện nuôi, tuổi thọ trung bình được ghi nhận khoảng **7–8 năm**, và có những cá thể sống **trên 15 năm**. Chế độ ăn, môi trường sạch và việc theo dõi sức khỏe ảnh hưởng nhiều tới tuổi thọ.\nTrưởng thành về ngoại hình **không có nghĩa là đã sẵn sàng sinh sản**. Trước khi cho chim sinh sản, hãy tìm hiểu kỹ và hỏi người có kinh nghiệm.',
        table: { caption: 'Tóm tắt các mốc trong vòng đời (ước tính)', head: ['Giai đoạn', 'Thời điểm', 'Điều cần biết'], rows: [
          ['Đẻ trứng', 'Cách ngày một trứng', 'Mỗi lứa thường 4–8 trứng'], ['Ấp trứng', 'Khoảng 18–21 ngày', 'Chim mái ấp'],
          ['Mở mắt', 'Khoảng 10 ngày tuổi', 'Bắt đầu có lông tơ'], ['Mọc lông', 'Khoảng 3 tuần tuổi', 'Vẫn ở trong tổ'],
          ['Rời tổ', 'Khoảng 30–35 ngày', 'Vẫn được bố mẹ cho ăn'], ['Tự ăn', 'Khoảng 6–8 tuần', 'Mốc phù hợp để về nhà mới'],
          ['Chim tơ', 'Đến khoảng 3–4 tháng', 'Vằn trán, mắt tối, cere hồng'], ['Trưởng thành', 'Sau thay lông đầu đời', 'Tuổi thọ trung bình ~7–8 năm khi nuôi']] } }
    ],
    key_points: ['Thời gian ấp khoảng 18–21 ngày, tùy nguồn và điều kiện.', 'Chim non rời tổ khoảng 30–35 ngày và tự ăn ở khoảng 6–8 tuần.', 'Vằn trán, mắt tối và cere hồng là dấu hiệu chim còn non (trừ một số mutation).', 'Người mới không nên nhận chim chưa tự ăn để tự đút bột.'],
    warnings: [{ title: 'Các mốc thời gian chỉ là ước tính', md: 'Mỗi cá thể, dòng chim và điều kiện nuôi khác nhau. Các con số trong bài là khoảng thường gặp được tài liệu ghi nhận, không phải mốc cố định.' }],
    faq: [
      { q: 'Chim non bao lâu thì tự ăn được?', a: 'Thường ở khoảng 6–8 tuần tuổi. Hãy chọn bé đã tự ăn ổn định nếu bạn mới nuôi lần đầu.' },
      { q: 'Làm sao biết một bé Yến Phụng còn non?', a: 'Chim màu thường còn non thường có vằn đen trên trán kéo xuống sát cere, mắt tối màu và cere hồng. Một số mutation không có các dấu hiệu này, nên cần hỏi thêm người bán.' },
      { q: 'Yến Phụng sống được bao lâu?', a: 'Trong điều kiện nuôi, tuổi thọ trung bình được ghi nhận khoảng 7–8 năm; có cá thể sống trên 15 năm nếu được chăm sóc tốt.' }
    ],
    sources: [AM, WIKI],
    review_notes: [
      'Thời gian ấp: các nguồn ghi 18–21 ngày (Wikipedia có chỗ ghi khác nhau) — bài ghi khoảng 18–21 ngày.',
      'Số trứng mỗi lứa: Australian Museum ghi 6–8 (tự nhiên); Wikipedia ghi 4–8 — bài ghi 4–8 và nhắc số liệu tự nhiên.',
      'Câu "chim non trong tổ hơn kém nhau vài ngày tuổi" là suy luận từ việc đẻ cách ngày — chưa có trích dẫn trực tiếp.',
      'Chưa có nguồn đối chiếu cho tuổi bắt đầu sinh sản phù hợp → bài không nêu con số.',
      'Chưa đối chiếu với tài liệu Knowledge / MASTER LIST FINAL 4.2 (không có trên máy).'
    ] } },

  { key: 'sai-lam', pkg: {
    format: 'yp-kt-ai/1', group: 'nguoi-moi', topic: 'co-ban', layout: 'huong-dan',
    title: '7 sai lầm khi mới nuôi Yến Phụng và cách phòng tránh',
    subtitle: 'Những lỗi rất phổ biến ở người mới — và cách làm đúng ngay từ tuần đầu.',
    excerpt: 'Từ chọn chim chưa tự ăn, chỉ cho ăn hạt, đến đặt lồng gần bếp hay tự mua thuốc: 7 sai lầm thường gặp khi mới nuôi Yến Phụng và cách phòng tránh đơn giản.',
    seo_title: '7 sai lầm khi mới nuôi Yến Phụng và cách tránh',
    seo_description: 'Người mới nuôi Yến Phụng hay mắc 7 lỗi: chọn chim chưa tự ăn, chỉ cho ăn hạt, nước bẩn, lồng gần bếp, thả bay thiếu an toàn, ép làm quen, chủ quan khi chim bệnh.',
    cover: { prompt: 'A blue budgerigar perched calmly on a person\'s hand in a bright room with plants', alt: 'Chú Yến Phụng xanh dương đậu trên bàn tay người nuôi', caption: 'Ảnh minh họa.' },
    intro: 'Yến Phụng dễ nuôi nhưng không "tự lo" được. Phần lớn rắc rối của người mới đến từ vài thói quen tưởng như vô hại. Dưới đây là 7 sai lầm thường gặp nhất và cách phòng tránh — mỗi mục chỉ cần thay đổi nhỏ.',
    sections: [
      { heading: 'Chọn chim non chưa tự ăn để "dễ thuần"', kind: 'step',
        md: 'Nhiều người nghĩ chim càng nhỏ càng dễ thuần, vì vậy chọn bé còn phải đút bột. Thực tế, chim non thường **tự ăn hoàn toàn ở khoảng 6–8 tuần tuổi**; trước đó chúng cần bố mẹ chim hoặc người có kinh nghiệm.\n**Cách làm đúng:** chọn bé đã tự ăn ổn định. Sự gần gũi với người đến từ việc làm quen kiên nhẫn sau này, không phụ thuộc vào việc tự đút bột.',
        image: { prompt: 'A young budgerigar eating seeds independently from a dish in a clean cage', alt: 'Chim Yến Phụng non đã tự ăn hạt trong lồng', caption: 'Bé đã tự ăn ổn định sẽ dễ thích nghi hơn. Ảnh minh họa.' } },
      { heading: 'Chỉ cho ăn hạt', kind: 'step',
        md: 'Hạt là món chim rất thích, nhưng theo Merck Veterinary Manual, **hạt không nên chiếm phần lớn khẩu phần** vì nhiều chất béo và nghèo dưỡng chất.\n**Cách làm đúng:** kết hợp thức ăn viên dành cho chim cỡ nhỏ và **một ít rau, trái cây tươi mỗi ngày**. Đổi khẩu phần từ từ để chim quen. Tránh tuyệt đối **quả bơ** — được liệt kê là thực phẩm nguy hiểm cho chim.',
        image: { prompt: 'A small bowl with fresh leafy greens and a few seeds next to a budgerigar, natural daylight', alt: 'Chén rau xanh tươi và một ít hạt bên cạnh chim Yến Phụng', caption: 'Rau tươi là phần nhỏ nhưng quan trọng trong khẩu phần. Ảnh minh họa.' } },
      { heading: 'Quên thay nước mỗi ngày', kind: 'step',
        md: 'Chim hay nhúng thức ăn hoặc làm rơi phân vào chén nước. Nước để lâu nhanh bẩn và là nơi vi khuẩn phát triển.\n**Cách làm đúng:** luôn có **nước sạch** và **thay nước hằng ngày**. Bình nước dạng ống có thể giúp nước sạch lâu hơn chén hở.' },
      { heading: 'Đặt lồng gần bếp, khói và hóa chất', kind: 'step',
        md: 'Hệ hô hấp của chim rất nhạy. Khói và hơi hóa chất như **thuốc diệt côn trùng, nước hoa, bình xịt** đều là mối nguy. Đặc biệt, **dụng cụ chống dính (PTFE) khi bị đun quá nóng** có thể tạo khí độc gây chết chim.\n**Cách làm đúng:** đặt lồng xa bếp, nơi thoáng khí nhưng không có gió lùa trực tiếp; không xịt hóa chất gần chim.',
        image: { prompt: 'A budgerigar cage placed in a bright, airy living room far from the kitchen, plants nearby', alt: 'Lồng chim đặt ở phòng khách thoáng, xa khu bếp', caption: 'Vị trí lồng thoáng, xa bếp và hóa chất. Ảnh minh họa.' } },
      { heading: 'Thả bay trong nhà khi chưa kiểm tra an toàn', kind: 'step',
        md: 'Thả chim bay giúp chim vận động, nhưng trong nhà có nhiều nguy hiểm: chim có thể **chết đuối** khi rơi vào bồn cầu, bồn rửa, chậu nước mở; **va vào quạt trần, cửa sổ hoặc cửa đang mở**.\n**Cách làm đúng:** trước khi thả, đóng cửa, tắt quạt trần, đậy bồn cầu và các vật chứa nước, luôn có người trông.' },
      { heading: 'Ép làm quen quá nhanh', kind: 'step',
        md: 'Chụp bắt hoặc cố cầm chim ngay khi vừa về nhà dễ khiến chim sợ người lâu dài.\n**Cách làm đúng:** cho chim vài ngày làm quen với lồng và tiếng động trong nhà; nói chuyện nhẹ nhàng, đưa tay chậm và để **chim tự tiến lại gần**. Mỗi bé có tốc độ riêng.' },
      { heading: 'Chủ quan khi chim có dấu hiệu bệnh — hoặc tự mua thuốc', kind: 'step',
        md: 'Ngoài tự nhiên, chim **che giấu dấu hiệu bệnh** để không bị coi là yếu. Vì vậy khi người nuôi nhận ra, bệnh thường đã không còn nhẹ. Các dấu hiệu cần chú ý: **xù lông**, **ngủ nhiều hơn bình thường và nhắm mắt**, **phân thay đổi**, **ăn hoặc uống nhiều/ít bất thường**, yếu, mất thăng bằng, khó thở.\n**Cách làm đúng:** khi thấy các dấu hiệu này, đưa chim đến **bác sĩ thú y có kinh nghiệm về chim**. Không tự mua thuốc theo lời truyền miệng.',
        warning: { title: 'Bài viết không thay thế việc khám thú y', md: 'Nội dung chỉ giúp nhận biết dấu hiệu bất thường. Chẩn đoán và điều trị cần bác sĩ thú y.' } }
    ],
    key_points: ['Chọn chim đã tự ăn ổn định.', 'Hạt không nên là phần lớn khẩu phần; thêm rau tươi mỗi ngày.', 'Thay nước hằng ngày.', 'Lồng xa bếp, khói, hóa chất.', 'Kiểm tra an toàn trước khi thả bay.', 'Làm quen kiên nhẫn.', 'Có dấu hiệu bệnh → gặp bác sĩ thú y.'],
    warnings: [],
    faq: [
      { q: 'Chim mới về không ăn có sao không?', a: 'Chim có thể ăn ít trong một hai ngày đầu vì lạ chỗ. Nếu chim gần như không ăn, xù lông hoặc ngủ nhiều, hãy liên hệ bác sĩ thú y sớm.' },
      { q: 'Có nên cho chim ăn trái cây mỗi ngày?', a: 'Một lượng nhỏ rau và trái cây tươi mỗi ngày là tốt, nhưng tránh quả bơ và các thực phẩm không phù hợp cho chim.' },
      { q: 'Bao lâu thì chim quen người?', a: 'Tùy từng bé — có bé vài tuần, có bé lâu hơn. Kiên nhẫn và nhẹ nhàng quan trọng hơn tốc độ.' }
    ],
    sources: [MERCK_FEED, MERCK_ILL, MERCK_HAZ, WIKI_PTFE, WIKI],
    review_notes: [
      'Mục PTFE: Merck (Household Hazards) không nhắc PTFE; thông tin lấy từ Wikipedia (dẫn nghiên cứu năm 1973 về khí từ PTFE đun 280 °C gây chết vẹt).',
      'Mục "ép làm quen quá nhanh" là kinh nghiệm nuôi phổ biến, chưa có nguồn trích dẫn trực tiếp.',
      'Merck không nêu tỉ lệ thức ăn viên cụ thể → bài không đưa tỉ lệ.',
      'Chưa đối chiếu với tài liệu Knowledge / MASTER LIST FINAL 4.2 (không có trên máy).'
    ] } },

  { key: 'trong-mai', pkg: {
    format: 'yp-kt-ai/1', group: 'hoi-dap', topic: 'gioi-tinh-nhan-dang', layout: 'so-sanh',
    title: 'Phân biệt Yến Phụng trống mái theo độ tuổi và mutation',
    subtitle: 'Màu cere là dấu hiệu hữu ích nhưng dễ nhầm — nhất là ở chim non và ở một số mutation.',
    excerpt: 'Cere xanh là trống, cere nâu là mái? Không hẳn. Bài viết giải thích dấu hiệu cere theo độ tuổi, những mutation dễ gây nhầm và vì sao xét nghiệm DNA là cách xác định chắc chắn.',
    seo_title: 'Phân biệt Yến Phụng trống mái theo tuổi và mutation',
    seo_description: 'Cách đọc màu cere Yến Phụng theo độ tuổi, các mutation dễ gây nhầm (Lutino, Albino, Recessive Pied, Dark-Eyed Clear) và khi nào cần xét nghiệm DNA.',
    cover: { prompt: 'Several budgerigars of different colours perched in a large planted aviary', alt: 'Nhiều chú Yến Phụng nhiều màu trong khu nuôi AVI', caption: 'Ảnh minh họa — không dùng để xác định giới tính.' },
    intro: 'Câu hỏi người mua chim hay đặt nhất là "bé này trống hay mái?". Với Yến Phụng trưởng thành màu thường, màu **cere** — phần da ở gốc mỏ trên — thường cho gợi ý khá rõ. Nhưng ở chim non và ở một số mutation, dấu hiệu này **dễ gây nhầm**.\nBài viết này giúp bạn đọc dấu hiệu đúng cách — và biết khi nào **không nên kết luận**.',
    sections: [
      { heading: 'Cere là gì?', kind: 'compare',
        md: 'Cere là vùng da nhỏ ở gốc mỏ trên, nơi có hai lỗ mũi. Màu và độ mịn của cere thay đổi theo **tuổi**, **giới tính**, **trạng thái sinh sản** và **mutation** của chim.',
        image: { prompt: 'Close-up portrait of a budgerigar head in profile showing the cere above the beak, neutral background', alt: 'Cận cảnh đầu chim Yến Phụng cho thấy vị trí cere phía trên mỏ', caption: 'Vị trí cere. Ảnh minh họa — không dùng để xác định giới tính.' } },
      { heading: 'Chim non: dấu hiệu còn mờ', kind: 'compare',
        md: 'Chim non có **cere màu hồng**. Theo các tài liệu, chim trống non thường có cere **hồng tím đều màu**, còn chim mái non có thể có **vệt trắng phấn quanh lỗ mũi**.\nĐây chỉ là **xu hướng**, không phải quy luật: nhiều bé non rất khó phân biệt, và ánh sáng hay góc chụp làm màu cere trông khác đi.' },
      { heading: 'Chim trưởng thành màu thường', kind: 'compare',
        md: 'Ở Yến Phụng trưởng thành màu thường (ví dụ Normal Light Green, Normal Sky Blue):\n- **Trống** thường có cere **xanh dương** (từ xanh nhạt đến xanh đậm, có khi ánh tím).\n- **Mái** thường có cere **trắng ngà hoặc nâu nhạt** ngoài mùa sinh sản, và **nâu đậm, sần** khi vào mùa sinh sản. Có tài liệu ghi chim mái ngoài mùa sinh sản có thể có cere **xanh rất nhạt** — dễ nhầm với trống.',
        table: { caption: 'So sánh dấu hiệu cere (tham khảo)', head: ['Nhóm chim', 'Thường gặp ở trống', 'Thường gặp ở mái', 'Độ tin cậy'], rows: [
          ['Chim non (vằn trán còn sát cere)', 'Hồng tím đều màu', 'Hồng nhạt, có vệt trắng quanh lỗ mũi', 'Thấp — dễ nhầm'],
          ['Trưởng thành, màu thường', 'Xanh dương', 'Trắng ngà / nâu nhạt; nâu đậm khi sinh sản', 'Khá — vẫn có ngoại lệ'],
          ['Lutino, Albino, Dark-Eyed Clear, Recessive Pied', 'Thường giữ màu hồng tím suốt đời', 'Trắng / nâu như mái thường', 'Thấp — cần hỏi thêm hoặc xét nghiệm']] } },
      { heading: 'Mutation nào dễ gây nhầm?', kind: 'compare',
        md: 'Với một số mutation, chim trống **không chuyển cere sang xanh** mà **giữ màu hồng tím** như lúc còn non. Các tài liệu nêu rõ nhóm này gồm **Lutino**, **Albino**, **Dark-Eyed Clear (DEC)** và **Recessive Pied / Danish Pied**.\nVới các bé thuộc nhóm này, cere hồng tím **không có nghĩa** chim còn non hay là mái. Cũng cần nhớ: màu lông cho biết mutation **đang biểu hiện**, nhưng **không thể** cho biết chim mang gene ẩn (split) nào — điều đó chỉ biết qua phả hệ hoặc kết quả phối giống. Với những mutation khác trong danh mục, màu cere cũng có thể khác chim màu thường — nếu không chắc, hãy hỏi người bán về dòng của chim.' },
      { heading: 'Hành vi: chỉ để tham khảo thêm', kind: 'compare',
        md: 'Người nuôi thường kể chim trống hay hót, gật đầu và "tán tỉnh" nhiều hơn, còn chim mái hay gặm phá và tìm chỗ làm tổ. Tuy vậy, hành vi khác nhau rất nhiều giữa các cá thể — **chỉ nên xem là gợi ý phụ**, không đủ để kết luận.' },
      { heading: 'Cách chắc chắn nhất: xét nghiệm DNA', kind: 'compare',
        md: 'Khi cần biết chắc giới tính — ví dụ để ghép cặp sinh sản — cách đáng tin cậy là **xét nghiệm DNA** từ mẫu lông hoặc máu, thực hiện qua phòng khám thú y hoặc phòng xét nghiệm.\nVới chim non hoặc chim thuộc các mutation dễ nhầm, người bán có trách nhiệm sẽ nói rõ mức độ chắc chắn thay vì khẳng định.' }
    ],
    key_points: ['Màu cere là dấu hiệu tham khảo, thay đổi theo tuổi, mùa sinh sản và mutation.', 'Chim non rất khó phân biệt chính xác.', 'Trống Lutino, Albino, DEC, Recessive Pied thường giữ cere hồng tím suốt đời.', 'Cần chắc chắn → xét nghiệm DNA.'],
    warnings: [{ title: 'Không kết luận giới tính chắc chắn từ ảnh', md: 'Ánh sáng, góc chụp và chỉnh màu làm cere trông khác đi. Đừng dựa vào một bức ảnh để kết luận trống hay mái. Ảnh minh họa trong bài không dùng làm bằng chứng giới tính.' }],
    faq: [
      { q: 'Bé nhà tôi cere hồng tím, là trống hay mái?', a: 'Có thể là chim non, hoặc chim trống thuộc nhóm mutation giữ cere hồng tím (như Lutino, Albino, DEC, Recessive Pied). Không đủ để kết luận — nếu cần chắc chắn, hãy xét nghiệm DNA.' },
      { q: 'Bao nhiêu tuổi thì nhìn cere rõ hơn?', a: 'Sau lần thay lông đầu đời (khoảng 3–4 tháng tuổi trở đi), dấu hiệu ở chim màu thường thường rõ hơn, nhưng vẫn có ngoại lệ.' },
      { q: 'Chim mái có thể có cere xanh không?', a: 'Có tài liệu ghi nhận chim mái ngoài mùa sinh sản có cere xanh rất nhạt. Vì vậy cere xanh nhạt chưa chắc là trống.' }
    ],
    sources: [WIKI, AM],
    review_notes: [
      'Danh sách mutation giữ cere hồng tím (Lutino, Albino, DEC, Recessive Pied) theo Wikipedia; tên viết theo MASTER LIST Phase 1B (data/catalogue.js #16, #18, #19, #36).',
      'Australian Museum ghi chim mái ngoài mùa sinh sản có cere "light blue"; Wikipedia ghi "pale brownish/white" — bài nêu cả hai.',
      'Mục hành vi trống/mái và mục xét nghiệm DNA: kiến thức phổ biến, chưa có trích dẫn trực tiếp trong các nguồn đã mở.',
      'Chưa đối chiếu Fallow và các mutation khác → bài không liệt kê.',
      'Chưa đối chiếu với tài liệu Knowledge / MASTER LIST FINAL 4.2 (không có trên máy).'
    ] } }
];

export function sampleFor(title) {
  const f = fold(title);
  return SAMPLES.find(s => fold(s.pkg.title) === f) || null;
}

// Gói mô phỏng cho chủ đề không có bài mẫu — đủ cấu trúc để kiểm thử dàn trang, QA, ảnh, duyệt.
export function mockArticle({ title = 'Chủ đề thử nghiệm', group = 'nguoi-moi' } = {}) {
  const s = sampleFor(title); if (s) return JSON.parse(JSON.stringify(s.pkg));
  const g = groupById(group) || groupById('nguoi-moi');
  const P = n => `[MÔ PHỎNG — chưa phải nội dung thật] Đoạn ${n} cho bài "${title}". Văn bản giữ chỗ để kiểm thử bố cục, mục lục và quy trình duyệt.`;
  return {
    format: 'yp-kt-ai/1', group: g.id, topic: g.topic, layout: g.layout,
    title: `[MÔ PHỎNG] ${title}`.slice(0, 140), subtitle: 'Bài mô phỏng do mock provider tạo — không xuất bản.',
    excerpt: 'Nội dung mô phỏng để kiểm thử Xưởng nội dung AI.', seo_title: `[MÔ PHỎNG] ${title}`.slice(0, 70),
    seo_description: 'Bài mô phỏng do mock provider tạo để kiểm thử quy trình tạo bài, dàn trang và duyệt của YẾN PHỤNG PET.',
    cover: { prompt: `mock cover for ${title}`, alt: `Ảnh giữ chỗ cho bài ${title}`, caption: '[MÔ PHỎNG] Ảnh giữ chỗ.' },
    intro: P(1),
    sections: [1, 2, 3, 4].map(i => ({ heading: `Phần ${i}`, kind: 'text', md: `${P(i + 1)}\n- Ý A\n- Ý B`,
      image: i % 2 ? { prompt: `mock image ${i} for ${title}`, alt: `Ảnh giữ chỗ ${i}`, caption: '[MÔ PHỎNG] Ảnh giữ chỗ.' } : null })),
    key_points: ['[MÔ PHỎNG] Ý chính 1', '[MÔ PHỎNG] Ý chính 2'], warnings: [],
    faq: [{ q: '[MÔ PHỎNG] Câu hỏi?', a: '[MÔ PHỎNG] Trả lời.' }],
    sources: [{ title: '[MÔ PHỎNG] Nguồn giữ chỗ — cần thay bằng nguồn thật', url: '', publisher: '' }],
    review_notes: ['Đây là bài MÔ PHỎNG từ mock provider — không phải nội dung thật, không được xuất bản.']
  };
}
export function mockRevise({ pkg, note }) {
  const p = JSON.parse(JSON.stringify(pkg));
  p.review_notes = [...(p.review_notes || []), `[MÔ PHỎNG] Đã "sửa" theo góp ý: ${String(note).slice(0, 200)}`];
  p.subtitle = clipNote(p.subtitle, note);
  return p;
}
const clipNote = (s, note) => `${s || ''}`.slice(0, 160) + (note ? ' (đã cập nhật theo góp ý)' : '');
export function mockIdeas({ groups = [], count = 8 } = {}) {
  const pick = IDEAS.filter(i => !groups.length || groups.includes(i.group)).slice(0, count);
  return { ideas: pick.map(i => ({ title: i.title, group: i.group, angle: 'Gợi ý có sẵn trong danh mục (mock).', why: 'Chủ đề người nuôi hay hỏi.' })) };
}
