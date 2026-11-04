// Trang /doi-tac/ — test công thức kinh tế (chạy: node tools/doi-tac-calc-test.mjs). Không gọi mạng.
// Kết quả mong đợi tính tay trong từng test, không lấy lại từ code đang kiểm tra.
import assert from 'node:assert/strict';
import C from '../assets/js/doi-tac-calc.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const base = r => r.scenarios.find(s => s.scenario === 'base');
const has = (r, code) => r.flags.some(f => f.code === code);

const QUICK = { pairs: 2, pricePerPair: 1000000, equipmentCost: 3000000, opexMonthly: 500000, birdsSold: 20, avgPrice: 600000 };
const DETAIL = {
  pairs: 4, pricePerPair: 1000000, equipmentCost: 2000000, otherInitial: 500000, reserve: 5000000,
  startSellMonth: 6, participationPct: 50, cyclesPerYear: 2, chicksPerCycle: 3, sellThroughPct: 50,
  avgPrice: 1000000, opexMonthly: 300000, vetMonthly: 50000, shippingPerBird: 20000,
  marketingMonthly: 10000, miscMonthly: 20000, laborMonthly: 0, capitalMonthly: 20000
};

// ---------- Chế độ nhanh ----------
t('nhanh: vốn, chi phí, doanh thu, dòng tiền đúng như tính tay', () => {
  const r = base(C.run('quick', QUICK));
  assert.equal(r.initialInvestment, 5000000); // 2×1tr + 3tr
  assert.equal(r.opex12, 6000000);            // 500k×12
  assert.equal(r.revenue, 12000000);          // 20×600k
  assert.equal(r.netCash12, 1000000);         // 12 − 5 − 6
  assert.equal(r.recovered, true);
});
t('nhanh: chưa thu hồi đủ khi tiền chi lớn hơn', () => {
  const r = base(C.run('quick', { ...QUICK, birdsSold: 10 }));
  assert.equal(r.netCash12, -5000000);
  assert.equal(r.recovered, false);
  assert.ok(has(r, 'COST_EXCEEDS_REVENUE'));
});
t('nhanh: không chia doanh thu theo tháng và không có tháng hòa vốn', () => {
  const r = base(C.run('quick', QUICK));
  assert.equal(r.months, null);
  assert.equal(r.breakevenMonth, null);
});
t('nhanh: đúng bằng tiền chi vẫn là đã thu hồi đủ', () => {
  const r = base(C.run('quick', { ...QUICK, birdsSold: 55, avgPrice: 200000 })); // 11tr = 5tr + 6tr
  assert.equal(r.netCash12, 0);
  assert.equal(r.recovered, true);
});
t('nhanh: số chim không nguyên được làm tròn xuống', () => {
  const r = base(C.run('quick', { ...QUICK, birdsSold: '7,5' }));
  assert.equal(r.birdsSold, 7);
  assert.equal(r.revenue, 4200000);
  assert.ok(has(r, 'ROUNDED_DOWN'));
});
t('nhanh: 0 cặp thì 0 chim bán dù có nhập số chim', () => {
  const r = base(C.run('quick', { ...QUICK, pairs: 0 }));
  assert.equal(r.birdsSold, 0);
  assert.equal(r.revenue, 0);
  assert.ok(has(r, 'NO_PAIRS') && has(r, 'SOLD_WITHOUT_PAIRS'));
});

