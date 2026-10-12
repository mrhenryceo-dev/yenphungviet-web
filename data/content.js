// Chữ hiển thị của các section trên homepage.
// Chỉ dùng nội dung đã được duyệt / đã có trong cẩm nang. Không thêm claim mới
// (nguồn gốc, sức khỏe, bảo hành, vận chuyển…) khi OWNER chưa quyết định.

const CONTENT = {
  hero: {
    lead: 'Chọn nhóm chim phù hợp với bạn và nhắn Zalo cho Ji để nhận video thực tế của các bé đang có trước khi chốt.'
  },

  birds: {
    title: 'Chim Đang Có Tại Trại',
    lead: 'Bấm "Nhắn Zalo về bé này" để nhận video thực tế của bé, hoặc "Xem chi tiết" để xem thêm thông tin.',
    infoNote: 'Thông tin chưa có sẽ không hiển thị. Bạn có thể hỏi thêm qua Zalo.',
    // Ghi chú minh bạch về ảnh — hiển thị gần danh sách chim và trong chi tiết bé.
    visualNote: 'Ảnh trên website mang tính minh họa. Nhắn mã bé qua Zalo để nhận video thực tế trước khi chốt.',
    homeLimit: 6,
    demoLabel: 'Dữ liệu minh họa',
    demoRedirect: 'Hồ sơ mẫu đã ngừng hiển thị — mời bạn xem 3 nhóm chim tại trại.',
    demoNote: 'Các bé có nhãn "Dữ liệu minh họa" chỉ là dữ liệu mẫu để trình bày website, không phải chim đang bán. Nhắn Zalo để hỏi các bé đang có tại trại.'
  },

  // "Các nhóm chim tại trại" (Phase 1L) — nội dung OWNER duyệt. Thay cho lưới chim trên homepage.
  // Giá: chỉ nhóm Đút bột có khoảng giá do OWNER cung cấp. Chim tơ / sinh sản KHÔNG ghi số tiền.
  // Ảnh: ảnh minh họa (AI), không phải ảnh chim thật tại trại, không đại diện cho bé cụ thể.
  // tone: màu nhấn của thẻ (orange | blue | green). zaloMsg: câu được copy trước khi mở Zalo.
  groups: {
    eyebrow: 'Chim tại trại',
    title: 'Chim đang bán tại trại',
    lead: 'Trại cung cấp 3 nhóm chim với độ tuổi và mục đích nuôi khác nhau. Chọn nhóm phù hợp với bạn rồi nhắn Zalo để được tư vấn và xem các bé đang có.',
    note: 'Ảnh trong 3 thẻ là ảnh minh họa, không phải ảnh chim thật tại trại và không đại diện cho một bé cụ thể. Nhắn Zalo để nhận video thực tế của các bé đang có.',
    items: [
      {
        id: 'dut-bot', tone: 'orange', name: 'Chim đút bột',
        image: 'assets/groups/group-dut-bot.webp', width: 402, height: 226,
        alt: 'Ảnh minh họa hai chim Yến Phụng non trong ổ',
        meta: 'Khoảng 15–20 ngày tuổi (tham khảo, còn phụ thuộc chim bố mẹ)',
        priceLabel: 'Giá tham khảo tại trại', price: '500.000–800.000đ/con', priceTag: 'tùy cá thể',
        points: [
          'Cần chăm sóc đặc biệt, dành cho người đã có kinh nghiệm chăm chim non.',
          'Có thể gắn bó với người chăm sóc khi được nuôi và tương tác phù hợp, nhưng không bảo đảm sẽ quấn chủ.'
        ],
        warning: 'Chim chưa tự ăn. Đút bột sai kỹ thuật có thể gây nguy hiểm đến tính mạng của chim. Không khuyến khích người mới mua chim chưa cai sữa.',
        cta: 'Tư vấn chim non qua Zalo',
        zaloMsg: 'Mình muốn được tư vấn về chim non (chim đút bột).'
      },
      {
        id: 'chim-to', tone: 'blue', name: 'Chim tơ',
        image: 'assets/groups/group-chim-to.webp', width: 448, height: 238,
        alt: 'Ảnh minh họa bốn chim Yến Phụng tơ đậu trên cành',
        meta: 'Đã tách mẹ, tự ăn uống ổn định và biết bay',
        priceLabel: 'Giá', price: 'Theo từng cá thể', priceTag: 'màu sắc & Level Catalogue',
        points: [
          'Phù hợp nuôi cảnh hoặc nuôi trong aviary được bố trí an toàn.',
          'Dễ chăm sóc hơn chim chưa cai sữa, phù hợp hơn với người mới.'
        ],
        cta: 'Xem chim tơ đang có',
        zaloMsg: 'Mình muốn xem các bé chim tơ đang có.'
      },
      {
        id: 'sinh-san', tone: 'green', name: 'Chim sinh sản',
        image: 'assets/groups/group-sinh-san.webp', width: 464, height: 238,
        alt: 'Ảnh minh họa một cặp chim Yến Phụng trưởng thành',
        meta: 'Trống mái đã trưởng thành hoặc gần tuổi sinh sản, tùy cá thể',
        priceLabel: 'Giá', price: 'Theo từng cặp', priceTag: 'màu sắc, Level & dữ liệu thực tế',
        points: [
          'Trại có thể tư vấn lựa chọn chim và cặp ghép phù hợp.',
          'Khả năng sinh sản phụ thuộc độ tuổi, sức khỏe, tương thích cặp, dinh dưỡng và môi trường.'
        ],
        caution: 'Không cam kết mua về sẽ đẻ ngay.',
        cta: 'Tư vấn cặp sinh sản',
        zaloMsg: 'Mình muốn được tư vấn chọn cặp chim sinh sản.'
      }
    ]
  },

  // "Cách nhận chim" — website để xem & chọn; video thực tế của đúng bé được gửi qua Zalo trước khi chốt.
  // Không thêm đặt cọc, phí ship, thời gian giao, bảo hành, đổi trả… cho tới khi OWNER có chính sách.
  steps: [
    { title: 'Chọn nhóm chim trên website', text: 'Xem 3 nhóm chim tại trại và chọn nhóm phù hợp với bạn.' },
    { title: 'Nhắn Zalo cho Ji', text: 'Nhắn nhóm chim bạn quan tâm cho Ji qua Zalo (hoặc gọi điện).' },
    { title: 'Xem video thực tế của bé', text: 'Ji gửi video hiện tại của các bé đang có để bạn xem và chọn.' },
    { title: 'Xác nhận thông tin và cách nhận', text: 'Hai bên xác nhận thông tin của bé, giá và cách nhận chim.' },
    { title: 'Chốt bé', text: 'Khi bạn đã hài lòng với bé qua video, hai bên chốt bé.' }
  ],
  stepsNote: 'Các chi tiết khác về cách nhận chim sẽ được trao đổi trực tiếp qua Zalo.',

  // "Yến Phụng có hợp với bạn?" — tóm tắt từ cẩm nang/FAQ đã có. Không có số liệu.
  fit: {
    intro: 'Yến Phụng (Budgerigar) là một loài vẹt nhỏ, thường được nuôi làm chim cảnh trong nhà. Vài điều nên biết trước khi đón bé về:',
    cards: [
      { title: 'Tiếng kêu', text: 'Yến Phụng có hót và gọi nhau vào ban ngày, nhưng tiếng nhỏ hơn nhiều so với các loài vẹt lớn.' },
      { title: 'Chăm sóc mỗi ngày', text: 'Thay nước sạch, kiểm tra thức ăn, quan sát phân và để bé ở nơi yên tĩnh, không gió lùa. Chỉ mất vài phút.' },
      { title: 'Nuôi một con hay một cặp', text: 'Một con hợp khi bạn có thời gian tương tác mỗi ngày. Nếu thường xuyên vắng nhà, một cặp giúp các bé có bạn đồng loại.' },
      { title: 'Người mới nên chọn bé nào', text: 'Nên ưu tiên bé đã tự ăn ổn định, hoạt bát. Chim còn non cần đút bột và dễ gặp rủi ro nếu chăm chưa đúng cách.' }
    ]
  },

  // Hậu trường: chỉ dùng khi OWNER có nội dung THẬT tại trại (hiện đang tắt trong config).
  farm: {
    title: 'Hậu trường',
    lead: 'Hình ảnh thật tại trại ở Di Linh – Lâm Đồng.'
  },

  // Catalogue "50 màu & dòng" (Phase 1B). Chỉ mô tả hệ thống phân loại — KHÔNG có mô tả
  // di truyền/kiểu hình cho từng mục (chưa có nội dung được duyệt).
  catalogue: {
    navLabel: 'Màu & dòng',
    eyebrow: 'Khám phá Yến Phụng',
    title: '50 màu & dòng Yến Phụng',
    teaserBody: 'Bộ catalogue trực quan của YẾN PHỤNG PET gồm 5 Level, mỗi Level 10 màu & dòng — giúp bạn làm quen với các màu, đột biến (mutation) và tổ hợp của Yến Phụng.',
    teaserLevelNote: 'Level là cách phân nhóm của YẾN PHỤNG PET — không phải thứ hạng chất lượng, độ hiếm hay giá.',
    cta: 'Khám phá 50 màu & dòng',
    pageSubtitle: 'Catalogue trực quan giúp bạn xem và làm quen với các màu, đột biến (mutation) và tổ hợp của chim Yến Phụng. 50 màu & dòng được chia thành 5 Level, mỗi Level 10 mục.',
    levelTitle: 'Level là gì?',
    // Bản tóm tắt luôn hiển thị; phần chi tiết (levelIntro, levelFactors, levelNot) nằm trong mục mở rộng.
    levelSummary: [
      'YẾN PHỤNG PET chia 50 màu & dòng thành 5 Level để người mới dễ khám phá. Level phản ánh tương đối mức độ phổ biến, khả năng tìm chim, độ phức tạp trong nhân giống và duy trì dòng.',
      'Level không phải bảng xếp hạng chất lượng hay bảng giá.'
    ],
    levelMoreLabel: 'Xem cách phân Level',
    noticeTitle: 'Lưu ý khi xem catalogue',
    noticeSummary: 'Ảnh catalogue dùng để minh họa màu & dòng. Giá trên poster chỉ mang tính tham khảo theo nhóm; giá thực tế của từng bé được xác nhận riêng khi giao dịch.',
    noticeMoreLabel: 'Xem chi tiết',
    levelIntro: 'Level là cách phân nhóm của YẾN PHỤNG PET, giúp cộng đồng nuôi Yến Phụng tại Việt Nam dễ khám phá các màu, đột biến và tổ hợp.',
    levelFactorsLead: 'Khi xếp Level, dự án cân nhắc thực tế các yếu tố như:',
    levelFactors: [
      'mức độ phổ biến',
      'khả năng tìm được chim',
      'độ khó nhân giống',
      'độ khó để tạo ra đúng kiểu hình mong muốn',
      'việc duy trì dòng',
      'độ phức tạp của đột biến / tổ hợp',
      'kinh nghiệm người nuôi cần có'
    ],
    levelNotLead: 'Level KHÔNG phải:',
    levelNot: [
      'bảng xếp hạng quốc tế chính thức',
      'thứ hạng chất lượng',
      'bảo đảm về độ hiếm',
      'bảng giá',
      'bằng chứng một bé chim tốt hơn bé khác'
    ],
    priceDisclaimer: 'Giá hiển thị trên poster chỉ mang tính tham khảo theo nhóm tại thời điểm biên soạn, không phải bảng giá cố định và không quyết định giá của từng cá thể. Giá thực tế phụ thuộc vào từng bé và thông tin được xác minh tại thời điểm giao dịch.',
    aiDisclosure: 'Ảnh catalogue là hình minh họa trực quan phục vụ nhận biết và tham khảo. Không dùng hình AI để kết luận gene ẩn, phả hệ hoặc đặc điểm của một cá thể thực tế.',
    levelSectionIntro: '10 màu & dòng thuộc {level} trong phân loại của YẾN PHỤNG PET.',
    posterHint: 'Chạm vào poster để phóng to',
    posterCaption: 'Ảnh minh họa · Giá trên poster chỉ mang tính tham khảo (xem lưu ý ở đầu trang)',
    profilePending: 'Trang chi tiết đang được hoàn thiện',
    // Trang chi tiết (Phase 1C/1D). Chỉ là nhãn giao diện — không chứa nội dung chuyên môn.
    detail: {
      backTop: 'Catalogue · {level}',
      codeLabel: 'Mã',
      imageTitle: 'Ảnh minh họa',
      // Phase 1G — hiện dưới ảnh cắt từ poster (poster là hình minh họa AI)
      aiImageNote: 'Hình minh họa AI nhằm hỗ trợ nhận biết. Đặc điểm thực tế có thể khác nhau giữa các cá thể.',
      cropNote:'Ảnh tham khảo tạm thời, cắt từ poster {level}. Ảnh riêng của mục này sẽ được cập nhật.',
      // Các nhãn dưới chỉ xuất hiện ở chế độ xem trước bản nháp (local, ?preview=1)
      previewTitle: 'BẢN NHÁP — CHƯA XÁC MINH / CHƯA CÔNG KHAI',
      previewAdmin: 'Chi tiết kiểm duyệt (quản trị)',
      previewEditorial: 'Trạng thái bản thảo',
      previewVisual: 'Ảnh',
      previewExpert: 'Cần chuyên gia duyệt trước khi xác minh',
      previewSources: 'Tài liệu tham chiếu của bản thảo',
      previewMissing: 'Còn thiếu để xuất bản',
      previewCrop: 'Vùng cắt poster — CHƯA được OWNER duyệt làm ảnh tham khảo',
      draftMissing: 'Chưa có nội dung.',
      imageDraft: 'Chưa có ảnh minh họa đã duyệt',
      posterButton: 'Xem poster {level}',
      idTitle: 'Đặc điểm nhận dạng',
      confusedTitle: 'Dễ nhầm với',
      notesTitle: 'Ghi chú chuyên môn',
      sourceLabel: 'Nguồn',
      reviewedLabel: 'Xác minh',
      prev: 'Mục trước',
      next: 'Mục sau',
      backToCatalogue: 'Về Catalogue',
      zalo: 'Hỏi Ji qua Zalo'
    },
    inventoryBridge: 'Muốn xem các bé đang tìm chủ? Catalogue chỉ để tham khảo màu & dòng; mỗi bé thật có mã, thông tin và video thực tế riêng qua Zalo.'
  },

  // 3 bài cẩm nang hiển thị trên homepage (id trong data/guides.js)
  homeGuideIds: ['chon-non-hay-tu-an', 'chuan-bi-truoc-khi-don', 'bay-ngay-dau'],

  contact: {
    title: 'Liên hệ',
    lead: 'Cách nhanh nhất là nhắn Zalo hoặc gọi trực tiếp cho Ji.',
    formTitle: 'Hoặc để lại thông tin',
    formLead: 'Ji sẽ gọi hoặc nhắn Zalo lại cho bạn.'
  }
};
