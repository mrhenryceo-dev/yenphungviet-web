// Chữ hiển thị của các section trên homepage.
// Chỉ dùng nội dung đã được duyệt / đã có trong cẩm nang. Không thêm claim mới
// (nguồn gốc, sức khỏe, bảo hành, vận chuyển…) khi OWNER chưa quyết định.

const CONTENT = {
  hero: {
    lead: 'Xem các bé Yến Phụng đang tìm chủ, chọn mã bé và nhắn Zalo cho Ji để nhận video thực tế của bé trước khi chốt.'
  },

  birds: {
    title: 'Chim đang tìm chủ',
    lead: 'Bấm "Nhắn Zalo về bé này" để nhận video thực tế của bé, hoặc "Xem chi tiết" để xem thêm thông tin.',
    infoNote: 'Thông tin chưa có sẽ không hiển thị. Bạn có thể hỏi thêm qua Zalo.',
    // Ghi chú minh bạch về ảnh — hiển thị gần danh sách chim và trong chi tiết bé.
    visualNote: 'Ảnh trên website mang tính minh họa. Nhắn mã bé qua Zalo để nhận video thực tế trước khi chốt.',
    homeLimit: 6
  },

  // "Cách nhận chim" — website để xem & chọn; video thực tế của đúng bé được gửi qua Zalo trước khi chốt.
  // Không thêm đặt cọc, phí ship, thời gian giao, bảo hành, đổi trả… cho tới khi OWNER có chính sách.
  steps: [
    { title: 'Chọn bé trên website', text: 'Xem các bé đang tìm chủ và ghi lại mã của bé bạn thích.' },
    { title: 'Gửi mã bé qua Zalo', text: 'Nhắn mã bé cho Ji qua Zalo (hoặc gọi điện).' },
    { title: 'Xem video thực tế của bé', text: 'Ji gửi video hiện tại của đúng bé đó để bạn xem trước.' },
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