// ---------- Chế độ chi tiết ----------
t('chi tiết: tháng 0, sản lượng, tiêu thụ và lịch đợt bán đúng như tính tay', () => {
  const r = base(C.run('detail', DETAIL));
  assert.equal(r.initialInvestment, 6500000); // 4×1tr + 2tr + 500k
  // 4 cặp × 50% × 3 chim = 6 chim/đợt; tiêu thụ 50% = 3 chim/đợt. 2 chu kỳ → cách 6 tháng: T6, T12.
  assert.equal(r.months[6].sold, 3);
  assert.equal(r.months[12].sold, 3);
  assert.equal(r.birdsSold, 6);
  assert.equal(r.birdsHealthy, 12);
  assert.equal(r.birdsUnsold, 6);
  assert.equal(r.revenue, 6000000);
  assert.equal(r.firstSaleMonth, 6);
  assert.deepEqual(r.months.filter(m => m.sold > 0).map(m => m.month), [6, 12]); // không chia đều 12 tháng
});
t('chi tiết: chi phí tháng gồm mọi khoản; vận chuyển chỉ phát sinh theo chim bán', () => {
  const r = base(C.run('detail', DETAIL));
  assert.equal(r.months[0].outflow, 6500000);
  assert.equal(r.months[1].outflow, 400000);   // 300+50+10+20+0+20 nghìn
  assert.equal(r.months[6].outflow, 460000);   // 400k + 3×20k
  assert.equal(r.opex12, 400000 * 12 + 6 * 20000);
  assert.equal(r.netCash12, 6000000 - 6500000 - 4920000);
  assert.equal(r.recovered, false);
});
t('chi tiết: dòng tiền nhất quán từng tháng', () => {
  for (const s of C.run('detail', DETAIL).scenarios) {
    let cum = 0, sold = 0;
    for (const m of s.months) {
      assert.equal(m.net, m.inflow - m.outflow);
      cum += m.net; sold += m.sold;
      assert.equal(m.cum, cum);
      assert.equal(m.balance, DETAIL.reserve + s.initialInvestment + cum);
      assert.equal(m.inflow, m.sold * DETAIL.avgPrice);
      assert.ok(Number.isInteger(m.sold) && m.sold >= 0);
    }
    assert.equal(s.months.length, 13);
    assert.equal(s.netCash12, cum);
    assert.equal(s.birdsSold, sold);
    assert.equal(s.revenue, s.birdsSold * DETAIL.avgPrice);
    assert.equal(s.totalOut, s.initialInvestment + s.opex12);
    assert.equal(s.netCash12, s.revenue - s.totalOut);
  }
});
t('chi tiết: vốn dự phòng không phải doanh thu và không làm đổi dòng tiền lũy kế', () => {
  const a = base(C.run('detail', DETAIL)), b = base(C.run('detail', { ...DETAIL, reserve: 99000000 }));
  assert.equal(a.revenue, b.revenue);
  assert.equal(a.netCash12, b.netCash12);
  assert.equal(a.breakevenMonth, b.breakevenMonth);
});
t('chi tiết: chim không nguyên làm tròn theo lũy kế, tổng các đợt nhất quán', () => {
  // 3 cặp × 50% × 2 = 3 chim/đợt; × 70% = 2,1 chim/đợt. Lũy kế: floor(2,1)=2; floor(4,2)=4.
  const r = base(C.run('detail', { ...DETAIL, pairs: 3, chicksPerCycle: 2, sellThroughPct: 70 }));
  assert.equal(r.months[6].sold, 2);
  assert.equal(r.months[12].sold, 2);
  assert.ok(has(r, 'ROUNDED_DOWN'));
});
t('chi tiết: đợt rơi ngoài tháng 12 không được tính', () => {
  const r = base(C.run('detail', { ...DETAIL, startSellMonth: 8 })); // T8 và T14
  assert.equal(r.birdsSold, 3);
  assert.equal(r.birdsOutOfWindow, 6);
  assert.ok(has(r, 'OUT_OF_WINDOW'));
});
t('chi tiết: tháng hòa vốn là tháng đầu tiên lũy kế không âm', () => {
  // Vốn 1tr, không có chi phí tháng; bán 1 chim 400k ở T2, T5, T8 → −600k, −200k, +200k.
  const r = base(C.run('detail', { pairs: 1, pricePerPair: 1000000, equipmentCost: 0, startSellMonth: 2, participationPct: 100, cyclesPerYear: 3, chicksPerCycle: 1, sellThroughPct: 100, avgPrice: 400000, opexMonthly: 0 }));
  assert.deepEqual(r.months.filter(m => m.sold).map(m => m.month), [2, 6, 10]); // cách 4 tháng
  assert.equal(r.breakevenMonth, 10);
  assert.equal(r.months[10].cum, 200000);
  assert.equal(r.months[6].cum, -200000);
});
t('chi tiết: hòa vốn rồi âm trở lại thì báo rõ, không để tháng hòa vốn che cuối kỳ', () => {
  const s = base(C.run('detail', { pairs: 1, pricePerPair: 1000000, equipmentCost: 0, startSellMonth: 6, participationPct: 100, cyclesPerYear: 1, chicksPerCycle: 3, sellThroughPct: 100, avgPrice: 1000000, opexMonthly: 300000 }));
  // T6: −1tr − 1,8tr + 3tr = +200k (hòa vốn). T7: −100k (âm trở lại).
  assert.equal(s.breakevenMonth, 6);
  assert.equal(s.relapseMonth, 7);
  assert.equal(s.recovered, false);
  assert.ok(has(s, 'RELAPSE'));
});

