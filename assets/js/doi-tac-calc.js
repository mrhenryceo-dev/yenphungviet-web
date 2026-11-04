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

  // kind: money (đồng, số nguyên) · int · decimal · percent. modes: chế độ dùng ô này.
  const FIELDS = [
    { id: 'pairs', group: 'invest', modes: ['quick', 'detail'], kind: 'int', required: true, max: 1000, label: 'Số cặp giống', unit: 'cặp' },
    { id: 'pricePerPair', group: 'invest', modes: ['quick', 'detail'], kind: 'money', required: true, label: 'Giá mua mỗi cặp', unit: 'đ/cặp' },
    { id: 'equipmentCost', group: 'invest', modes: ['quick', 'detail'], kind: 'money', required: true, label: 'Chi phí lồng, ổ, thiết bị ban đầu', unit: 'đ' },
    { id: 'otherInitial', group: 'invest', modes: ['detail'], kind: 'money', label: 'Khoản đầu tư ban đầu khác', unit: 'đ' },
    { id: 'reserve', group: 'invest', modes: ['detail'], kind: 'money', label: 'Vốn lưu động/dự phòng ban đầu', unit: 'đ', hint: 'Tiền để riêng, ngoài vốn đầu tư. Không phải doanh thu.' },

    { id: 'startSellMonth', group: 'output', modes: ['detail'], kind: 'int', required: true, min: 1, max: 12, label: 'Tháng bắt đầu có chim bán', unit: 'tháng thứ', hint: 'Từ 1 đến 12, tính từ lúc bắt đầu.' },
    { id: 'participationPct', group: 'output', modes: ['detail'], kind: 'percent', required: true, label: 'Tỷ lệ cặp tham gia sinh sản', unit: '%' },
    { id: 'cyclesPerYear', group: 'output', modes: ['detail'], kind: 'int', required: true, max: 4, label: 'Số chu kỳ sinh sản', unit: 'chu kỳ/cặp/năm' },
    { id: 'chicksPerCycle', group: 'output', modes: ['detail'], kind: 'decimal', required: true, max: 20, label: 'Chim non sống khỏe đến tuổi bán', unit: 'chim/cặp/chu kỳ' },
    { id: 'sellThroughPct', group: 'output', modes: ['detail'], kind: 'percent', required: true, label: 'Tỷ lệ tiêu thụ', unit: '%', hint: 'Phần chim đến tuổi bán thực sự bán được trong kỳ.' },

    { id: 'birdsSold', group: 'output', modes: ['quick'], kind: 'decimal', required: true, max: 100000, label: 'Tổng số chim dự kiến bán được trong 12 tháng', unit: 'chim' },
    { id: 'avgPrice', group: 'output', modes: ['quick', 'detail'], kind: 'money', required: true, label: 'Giá bán trung bình mỗi chim', unit: 'đ/chim' },

    { id: 'opexMonthly', group: 'cost', modes: ['quick', 'detail'], kind: 'money', required: true, label: 'Chi phí vận hành mỗi tháng', unit: 'đ/tháng', hint: 'Thức ăn, vệ sinh, điện nước…' },
    { id: 'vetMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Chi phí thú y', unit: 'đ/tháng' },
    { id: 'shippingPerBird', group: 'cost', modes: ['detail'], kind: 'money', label: 'Chi phí vận chuyển', unit: 'đ/chim bán' },
    { id: 'marketingMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Chi phí marketing', unit: 'đ/tháng' },
    { id: 'miscMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Chi phí phát sinh', unit: 'đ/tháng' },
    { id: 'laborMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Chi phí công lao động', unit: 'đ/tháng' },
    { id: 'capitalMonthly', group: 'cost', modes: ['detail'], kind: 'money', label: 'Chi phí vốn (nếu có)', unit: 'đ/tháng', hint: 'Ví dụ tiền lãi nếu vay vốn.' }
  ];

  // Số do người xem tự bấm mới điền, luôn có nhãn "số ví dụ". Không phải số liệu trại.
  const EXAMPLE = {
    pairs: '3', pricePerPair: '2.000.000', equipmentCost: '6.000.000', otherInitial: '0', reserve: '6.000.000',
    startSellMonth: '6', participationPct: '60', cyclesPerYear: '2', chicksPerCycle: '3', sellThroughPct: '70',
    birdsSold: '8', avgPrice: '500.000',
    opexMonthly: '600.000', vetMonthly: '100.000', shippingPerBird: '30.000', marketingMonthly: '0',
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

  function checkField(f, raw) {
    const n = f.kind === 'money' ? parseMoney(raw) : parseDecimal(raw);
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
    const values = {}, errors = {}, missing = [];
    let touched = false;
    FIELDS.filter(f => f.modes.includes(mode)).forEach(f => {
      if (!isBlank(raw[f.id])) touched = true;
      const r = checkField(f, raw[f.id]);
      if (r.error) errors[f.id] = r.error;
      else if (r.value === null) {
        if (f.required) missing.push(f.id);
        values[f.id] = 0; // ô không bắt buộc để trống = 0
      } else values[f.id] = r.value;
    });
    return { values, errors, missing, touched };
  }

  // Nhận xét dùng chung cho cả hai chế độ. Không bao giờ dùng từ "lãi"/"lợi nhuận".
  function commonFlags(r, v) {
    const flags = [];
    const add = (code, level, text) => flags.push({ code, level, text });
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
      netCash12, recovered: recoveredState(totalOut, revenue, netCash12),
      months: null, breakevenMonth: null, relapseMonth: null, cashOutMonth: null, firstSaleMonth: null
    };
    r.flags = commonFlags(r, v);
    if (Math.abs(exact - birdsSold) > 1e-9) r.flags.push({ code: 'ROUNDED_DOWN', level: 'info', text: 'Số chim bán được làm tròn xuống số nguyên: không tính một phần con chim.' });
    if (v.pairs === 0 && v.birdsSold > 0) r.flags.push({ code: 'SOLD_WITHOUT_PAIRS', level: 'info', text: 'Bạn nhập chim bán nhưng có 0 cặp giống, nên công cụ tính 0 chim bán.' });
    return r;
  }

  // Mỗi chu kỳ tạo một đợt bán, cách đều trong năm (12 / số chu kỳ, làm tròn lên), bắt đầu
  // từ tháng khách chọn. Đợt rơi ngoài tháng 12 KHÔNG tính vào doanh thu. Số chim được làm
  // tròn theo lũy kế để tổng các đợt nhất quán và không có "một phần con chim".
  function batchSchedule(v, sc) {
    const part = Math.min(1, v.participationPct / 100 * sc.breedingFactor);
    const sell = Math.min(1, v.sellThroughPct / 100 * sc.sellFactor);
    const healthyPerBatch = v.pairs * part * v.chicksPerCycle;
    const soldPerBatch = healthyPerBatch * sell;
    const gap = v.cyclesPerYear > 0 ? Math.ceil(MONTHS / v.cyclesPerYear) : 0;
    const soldByMonth = new Array(MONTHS + 1).fill(0);
    let healthy = 0, outOfWindow = 0, rounded = false, prevH = 0, prevS = 0;
    for (let k = 1; k <= v.cyclesPerYear; k++) {
      const h = floorSafe(healthyPerBatch * k), s = floorSafe(soldPerBatch * k);
      const month = v.startSellMonth + (k - 1) * gap;
      if (Math.abs(soldPerBatch * k - s) > 1e-9) rounded = true;
      if (month <= MONTHS) { healthy += h - prevH; soldByMonth[month] += s - prevS; }
      else outOfWindow += h - prevH;
      prevH = h; prevS = s;
    }
    return { soldByMonth, healthy, outOfWindow, rounded };
  }

  // CHẾ ĐỘ CHI TIẾT — dòng tiền từng tháng. Tháng 0 = khoản đầu tư ban đầu.
  function simulateDetail(v, sc) {
    const initialInvestment = v.pairs * v.pricePerPair + v.equipmentCost + v.otherInitial;
    const recurring = Math.round((v.opexMonthly + v.vetMonthly + v.marketingMonthly + v.miscMonthly + v.laborMonthly + v.capitalMonthly) * sc.costFactor);
    const shipPerBird = Math.round(v.shippingPerBird * sc.costFactor);
    const plan = batchSchedule(v, sc);

    const months = [];
    let cum = 0, cumIn = 0, cumOut = 0, birdsSold = 0;
    let breakevenMonth = null, relapseMonth = null, cashOutMonth = null, firstSaleMonth = null, minBalance = v.reserve;
    for (let m = 0; m <= MONTHS; m++) {
      const sold = plan.soldByMonth[m];
      const inflow = sold * v.avgPrice;
      const outflow = m === 0 ? initialInvestment : recurring + sold * shipPerBird;
      const net = inflow - outflow;
      cum += net; cumIn += inflow; cumOut += outflow; birdsSold += sold;
      // Tiền mặt = dự phòng + vốn đầu tư đã chuẩn bị riêng + dòng tiền lũy kế (tháng 0 còn đúng khoản dự phòng).
      const balance = v.reserve + initialInvestment + cum;
      months.push({ month: m, sold, inflow, outflow, net, cum, balance });
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
      netCash12: cum, recovered: recoveredState(cumOut, cumIn, cum),
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
    return { ...base, state: 'ok', scenarios: SCENARIOS.map(sc => sim(check.values, sc)) };
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

  return { MONTHS, RECOMMENDED_MAX_CYCLES, SCENARIOS, DEFAULT_SCENARIO, FIELDS, EXAMPLE, parseMoney, parseDecimal, validate, run, simulateQuick, simulateDetail, fitResult, formatVnd };
});
