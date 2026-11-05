// Trang /doi-tac/ — bộ tính kinh tế (hàm thuần, không đụng DOM, không gọi mạng).
// Dùng chung cho trình duyệt (window.DoiTacCalc) và test Node (tools/doi-tac-calc-test.mjs).
// Đây là công cụ mô phỏng theo số khách tự nhập; KHÔNG có số liệu thật của trại.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DoiTacCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MONTHS = 12;
  const MAX_MONEY = 1e11;
  const RECOMMENDED_MAX_CYCLES = 2;

  // Hệ số công khai trên trang; KHÔNG phải thống kê của trại. Cơ sở = đúng số khách nhập.
  const SCENARIOS = [
    { id: 'cautious', label: 'Thận trọng', breedingFactor: 0.7, sellFactor: 0.7, costFactor: 1.15 },
    { id: 'base', label: 'Cơ sở', breedingFactor: 1, sellFactor: 1, costFactor: 1 },
    { id: 'favorable', label: 'Thuận lợi', breedingFactor: 1.15, sellFactor: 1.15, costFactor: 0.95 }
  ];
  const DEFAULT_SCENARIO = 'base';

  // Ba quy mô minh họa. data = null: OWNER chưa xác nhận số liệu nên chỉ điền số cặp, không tự có giá.
  const SCALE_PRESETS = [
    { pairs: 2, label: 'Trải nghiệm', pack: 'Gói Trải nghiệm (1–2 cặp)', data: null },
    { pairs: 5, label: 'Khởi đầu', pack: 'Gói Khởi đầu (3–5 cặp)', data: null },
    { pairs: 10, label: 'Quy mô mở rộng', pack: 'Gói Mở rộng (10 cặp trở lên)', data: null }
  ];

  // kind: money (đồng, số nguyên) · int · decimal · percent. modes: chế độ dùng ô này.
  // Ô không bắt buộc để trống được ghi là "chưa tính" (trừ noTrack), dù phép tính coi là 0.
  const FIELDS = [
    { id: 'pairs', group: 'invest', modes: ['quick', 'detail'], kind: 'int', grouped: true, required: true, max: 1000, label: 'Số cặp giống', unit: 'cặp' },
    { id: 'pricePerPair', group: 'invest', modes: ['quick', 'detail'], kind: 'money', required: true, label: 'Giá mua mỗi cặp', unit: 'đ/cặp' },
    { id: 'equipmentCost', group: 'invest', modes: ['quick', 'detail'], kind: 'money', required: true, label: 'Chi phí lồng, ổ, thiết bị ban đầu', unit: 'đ' },
    { id: 'otherInitial', group: 'invest', modes: ['detail'], kind: 'money', label: 'Khoản đầu tư ban đầu khác', unit: 'đ' },
    { id: 'reserve', group: 'invest', modes: ['detail'], kind: 'money', label: 'Vốn lưu động/dự phòng ban đầu', unit: 'đ', hint: 'Tiền để riêng, ngoài vốn đầu tư. Không phải doanh thu.' },

    { id: 'startSellMonth', group: 'output', modes: ['detail'], kind: 'int', required: true, min: 1, max: 12, label: 'Tháng bắt đầu có chim bán', unit: 'tháng thứ', hint: 'Từ 1 đến 12, tính từ lúc bắt đầu.' },
    { id: 'participationPct', group: 'output', modes: ['detail'], kind: 'percent', required: true, label: 'Tỷ lệ cặp tham gia sinh sản', unit: '%' },
    { id: 'cyclesPerYear', group: 'output', modes: ['detail'], kind: 'int', required: true, max: 4, label: 'Số chu kỳ sinh sản', unit: 'chu kỳ/cặp/năm' },
    { id: 'batchGapMonths', group: 'output', modes: ['detail'], kind: 'int', min: 1, max: 12, noTrack: true, label: 'Khoảng cách giữa các đợt bán', unit: 'tháng', hint: 'Giả định của bạn, sửa được. Để trống: lấy 12 ÷ số chu kỳ, làm tròn lên.' },
    { id: 'chicksPerCycle', group: 'output', modes: ['detail'], kind: 'decimal', required: true, max: 20, label: 'Chim non dự kiến', unit: 'chim/cặp/chu kỳ', hint: 'Số giả định của bạn, không phải sản lượng chắc chắn.' },
    { id: 'lossPct', group: 'output', modes: ['detail'], kind: 'percent', label: 'Hao hụt, chim không đủ điều kiện bán', unit: '%', hint: 'Phần chim non không sống đến tuổi bán hoặc chưa đủ điều kiện bán.' },
    { id: 'sellThroughPct', group: 'output', modes: ['detail'], kind: 'percent', required: true, label: 'Tỷ lệ tiêu thụ', unit: '%', hint: 'Phần chim đủ điều kiện thực sự bán được trong kỳ.' },

    { id: 'birdsSold', group: 'output', modes: ['quick'], kind: 'decimal', grouped: true, required: true, max: 100000, label: 'Số chim thực tế dự kiến bán trong 12 tháng', unit: 'chim', hint: 'Do bạn tự ước lượng, không phải kết quả sinh sản chắc chắn.' },
    { id: 'avgPrice', group: 'output', modes: ['quick', 'detail'], kind: 'money', required: true, label: 'Giá bán bình quân mỗi chim', unit: 'đ/chim' },

    { id: 'opexMonthly', group: 'cost', modes: ['quick', 'detail'], kind: 'money', required: true, label: 'Chi phí vận hành mỗi tháng', unit: 'đ/tháng', hint: 'Thức ăn, vệ sinh, điện nước…', detailLabel: 'Thức ăn và vật tư', detailHint: 'Chỉ thức ăn, vật tư. Các khoản khác nhập ở ô riêng bên dưới để không tính trùng.' },
    { id: 'utilitiesMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Điện, nước, vệ sinh', unit: 'đ/tháng' },
    { id: 'vetMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Thú y, chăm sóc sức khỏe', unit: 'đ/tháng' },
    { id: 'unsoldCarePerBird', group: 'cost', modes: ['detail'], kind: 'money', label: 'Chăm sóc chim chưa bán', unit: 'đ/chim/tháng', hint: 'Tính từ tháng sau đợt bán, cho số chim đủ điều kiện nhưng chưa bán được.' },
    { id: 'shippingPerBird', group: 'cost', modes: ['detail'], kind: 'money', label: 'Vận chuyển, đóng gói, giao dịch', unit: 'đ/chim bán' },
    { id: 'marketingMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Chi phí marketing', unit: 'đ/tháng' },
    { id: 'laborMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Nhân công hoặc giá trị thời gian chăm sóc', unit: 'đ/tháng' },
    { id: 'capitalMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Chi phí vốn (nếu có)', unit: 'đ/tháng', hint: 'Ví dụ tiền lãi nếu vay vốn.' },
    { id: 'miscMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Chi phí khác', unit: 'đ/tháng' }
  ];

  // Số do người xem tự bấm mới điền, luôn có nhãn "số ví dụ". Không phải số liệu trại, không phải báo giá.
  const EXAMPLE = {
    pairs: '3', pricePerPair: '2.000.000', equipmentCost: '6.000.000', otherInitial: '0', reserve: '6.000.000',
    startSellMonth: '6', participationPct: '60', cyclesPerYear: '2', chicksPerCycle: '3', lossPct: '10', sellThroughPct: '70',
    birdsSold: '8', avgPrice: '500.000',
    opexMonthly: '600.000', utilitiesMonthly: '100.000', vetMonthly: '100.000', unsoldCarePerBird: '20.000', shippingPerBird: '30.000', marketingMonthly: '0',
    miscMonthly: '100.000', laborMonthly: '0', capitalMonthly: '0'
  };

  const isBlank = raw => raw === null || raw === undefined || String(raw).trim() === '';

  // "1.000.000", "1,000,000", "1 000 000" hoặc "1000000". Số âm, chữ, phần thập phân → NaN.
  function parseMoney(raw) {
    if (isBlank(raw)) return null;
    const s = String(raw).trim().replace(/\s+/g, '').replace(/(đ|đồng|vnd)$/i, '');
    if (/^\d+$/.test(s) || /^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
    return NaN;
  }

  // "2,5" hoặc "2.5". Số âm, chữ, ký hiệu khoa học → NaN.
  function parseDecimal(raw) {
    if (isBlank(raw)) return null;
    const s = String(raw).trim();
    if (!/^\d+([.,]\d+)?$/.test(s)) return NaN;
    return Number(s.replace(',', '.'));
  }

  // Làm tròn xuống có chống sai số dấu phẩy động (4.2/0.7*0.7 không được thành 5.999…).
  const floorSafe = x => Math.floor(x + 1e-9);

  // Ô đếm số lượng lớn (grouped): "1.000" là một nghìn, không phải 1.
  const looksGrouped = raw => /^\d{1,3}([.,]\d{3})+$/.test(String(raw).trim());

  function checkField(f, raw) {
    const n = f.kind === 'money' || (f.grouped && looksGrouped(raw)) ? parseMoney(raw) : parseDecimal(raw);
    if (n === null) return { value: null };
    if (!Number.isFinite(n)) {
      return { error: f.kind === 'money' ? 'Nhập số tiền hợp lệ, không âm. Ví dụ: 1.500.000' : 'Nhập số hợp lệ, không âm.' };
    }
    if (f.kind === 'int' && !Number.isInteger(n)) return { error: 'Nhập số nguyên.' };
    if (f.kind === 'percent' && n > 100) return { error: 'Tỷ lệ phải từ 0 đến 100%.' };
    if (f.kind === 'money' && n > MAX_MONEY) return { error: 'Số tiền quá lớn so với phạm vi công cụ.' };
    if (f.min !== undefined && n < f.min) return { error: 'Giá trị nhỏ nhất là ' + f.min + '.' };
    if (f.max !== undefined && n > f.max) return { error: 'Giá trị lớn nhất là ' + f.max + '.' };
    return { value: n };
  }

  function validate(mode, raw) {
    const values = {}, errors = {}, missing = [], blanks = [];
    let touched = false;
    FIELDS.filter(f => f.modes.includes(mode)).forEach(f => {
      if (!isBlank(raw[f.id])) touched = true;
      const r = checkField(f, raw[f.id]);
      if (r.error) errors[f.id] = r.error;
      else if (r.value === null) {
        if (f.required) missing.push(f.id);
        else if (!f.noTrack) blanks.push(f.id);
        values[f.id] = 0; // ô không bắt buộc để trống: phép tính dùng 0, kết quả ghi rõ "chưa tính"
      } else values[f.id] = r.value;
    });
    return { values, errors, missing, blanks, touched };
  }

  // Khoản chưa được tính: ở chi tiết là ô để trống; ở nhanh là mọi khoản chỉ có ở chế độ chi tiết.
  function uncountedLabels(mode, blanks) {
    const isOut = mode === 'quick'
      ? f => !f.required && !f.noTrack && !f.modes.includes('quick')
      : f => blanks.includes(f.id);
    return FIELDS.filter(isOut).map(f => f.label);
  }

  // Nhận xét dùng chung cho cả hai chế độ. Không bao giờ dùng từ "lãi"/"lợi nhuận".
  function commonFlags(r, v) {
    const flags = [];
    const add = (code, level, text) => flags.push({ code, level, text });
    if (!Number.isSafeInteger(r.totalOut) || !Number.isSafeInteger(r.revenue)) add('TOO_LARGE', 'warn', 'Số quá lớn so với độ chính xác của công cụ. Hãy kiểm tra lại số đã nhập.');
    if (r.totalOut === 0) add('NO_COSTS', 'warn', 'Chưa có khoản chi nào được nhập, nên chưa thể đánh giá việc thu hồi tiền.');
    if (r.revenue === 0) {
      if (v.pairs === 0) add('NO_PAIRS', 'warn', '0 cặp giống nên không có chim để bán. Doanh thu giả định bằng 0.');
      else if (v.avgPrice === 0) add('ZERO_PRICE', 'warn', 'Giá bán bằng 0 nên doanh thu giả định bằng 0.');
      else add('ZERO_REVENUE', 'warn', 'Không có chim bán được trong kỳ nên doanh thu giả định bằng 0. Chi phí nuôi vẫn tiếp tục phát sinh.');
    }
    if (r.totalOut > 0 && r.totalOut > r.revenue) add('COST_EXCEEDS_REVENUE', 'warn', 'Tổng tiền chi lớn hơn doanh thu giả định trong 12 tháng.');
    if (r.birdsSold > 0 && v.avgPrice > 0) {
      if (r.opex12 / r.birdsSold > v.avgPrice) {
        add('PRICE_BELOW_OPERATING_COST', 'danger', 'Giá bán thấp hơn chi phí vận hành tính bình quân trên mỗi chim bán được.');
      } else if ((r.opex12 + r.initialInvestment) / r.birdsSold > v.avgPrice) {
        add('PRICE_BELOW_TOTAL_COST', 'warn', 'Giá bán thấp hơn tổng tiền chi (gồm cả vốn ban đầu) tính trên mỗi chim bán được trong 12 tháng.');
      }
    }
    return flags;
  }

  function recoveredState(totalOut, revenue, net) {
    if (totalOut === 0) return null;   // chưa đủ dữ liệu để kết luận
    return revenue > 0 && net >= 0;
  }

  // CHẾ ĐỘ NHANH — chỉ có tổng 12 tháng. Không có lịch bán nên KHÔNG chia doanh thu theo tháng
  // và KHÔNG có tháng hòa vốn.
  function simulateQuick(v, sc) {
    const initialInvestment = v.pairs * v.pricePerPair + v.equipmentCost;
    const opex12 = Math.round(v.opexMonthly * sc.costFactor) * MONTHS;
    const exact = v.pairs > 0 ? v.birdsSold * sc.breedingFactor * sc.sellFactor : 0;
    const birdsSold = floorSafe(exact);
    const revenue = birdsSold * v.avgPrice;
    const totalOut = initialInvestment + opex12;
    const netCash12 = revenue - totalOut;
    const r = {
      mode: 'quick', scenario: sc.id, initialInvestment, opex12, totalOut, revenue, birdsSold,
      netCash12, stillToCover: Math.max(0, -netCash12), recovered: recoveredState(totalOut, revenue, netCash12),
      months: null, breakevenMonth: null, relapseMonth: null, cashOutMonth: null, firstSaleMonth: null
    };
    r.flags = commonFlags(r, v);
    if (Math.abs(exact - birdsSold) > 1e-9) r.flags.push({ code: 'ROUNDED_DOWN', level: 'info', text: 'Số chim bán được làm tròn xuống số nguyên: không tính một phần con chim.' });
    if (v.pairs === 0 && v.birdsSold > 0) r.flags.push({ code: 'SOLD_WITHOUT_PAIRS', level: 'info', text: 'Bạn nhập chim bán nhưng có 0 cặp giống, nên công cụ tính 0 chim bán.' });
    if (birdsSold > 0 && birdsSold < floorSafe(v.birdsSold)) r.flags.push({ code: 'LOW_OUTPUT', level: 'info', text: 'Kịch bản này bán được ' + birdsSold + ' chim, thấp hơn ' + floorSafe(v.birdsSold) + ' chim bạn dự kiến.' });
    return r;
  }

  // Mỗi chu kỳ tạo một đợt bán, bắt đầu từ tháng khách chọn. Khoảng cách do khách nhập, nếu trống
  // thì lấy 12 / số chu kỳ, làm tròn lên. Đợt rơi ngoài tháng 12 KHÔNG tính vào doanh thu. Số chim
  // được làm tròn theo lũy kế để tổng các đợt nhất quán và không có "một phần con chim".
  function batchSchedule(v, sc) {
    const part = Math.min(1, v.participationPct / 100 * sc.breedingFactor);
    const sell = Math.min(1, v.sellThroughPct / 100 * sc.sellFactor);
    const healthyPerBatch = v.pairs * part * v.chicksPerCycle * (1 - v.lossPct / 100);
    const soldPerBatch = healthyPerBatch * sell;
    const gap = v.cyclesPerYear > 0 ? (v.batchGapMonths > 0 ? v.batchGapMonths : Math.ceil(MONTHS / v.cyclesPerYear)) : 0;
    const soldByMonth = new Array(MONTHS + 1).fill(0), healthyByMonth = new Array(MONTHS + 1).fill(0), batchMonths = [];
    let healthy = 0, outOfWindow = 0, rounded = false, prevH = 0, prevS = 0;
    for (let k = 1; k <= v.cyclesPerYear; k++) {
      const h = floorSafe(healthyPerBatch * k), s = floorSafe(soldPerBatch * k);
      const month = v.startSellMonth + (k - 1) * gap;
      if (Math.abs(soldPerBatch * k - s) > 1e-9) rounded = true;
      if (month <= MONTHS) { healthy += h - prevH; healthyByMonth[month] += h - prevH; soldByMonth[month] += s - prevS; batchMonths.push(month); }
      else outOfWindow += h - prevH;
      prevH = h; prevS = s;
    }
    return { soldByMonth, healthyByMonth, batchMonths, gap, healthy, outOfWindow, rounded };
  }

  // CHẾ ĐỘ CHI TIẾT — dòng tiền từng tháng. Tháng 0 = khoản đầu tư ban đầu.
  function simulateDetail(v, sc) {
    const initialInvestment = v.pairs * v.pricePerPair + v.equipmentCost + v.otherInitial;
    const recurring = Math.round((v.opexMonthly + v.utilitiesMonthly + v.vetMonthly + v.marketingMonthly + v.miscMonthly + v.laborMonthly + v.capitalMonthly) * sc.costFactor);
    const shipPerBird = Math.round(v.shippingPerBird * sc.costFactor);
    const carePerBird = Math.round(v.unsoldCarePerBird * sc.costFactor);
    const plan = batchSchedule(v, sc);

    const months = [];
    let cum = 0, cumIn = 0, cumOut = 0, birdsSold = 0, stock = 0, careTotal = 0;
    let breakevenMonth = null, relapseMonth = null, cashOutMonth = null, firstSaleMonth = null, minBalance = v.reserve;
    for (let m = 0; m <= MONTHS; m++) {
      const sold = plan.soldByMonth[m];
      const inflow = sold * v.avgPrice;
      // Chim tồn cuối tháng trước phát sinh chi phí chăm sóc trong tháng này.
      const care = stock * carePerBird;
      const outflow = m === 0 ? initialInvestment : recurring + sold * shipPerBird + care;
      const net = inflow - outflow;
      cum += net; cumIn += inflow; cumOut += outflow; birdsSold += sold; careTotal += care;
      stock += plan.healthyByMonth[m] - sold;
      // Tiền mặt = dự phòng + vốn đầu tư đã chuẩn bị riêng + dòng tiền lũy kế (tháng 0 còn đúng khoản dự phòng).
      const balance = v.reserve + initialInvestment + cum;
      months.push({ month: m, sold, inflow, outflow, net, cum, balance, stock, care });
      if (sold > 0 && firstSaleMonth === null) firstSaleMonth = m;
      // Chỉ gọi là hòa vốn khi đã thật sự có chi và có thu; số 0 ở tháng 0 không phải hòa vốn.
      if (breakevenMonth === null && cum >= 0 && cumIn > 0 && cumOut > 0) breakevenMonth = m;
      else if (breakevenMonth !== null && relapseMonth === null && cum < 0) relapseMonth = m;
      if (cashOutMonth === null && balance < 0) cashOutMonth = m;
      if (balance < minBalance) minBalance = balance;
    }
    const opex12 = cumOut - initialInvestment;
    const birdsUnsold = plan.healthy - birdsSold;
    const r = {
      mode: 'detail', scenario: sc.id, initialInvestment, reserve: v.reserve, opex12, totalOut: cumOut, revenue: cumIn,
      birdsSold, birdsHealthy: plan.healthy, birdsUnsold, birdsOutOfWindow: plan.outOfWindow,
      netCash12: cum, stillToCover: Math.max(0, -cum), recovered: recoveredState(cumOut, cumIn, cum),
      batchMonths: plan.batchMonths, batchGap: plan.gap, batchGapAuto: !(v.batchGapMonths > 0), careTotal,
      months, breakevenMonth, relapseMonth, cashOutMonth, firstSaleMonth,
      extraCashNeeded: Math.max(0, -minBalance),
      flock: { breeders: v.pairs * 2, unsoldChicks: birdsUnsold, referenceValue: v.pairs * v.pricePerPair + birdsUnsold * v.avgPrice },
      operatingGap: cumIn - opex12
    };

    const flags = commonFlags(r, v);
    const add = (code, level, text) => flags.push({ code, level, text });
    if (v.pairs > 0 && (v.participationPct === 0 || v.cyclesPerYear === 0 || v.chicksPerCycle === 0)) add('NO_BREEDING', 'warn', 'Không có chim non đến tuổi bán theo giả định này. Đây là tình huống có thật: không phải cặp nào cũng sinh sản.');
    if (v.sellThroughPct === 0) add('NO_SALES_RATE', 'warn', 'Tỷ lệ tiêu thụ 0%: chim non vẫn cần được chăm sóc dù chưa bán được.');
    if (cumOut > 0 && breakevenMonth === null) add('NO_BREAKEVEN', 'warn', 'Không có tháng hòa vốn dòng tiền trong 12 tháng mô phỏng.');
    if (relapseMonth !== null) add('RELAPSE', 'warn', 'Dòng tiền lũy kế lần đầu không âm ở tháng ' + breakevenMonth + ' nhưng âm trở lại từ tháng ' + relapseMonth + ' vì chi phí vẫn tiếp tục.');
    if (cashOutMonth !== null) {
      const before = firstSaleMonth === null || cashOutMonth < firstSaleMonth;
      add(before ? 'CASH_OUT_BEFORE_REVENUE' : 'CASH_OUT', 'danger',
        'Điểm gãy dòng tiền: tiền mặt âm từ tháng ' + cashOutMonth + (before ? ', trước khi có khoản thu đầu tiên' : '') + '. Cần có phương án duy trì đàn trước khi bắt đầu.');
    }
    const potential = floorSafe(v.pairs * v.cyclesPerYear * v.chicksPerCycle);
    if (birdsSold > 0 && birdsSold < potential) add('LOW_OUTPUT', 'info', 'Sản lượng thực tế có thể thấp hơn dự kiến: theo giả định chỉ bán được ' + birdsSold + ' chim, trong khi ' + potential + ' chim là mức nếu mọi cặp đều sinh sản, không hao hụt và bán hết.');
    if (birdsUnsold > 0) {
      if (careTotal > 0) add('UNSOLD_STOCK', 'warn', 'Tồn đàn: ' + birdsUnsold + ' chim chưa bán làm phát sinh thêm ' + formatVnd(careTotal) + ' chi phí chăm sóc trong kỳ.');
      else add('UNSOLD_STOCK', 'warn', 'Tồn đàn: ' + birdsUnsold + ' chim chưa bán vẫn cần ăn và chăm sóc, nhưng chi phí này chưa được tính trong kết quả.');
    }
    if (plan.outOfWindow > 0) add('OUT_OF_WINDOW', 'info', plan.outOfWindow + ' chim đến tuổi bán sau tháng 12 nên chưa được tính vào kỳ này.');
    if (plan.rounded) add('ROUNDED_DOWN', 'info', 'Số chim được làm tròn xuống theo từng đợt bán: không tính một phần con chim.');
    if (v.cyclesPerYear > RECOMMENDED_MAX_CYCLES) add('HIGH_CYCLES', 'danger', 'Trên ' + RECOMMENDED_MAX_CYCLES + ' chu kỳ/cặp/năm vượt mức thường được khuyến nghị để bảo vệ sức khỏe chim bố mẹ. Không nên dùng số này để lập kế hoạch.');
    r.flags = flags;
    return r;
  }

  // Trả về state: empty (chưa nhập gì) · incomplete · invalid · ok.
  function run(mode, raw) {
    const check = validate(mode, raw || {});
    const base = { mode, errors: check.errors, missing: check.missing };
    if (Object.keys(check.errors).length) return { ...base, state: 'invalid' };
    if (!check.touched) return { ...base, state: 'empty' };
    if (check.missing.length) return { ...base, state: 'incomplete' };
    const sim = mode === 'quick' ? simulateQuick : simulateDetail;
    const uncounted = uncountedLabels(mode, check.blanks);
    return { ...base, state: 'ok', uncounted, scenarios: SCENARIOS.map(sc => ({ ...sim(check.values, sc), uncounted })) };
  }

  // Đánh giá 6 câu. Thiếu không gian hoặc thời gian chăm sóc (2 câu đầu) thì chưa nên bắt đầu dù
  // tick đủ các câu còn lại. Đây chỉ là gợi ý tự đánh giá, không phải chứng nhận.
  function fitResult(checks) {
    const count = checks.filter(Boolean).length;
    if (count === checks.length && count > 0) return 'talk';
    if (!checks[0] || !checks[1] || count <= 2) return 'learn';
    return 'consider';
  }

  // 1250000 → "1.250.000 đ"; số âm dùng dấu trừ thật.
  function formatVnd(n) {
    const s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '−' : '') + s + ' đ';
  }

  return { MONTHS, RECOMMENDED_MAX_CYCLES, SCENARIOS, DEFAULT_SCENARIO, SCALE_PRESETS, FIELDS, EXAMPLE, parseMoney, parseDecimal, validate, run, simulateQuick, simulateDetail, fitResult, formatVnd };
});