// ---------- Các trường hợp bắt buộc (đặc tả mục F) ----------
t('F: 0 cặp sinh sản', () => {
  const r = base(C.run('detail', { ...DETAIL, pairs: 0 }));
  assert.equal(r.revenue, 0); assert.equal(r.birdsSold, 0); assert.equal(r.breakevenMonth, null);
  assert.ok(has(r, 'NO_PAIRS'));
});
t('F: 0% cặp tham gia / 0 chu kỳ / 0 chim non đều cho 0 chim bán', () => {
  for (const patch of [{ participationPct: 0 }, { cyclesPerYear: 0 }, { chicksPerCycle: 0 }]) {
    const r = base(C.run('detail', { ...DETAIL, ...patch }));
    assert.equal(r.birdsSold, 0); assert.equal(r.revenue, 0); assert.equal(r.firstSaleMonth, null);
    assert.equal(r.breakevenMonth, null); assert.equal(r.recovered, false);
    assert.ok(has(r, 'NO_BREEDING') && has(r, 'NO_BREAKEVEN'));
  }
});
t('F: tỷ lệ bán 0% — chim non vẫn còn trong đàn, không thành doanh thu', () => {
  const r = base(C.run('detail', { ...DETAIL, sellThroughPct: 0 }));
  assert.equal(r.revenue, 0);
  assert.equal(r.birdsUnsold, 12);
  assert.equal(r.flock.unsoldChicks, 12);
  assert.ok(has(r, 'NO_SALES_RATE') && has(r, 'ZERO_REVENUE'));
});
t('F: giá trị đàn còn lại không cộng vào doanh thu hay dòng tiền', () => {
  const r = base(C.run('detail', DETAIL));
  assert.equal(r.flock.referenceValue, 4 * 1000000 + 6 * 1000000);
  assert.equal(r.revenue, 6 * 1000000);
  assert.equal(r.netCash12, r.revenue - r.totalOut);
});
t('F: 0 chim bán ở chế độ nhanh, doanh thu 0', () => {
  const r = base(C.run('quick', { ...QUICK, birdsSold: 0 }));
  assert.equal(r.revenue, 0); assert.equal(r.recovered, false); assert.ok(has(r, 'ZERO_REVENUE'));
});
t('F: không hòa vốn trong 12 tháng', () => {
  const r = base(C.run('detail', DETAIL));
  assert.equal(r.breakevenMonth, null);
  assert.ok(has(r, 'NO_BREAKEVEN'));
});
t('F: hết tiền dự phòng trước khi có doanh thu', () => {
  const r = base(C.run('detail', { ...DETAIL, reserve: 1000000 }));
  assert.equal(r.cashOutMonth, 3);          // 1tr − 400k×3 = −200k
  assert.equal(r.firstSaleMonth, 6);
  assert.equal(r.months[3].balance, -200000);
  assert.ok(has(r, 'CASH_OUT_BEFORE_REVENUE'));
});
t('F: tiền cần có thêm bằng đúng mức âm sâu nhất', () => {
  const r = base(C.run('detail', { ...DETAIL, reserve: 0 }));
  assert.equal(r.months[0].balance, 0);       // vốn đầu tư để riêng, không trừ vào dự phòng
  assert.equal(r.cashOutMonth, 1);            // −400k ngay tháng 1
  assert.equal(r.extraCashNeeded, 2000000);   // sâu nhất ở T5: 5 × 400k
});
t('F: đủ tiền thì không có điểm gãy', () => {
  const r = base(C.run('detail', { ...DETAIL, reserve: 50000000 }));
  assert.equal(r.cashOutMonth, null); assert.equal(r.extraCashNeeded, 0);
});
t('F: giá bán thấp hơn chi phí', () => {
  assert.ok(has(base(C.run('quick', { ...QUICK, birdsSold: 2, avgPrice: 100000 })), 'PRICE_BELOW_OPERATING_COST'));
  assert.ok(has(base(C.run('quick', { ...QUICK, birdsSold: 20, avgPrice: 400000 })), 'PRICE_BELOW_TOTAL_COST'));
  assert.ok(has(base(C.run('quick', { ...QUICK, avgPrice: 0 })), 'ZERO_PRICE'));
});
t('F: dữ liệu không hợp lệ → không tính gì', () => {
  const bad = [
    { pairs: -1 }, { pairs: 1.5 }, { pairs: 'abc' }, { pricePerPair: '1,5' }, { pricePerPair: '-100' }, { pricePerPair: '1e6' },
    { avgPrice: 'NaN' }, { opexMonthly: 'Infinity' }, { pricePerPair: 2e11 }
  ];
  for (const b of bad) {
    const r = C.run('quick', { ...QUICK, ...b });
    assert.equal(r.state, 'invalid', JSON.stringify(b));
    assert.equal(r.scenarios, undefined);
  }
  for (const b of [{ participationPct: 101 }, { sellThroughPct: 200 }, { startSellMonth: 0 }, { startSellMonth: 13 }, { startSellMonth: 2.5 }, { cyclesPerYear: 5 }, { cyclesPerYear: 1.5 }]) {
    assert.equal(C.run('detail', { ...DETAIL, ...b }).state, 'invalid', JSON.stringify(b));
  }
});
t('F: chưa nhập gì / nhập thiếu → không hiện kết quả', () => {
  assert.equal(C.run('quick', {}).state, 'empty');
  assert.equal(C.run('detail', {}).state, 'empty');
  const r = C.run('quick', { pairs: 2 });
  assert.equal(r.state, 'incomplete'); assert.ok(r.missing.includes('avgPrice')); assert.equal(r.scenarios, undefined);
});
t('F: toàn số 0 không tạo ra "hòa vốn" hay "đã thu hồi" giả', () => {
  const q = base(C.run('quick', { pairs: 0, pricePerPair: 0, equipmentCost: 0, opexMonthly: 0, birdsSold: 0, avgPrice: 0 }));
  assert.equal(q.recovered, null); assert.ok(has(q, 'NO_COSTS'));
  const d = base(C.run('detail', { pairs: 0, pricePerPair: 0, equipmentCost: 0, startSellMonth: 1, participationPct: 0, cyclesPerYear: 0, chicksPerCycle: 0, sellThroughPct: 0, avgPrice: 0, opexMonthly: 0 }));
  assert.equal(d.recovered, null); assert.equal(d.breakevenMonth, null); assert.equal(d.netCash12, 0);
});
t('chu kỳ vượt khuyến nghị bị cảnh báo', () => {
  assert.ok(has(base(C.run('detail', { ...DETAIL, cyclesPerYear: 3 })), 'HIGH_CYCLES'));
  assert.ok(!has(base(C.run('detail', { ...DETAIL, cyclesPerYear: 2 })), 'HIGH_CYCLES'));
});

