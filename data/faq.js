// FAQ Phase 1A — 2 nhóm. Câu trả lời chỉ dùng nội dung đã có trong website gốc/cẩm nang.
// Câu nào cần chính sách OWNER chưa quyết định: để trong FAQ_HIDDEN (không hiển thị).

const FAQ_GROUPS = [
  {
    title: 'Mua & nhận chim',
    items: [
      ['Làm sao để hỏi mua một bé?', 'Bấm "Nhắn Zalo về bé này" trên thẻ của bé (mã bé sẽ được copy sẵn), hoặc nhắn/gọi Ji theo số trên trang. Ji sẽ gửi video thực tế hiện tại của bé để bạn xem trước, sau đó hai bên xác nhận thông tin, giá và cách nhận chim.'],
      ['Ảnh trên website có phải ảnh thật của bé không?', 'Không. Hình ảnh trên website là ảnh minh họa màu sắc/dòng chim, một ảnh có thể dùng cho nhiều bé cùng màu. Giới tính, tuổi và các thông tin khác của bé được ghi riêng. Trước khi chốt, bạn nhắn mã bé qua Zalo để nhận video thực tế của đúng bé đó.'],
      ['Giá chim được tính thế nào?', 'Mỗi bé có giá riêng, ghi trên thẻ của bé. Nếu thẻ chưa ghi giá, bạn nhắn Zalo kèm mã bé để được báo giá.'],
      ['Thông tin trên thẻ chim gồm những gì?', 'Mỗi bé được ghi những thông tin đã biết như màu, giới tính, tuổi, tình trạng tự ăn, mức độ quen người và giá. Thông tin nào chưa có sẽ không hiển thị — bạn có thể hỏi trực tiếp qua Zalo.'],
      ['Có xác định được trống mái không?', 'Giới tính chỉ được ghi khi có đủ căn cứ. Với chim non hoặc một số dòng, việc xác định cần thêm thời gian — nhắn Zalo để được cập nhật về bé bạn quan tâm.'],
      ['Chim đã tự ăn chưa?', 'Tình trạng tự ăn được ghi trên từng bé khi đã biết. Người mới nên ưu tiên chim đã tự ăn ổn định.'],
      ['Có cam kết chim sinh sản không?', 'Không. Khả năng sinh sản phụ thuộc vào giới tính, độ tuổi, sức khỏe, cách ghép cặp và điều kiện chăm sóc.']
    ]
  },
  {
    title: 'Người mới',
    items: [
      ['Người mới nên chọn chim như thế nào?', 'Nên chọn bé đã tự ăn ổn định, hoạt động tốt, dễ chăm và phù hợp với điều kiện thực tế của gia đình. Chim non cần người đút bột nhiều lần mỗi ngày và rất dễ gặp nguy hiểm nếu chăm sai cách.'],
      ['Nên nuôi một con hay một cặp?', 'Nếu muốn nuôi làm thú cưng và tương tác nhiều, một con sẽ dễ gắn bó với chủ hơn — nhưng bạn cần dành thời gian chơi với bé mỗi ngày. Nếu thường xuyên vắng nhà, nuôi một cặp giúp các bé đỡ cô đơn.'],
      ['Nuôi Yến Phụng có ồn không?', 'Yến Phụng có hót và gọi nhau vào ban ngày nhưng tiếng nhỏ hơn nhiều so với các loài vẹt lớn.'],
      ['Nuôi Yến Phụng có hôi không?', 'Nếu vệ sinh lồng thường xuyên và thay giấy lót định kỳ thì gần như không có mùi khó chịu — mùi chủ yếu đến từ phân và thức ăn thừa để lâu ngày.'],
      ['Chim có cắn không? Bao lâu thì quen chủ?', 'Chim có thể cắn, nhưng đa số chỉ cắn khi sợ hãi hoặc để tự vệ. Tuỳ từng bé, nếu được làm quen đúng cách và tiếp xúc mỗi ngày, nhiều bé có thể quen chủ sau vài tuần.'],
      ['Mới đón bé về nên làm gì?', 'Để bé nghỉ ngơi và làm quen môi trường khoảng 1–3 ngày trước khi bắt đầu tiếp xúc nhiều. Giữ đúng loại thức ăn bé đang quen. Xem thêm bài "Bảy ngày đầu tiên sau khi đón chim về" trong Cẩm nang.'],
      ['Khi nào nên đưa chim đi khám?', 'Nếu chim bỏ ăn, xù lông liên tục, khó thở, tiêu chảy kéo dài hoặc ít vận động hẳn, nên liên hệ bác sĩ thú y có kinh nghiệm với chim càng sớm càng tốt.']
    ]
  }
];

// Ẩn cho tới khi OWNER có chính sách / số liệu được kiểm chứng (không hiển thị trên web).
const FAQ_HIDDEN = [
  { q: 'Có giao chim đi tỉnh không? Phí và thời gian?', reason: 'OWNER DECISION — chính sách vận chuyển' },
  { q: 'Nếu chim gặp sự cố khi vận chuyển thì sao?', reason: 'OWNER DECISION — trách nhiệm vận chuyển' },
  { q: 'Đặt cọc / giữ chỗ thế nào?', reason: 'OWNER DECISION — chính sách giữ chỗ' },
  { q: 'Thanh toán bằng cách nào?', reason: 'OWNER DECISION' },
  { q: 'Có bảo hành sức khỏe / đổi trả không?', reason: 'OWNER DECISION' },
  { q: 'Có giấy tờ / nguồn gốc không?', reason: 'OWNER DECISION — chỉ ghi theo từng cá thể khi có căn cứ' },
  { q: 'Sau khi mua có được hướng dẫn không?', reason: 'OWNER DECISION — cam kết sau bán' },
  { q: 'Có được xem bé trực tiếp / gọi video trước khi mua không?', reason: 'OWNER DECISION' },
  { q: 'Yến Phụng sống được bao lâu?', reason: 'Số liệu tuổi thọ cần kiểm chứng trước khi đăng' }
];