// ---------- Ba kịch bản ----------
t('kịch bản: hệ số đúng công bố, mặc định là Cơ sở', () => {
  assert.equal(C.DEFAULT_SCENARIO, 'base');
  assert.deepEqual(C.SCENARIOS.map(s => [s.id, s.breedingFactor, s.sellFactor, s.costFactor]),
    [['cautious', 0.7, 0.7, 1.15], ['base', 1, 1, 1], ['favorable', 1.15, 1.15, 0.95]]);
});
t('kịch bản Thận trọng: tính tay', () => {
  const r = C.run('detail', DETAIL).scenarios.find(s => s.scenario === 'cautious');
  // 4 × 35% × 3 = 4,2 chim/đợt; × 35% = 1,47. Lũy kế floor: 1; floor(2,94)=2 → T6: 1, T12: 1.
  assert.equal(r.months[6].sold, 1);
  assert.equal(r.months[12].sold, 1);
  assert.equal(r.months[1].outflow, 460000);  // 400k × 1,15
  assert.equal(r.months[6].outflow, 460000 + 23000); // vận chuyển 20k × 1,15
  assert.equal(r.initialInvestment, 6500000); // vốn ban đầu không đổi theo kịch bản
});
t('kịch bản Thuận lợi: tỷ lệ bị chặn ở 100%, không tăng số chu kỳ', () => {
  const r = C.run('detail', { ...DETAIL, participationPct: 100, sellThroughPct: 100 }).scenarios.find(s => s.scenario === 'favorable');
  // 4 × 100% × 3 = 12 chim/đợt, không phải 13,8.
  assert.equal(r.months[6].sold, 12);
  assert.equal(r.months.filter(m => m.sold > 0).length, 2);
});
t('kịch bản: thứ tự Thận trọng ≤ Cơ sở ≤ Thuận lợi', () => {
  const [a, b, c] = C.run('detail', { ...DETAIL, pairs: 10 }).scenarios;
  assert.ok(a.revenue <= b.revenue && b.revenue <= c.revenue);
  assert.ok(a.opex12 >= c.opex12);
  assert.ok(a.netCash12 <= b.netCash12 && b.netCash12 <= c.netCash12);
});
t('kịch bản nhanh: hệ số áp lên số chim, làm tròn xuống', () => {
  const [a, b, c] = C.run('quick', QUICK).scenarios;
  assert.equal(a.birdsSold, 9);   // 20 × 0,49 = 9,8
  assert.equal(b.birdsSold, 20);
  assert.equal(c.birdsSold, 26);  // 20 × 1,3225 = 26,45
  assert.equal(a.opex12, 575000 * 12);
});

// ---------- Nhập liệu ----------
t('đọc số kiểu Việt Nam', () => {
  for (const s of ['1.000.000', '1,000,000', '1 000 000', '1000000', '1.000.000 đ']) assert.equal(C.parseMoney(s), 1000000, s);
  assert.equal(C.parseMoney(''), null);
  assert.ok(Number.isNaN(C.parseMoney('1.5')));
  assert.equal(C.parseDecimal('2,5'), 2.5);
  assert.equal(C.parseDecimal('2.5'), 2.5);
  assert.ok(Number.isNaN(C.parseDecimal('-2')));
});
t('định dạng tiền', () => {
  assert.equal(C.formatVnd(1250000), '1.250.000 đ');
  assert.equal(C.formatVnd(-500), '−500 đ');
  assert.equal(C.formatVnd(0), '0 đ');
});
t('không có giá trị mặc định: ô trống khi chưa nhập', () => {
  assert.equal(C.FIELDS.filter(f => 'value' in f || 'default' in f).length, 0);
});
t('số ví dụ cho đủ mọi ô bắt buộc ở cả hai chế độ', () => {
  assert.equal(C.run('quick', C.EXAMPLE).state, 'ok');
  assert.equal(C.run('detail', C.EXAMPLE).state, 'ok');
});

// ---------- Đánh giá mức độ phù hợp ----------
t('fitResult: 3 mức, thiếu không gian/thời gian thì chưa nên bắt đầu', () => {
  assert.equal(C.fitResult([true, true, true, true, true, true]), 'talk');
  assert.equal(C.fitResult([true, true, true, true, true, false]), 'consider');
  assert.equal(C.fitResult([true, true, true, false, false, false]), 'consider');
  assert.equal(C.fitResult([true, true, false, false, false, false]), 'learn');
  assert.equal(C.fitResult([false, true, true, true, true, true]), 'learn');
  assert.equal(C.fitResult([true, false, true, true, true, true]), 'learn');
  assert.equal(C.fitResult([false, false, false, false, false, false]), 'learn');
});

console.log(`\n${n} test đạt.`);
