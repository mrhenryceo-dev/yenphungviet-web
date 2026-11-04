// Trang /doi-tac/ — giao diện: checklist, máy tính, biểu đồ, tin nhắn mẫu. Công thức nằm ở doi-tac-calc.js.
// Chỉ chạy trong trình duyệt của khách. KHÔNG gửi dữ liệu đi đâu, KHÔNG ghi Supabase, KHÔNG lưu số đã nhập.

(function () {
  const C = window.DoiTacCalc;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const vnd = C.formatVnd;

  // ---------- Tự đánh giá & danh sách chuẩn bị ----------
  const FIT_TEXT = {
    learn: ['Nên tìm hiểu thêm trước khi bắt đầu', 'Hãy chuẩn bị thêm các điều kiện còn thiếu, nhất là không gian và thời gian chăm sóc. Bạn vẫn có thể hỏi Ji để biết nên bắt đầu chuẩn bị từ đâu.'],
    consider: ['Có thể cân nhắc quy mô trải nghiệm', 'Bạn đã có một phần điều kiện. Nên học với quy mô nhỏ và rà lại những câu chưa đánh dấu.'],
    talk: ['Có thể trao đổi với Ji về kế hoạch khởi đầu', 'Hãy chuẩn bị số liệu về không gian, thời gian, ngân sách và mục tiêu để trao đổi cụ thể hơn.']
  };
  const fitBoxes = [...document.querySelectorAll('input[name="fit"]')];
  $('fit-form').addEventListener('change', () => {
    const [title, body] = FIT_TEXT[C.fitResult(fitBoxes.map(b => b.checked))];
    const box = $('fit-result');
    box.hidden = false;
    box.innerHTML = '<strong>' + esc(title) + '</strong>' + esc(body);
  });
  const prepBoxes = [...document.querySelectorAll('input[name="prep"]')];
  $('prep-form').addEventListener('change', () => {
    $('prep-progress').textContent = 'Đã chuẩn bị ' + prepBoxes.filter(b => b.checked).length + '/' + prepBoxes.length + ' nhóm';
  });

  // ---------- Ô nhập ----------
  const GROUPS = [['invest', 'Đầu tư ban đầu'], ['output', 'Sản lượng và doanh thu giả định'], ['cost', 'Chi phí']];
  const INPUTMODE = { money: 'numeric', int: 'numeric', decimal: 'decimal', percent: 'decimal' };
  $('calc-fields').innerHTML = GROUPS.map(([g, title]) => '<fieldset class="dtp-group"><legend>' + title + '</legend>'
    + C.FIELDS.filter(f => f.group === g).map(f => {
      const describe = 'h-' + f.id + ' e-' + f.id;
      return '<div class="dtp-field" data-field="' + f.id + '" data-modes="' + f.modes.join(' ') + '">'
        + '<label for="f-' + f.id + '">' + esc(f.label) + (f.required ? ' *' : '') + '</label>'
        + '<div class="dtp-input"><input id="f-' + f.id + '" name="' + f.id + '" type="text" inputmode="' + INPUTMODE[f.kind] + '" aria-describedby="' + describe + '"' + (f.required ? ' aria-required="true"' : '') + '>'
        + '<span class="dtp-unit">' + esc(f.unit) + '</span></div>'
        + '<p class="dtp-field-hint" id="h-' + f.id + '"' + (f.hint ? '' : ' hidden') + '>' + esc(f.hint || '') + '</p>'
        + '<p class="dtp-field-err" id="e-' + f.id + '" hidden></p></div>';
    }).join('') + '</fieldset>').join('');

  const form = $('calc-form');
  const getMode = () => document.querySelector('input[name="calc-mode"]:checked').value;
  const rawValues = () => { const o = {}; C.FIELDS.forEach(f => { o[f.id] = form.elements[f.id].value; }); return o; };
  let viewScenario = C.DEFAULT_SCENARIO;
  let lastRun = null;

  function applyMode() {
    const mode = getMode();
    form.querySelectorAll('.dtp-field').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
  }

  function showErrors(run) {
    C.FIELDS.forEach(f => {
      const wrap = form.querySelector('[data-field="' + f.id + '"]');
      const err = $('e-' + f.id), msg = run.errors[f.id];
      wrap.classList.toggle('has-err', !!msg);
      form.elements[f.id].setAttribute('aria-invalid', msg ? 'true' : 'false');
      err.hidden = !msg; err.textContent = msg || '';
    });
  }

  // ---------- Kết quả ----------
  const statusOf = r => {
    if (r.recovered === null) return ['st-na', 'Chưa đủ dữ liệu để đánh giá việc thu hồi tiền', 'Hãy nhập các khoản chi của bạn.'];
    if (r.recovered) return ['st-ok', 'Theo giả định: đã thu hồi đủ tiền chi ra sau 12 tháng', 'Đây là kết quả mô phỏng, không phải kết quả thực tế.'];
    return ['st-no', 'Theo giả định: chưa thu hồi đủ tiền chi ra sau 12 tháng', 'Đây là kết quả mô phỏng, không phải kết quả thực tế.'];
  };
  const row = (label, value, cls) => '<div class="' + (cls || '') + '"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
  const birds = n => n + ' chim';

  function renderResult(r) {
    const [cls, title, sub] = statusOf(r);
    let rows = row('Vốn ban đầu', vnd(r.initialInvestment))
      + row('Chi phí vận hành 12 tháng', vnd(r.opex12))
      + row('Số chim bán được (giả định)', birds(r.birdsSold))
      + row('Doanh thu giả định', vnd(r.revenue))
      + row('Dòng tiền thuần sau 12 tháng', vnd(r.netCash12), 'is-key');
    if (r.mode === 'detail') {
      rows += row('Tháng có thể bắt đầu bán chim', r.firstSaleMonth === null ? 'Chưa có trong kỳ' : 'Tháng ' + r.firstSaleMonth)
        + row('Tháng hòa vốn dòng tiền', r.breakevenMonth === null ? 'Chưa có trong kỳ' : 'Tháng ' + r.breakevenMonth)
        + row('Điểm gãy dòng tiền', r.cashOutMonth === null ? 'Không có trong kỳ' : 'Tháng ' + r.cashOutMonth)
        + row('Tiền cần có thêm để không âm', vnd(r.extraCashNeeded))
        + row('Doanh thu − chi phí vận hành', vnd(r.operatingGap))
        + row('Lợi nhuận kế toán', 'Chưa đủ dữ liệu (khấu hao, giá trị đàn, thuế)', 'is-note')
        + row('Đàn chim còn lại cuối kỳ', r.flock.breeders + ' chim giống, ' + r.flock.unsoldChicks + ' chim non chưa bán. Tham khảo khoảng ' + vnd(r.flock.referenceValue) + ', không phải tiền mặt và không cộng vào doanh thu.', 'is-note');
    }
    const flags = r.flags.length ? '<ul class="dtp-flags">' + r.flags.map(f => '<li class="lv-' + f.level + '">' + esc(f.text) + '</li>').join('') + '</ul>' : '';
    const scLabel = C.SCENARIOS.find(s => s.id === r.scenario).label;
    return '<div class="dtp-result"><div class="dtp-status ' + cls + '">' + esc(title) + '<small>' + esc(sub) + ' Kịch bản: ' + esc(scLabel) + '.</small></div>'
      + '<dl class="dtp-stats">' + rows + '</dl>' + flags
      + (r.mode === 'quick' ? '<p class="dtp-result-foot">Chế độ nhanh chưa có lịch bán nên không chia doanh thu theo tháng và không xác định tháng hòa vốn. Dùng chế độ chi tiết để xem dòng tiền từng tháng.</p>' : '')
      + '<p class="dtp-result-foot">Đây là công cụ mô phỏng, không phải dự báo hoặc cam kết kết quả kinh doanh.</p></div>';
  }

  function renderTable(r) {
    const num = v => '<td' + (v < 0 ? ' class="neg"' : '') + '>' + vnd(v) + '</td>';
    const head = '<caption class="dtp-sr">Thu, chi và số dư từng tháng, kịch bản ' + esc(C.SCENARIOS.find(s => s.id === r.scenario).label) + '</caption><thead><tr>'
      + ['Tháng', 'Chim bán', 'Thu', 'Chi', 'Dòng tiền tháng', 'Lũy kế', 'Tiền mặt còn lại', 'Ghi chú'].map(h => '<th scope="col">' + h + '</th>').join('') + '</tr></thead>';
    const rows = r.months.map(m => {
      const notes = [];
      if (m.month === 0) notes.push('Đầu tư ban đầu');
      if (m.month === r.firstSaleMonth) notes.push('Bắt đầu bán');
      else if (m.sold > 0) notes.push('Đợt bán');
      if (m.month === r.breakevenMonth) notes.push('Hòa vốn dòng tiền');
      if (m.month === r.cashOutMonth) notes.push('Điểm gãy dòng tiền');
      const cls = m.month === r.cashOutMonth ? 'is-out' : m.sold > 0 ? 'is-sale' : '';
      return '<tr class="' + cls + '"><td>' + m.month + '</td><td>' + m.sold + '</td>' + num(m.inflow) + num(m.outflow) + num(m.net) + num(m.cum) + num(m.balance) + '<td>' + notes.join('; ') + '</td></tr>';
    }).join('');
    const foot = '<tfoot><tr><td>Tổng</td><td>' + r.birdsSold + '</td>' + num(r.revenue) + num(r.totalOut) + num(r.netCash12) + '<td></td><td></td><td></td></tr></tfoot>';
    $('calc-table').innerHTML = head + '<tbody>' + rows + '</tbody>' + foot;
  }

  // Trục Y: mốc tròn, viết gọn theo triệu.
  function niceTicks(min, max) {
    const span = Math.max(max - min, 1);
    const raw = span / 4, pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(k => k * pow).find(s => s >= raw);
    const ticks = [];
    for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + 1e-6; v += step) ticks.push(v);
    return ticks;
  }
  const compact = v => {
    if (v === 0) return '0';
    const a = Math.abs(v), sign = v < 0 ? '−' : '';
    if (a >= 1e6) return sign + String(+(a / 1e6).toFixed(1)).replace('.', ',') + ' tr';
    return sign + Math.round(a / 1e3) + ' k';
  };

  function renderChart(r) {
    const box = $('calc-chart');
    const W = Math.max(box.clientWidth, 300), H = W < 560 ? 280 : 340;
    const pad = { l: 48, r: 14, t: 26, b: 34 };
    const vals = r.months.flatMap(m => [m.cum, m.balance]);
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
    const yMin = ticks[0], yMax = ticks[ticks.length - 1];
    const x = m => pad.l + (W - pad.l - pad.r) * m / C.MONTHS;
    const y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - yMin) / ((yMax - yMin) || 1));
    const line = key => r.months.map((m, i) => (i ? 'L' : 'M') + x(m.month).toFixed(1) + ' ' + y(m[key]).toFixed(1)).join(' ');

    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(chartSummary(r)) + '">';
    ticks.forEach(t => {
      s += '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="' + (t === 0 ? 'rgba(42,46,31,0.55)' : 'var(--grid)') + '"/>'
        + '<text x="' + (pad.l - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + compact(t) + '</text>';
    });
    const every = W < 480 ? 2 : 1;
    r.months.forEach(m => { if (m.month % every === 0) s += '<text x="' + x(m.month) + '" y="' + (H - pad.b + 18) + '" text-anchor="middle">' + m.month + '</text>'; });
    s += '<text x="' + (W - pad.r) + '" y="' + (H - 4) + '" text-anchor="end">Tháng</text>';
    s += '<path d="' + line('balance') + '" fill="none" stroke="var(--c-bal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
      + '<path d="' + line('cum') + '" fill="none" stroke="var(--c-cum)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    // Đợt bán: chấm trên đường lũy kế. Hòa vốn/gãy dòng tiền: chấm + nhãn chữ (không chỉ dùng màu).
    r.months.filter(m => m.sold > 0).forEach(m => { s += '<circle cx="' + x(m.month) + '" cy="' + y(m.cum) + '" r="4.5" fill="var(--c-cum)" stroke="#fff" stroke-width="2"/>'; });
    const mark = (month, value, label, color, above) => {
      const px = x(month), py = y(value), anchor = px > W * 0.75 ? 'end' : px < W * 0.25 ? 'start' : 'middle';
      return '<circle cx="' + px + '" cy="' + py + '" r="5.5" fill="' + color + '" stroke="#fff" stroke-width="2"/>'
        + '<text class="m-label" x="' + px + '" y="' + (above ? py - 12 : py + 20) + '" text-anchor="' + anchor + '">' + label + '</text>';
    };
    if (r.breakevenMonth !== null) s += mark(r.breakevenMonth, r.months[r.breakevenMonth].cum, 'Hòa vốn T' + r.breakevenMonth, 'var(--c-cum)', true);
    if (r.cashOutMonth !== null) s += mark(r.cashOutMonth, r.months[r.cashOutMonth].balance, 'Gãy dòng tiền T' + r.cashOutMonth, 'var(--red)', false);
    s += '<line class="dtp-cross" y1="' + pad.t + '" y2="' + (H - pad.b) + '" x1="0" x2="0" stroke="rgba(42,46,31,0.4)" visibility="hidden"/></svg><div class="dtp-tip" hidden></div>';
    box.innerHTML = s;

    // Rê chuột hoặc chạm để xem từng tháng; số liệu đầy đủ nằm ở bảng ngay bên dưới.
    const svg = box.querySelector('svg'), tip = box.querySelector('.dtp-tip'), cross = box.querySelector('.dtp-cross');
    const onMove = e => {
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (W / rect.width);
      const month = Math.max(0, Math.min(C.MONTHS, Math.round((px - pad.l) / (W - pad.l - pad.r) * C.MONTHS)));
      const m = r.months[month];
      cross.setAttribute('x1', x(month)); cross.setAttribute('x2', x(month)); cross.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = '<b>Tháng ' + month + (m.sold ? ' · bán ' + m.sold + ' chim' : '') + '</b>Lũy kế: ' + vnd(m.cum) + '<br>Tiền mặt: ' + vnd(m.balance);
      const tw = tip.offsetWidth, cx = x(month) * (rect.width / W);
      tip.style.left = Math.max(0, Math.min(rect.width - tw, cx - tw / 2)) + 'px';
    };
    const onLeave = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerdown', onMove);
    svg.addEventListener('pointerleave', onLeave);
  }

  function chartSummary(r) {
    return 'Biểu đồ dòng tiền lũy kế 12 tháng. Cuối kỳ ' + vnd(r.netCash12) + '. '
      + (r.breakevenMonth === null ? 'Chưa có tháng hòa vốn trong kỳ. ' : 'Hòa vốn ở tháng ' + r.breakevenMonth + '. ')
      + (r.cashOutMonth === null ? 'Không có điểm gãy dòng tiền.' : 'Điểm gãy dòng tiền ở tháng ' + r.cashOutMonth + '.')
      + ' Số liệu đầy đủ trong bảng bên dưới.';
  }

  function factorText(sc) {
    const f = n => '×' + String(n).replace('.', ',');
    return 'Sinh sản ' + f(sc.breedingFactor) + ' · Tiêu thụ ' + f(sc.sellFactor) + ' · Chi phí ' + f(sc.costFactor);
  }

  function renderScenarios(run) {
    $('scenario-cards').innerHTML = run.scenarios.map(r => {
      const sc = C.SCENARIOS.find(s => s.id === r.scenario), active = r.scenario === viewScenario;
      const extra = r.mode === 'detail'
        ? row('Hòa vốn dòng tiền', r.breakevenMonth === null ? 'Chưa có' : 'Tháng ' + r.breakevenMonth) + row('Gãy dòng tiền', r.cashOutMonth === null ? 'Không có' : 'Tháng ' + r.cashOutMonth) + row('Tiền cần có thêm', vnd(r.extraCashNeeded))
        : '';
      return '<article class="dtp-sc' + (active ? ' is-active' : '') + '"><h4>' + esc(sc.label) + '</h4><p class="dtp-sc-f">' + factorText(sc) + '</p>'
        + '<dl>' + row('Chim bán được', birds(r.birdsSold)) + row('Doanh thu giả định', vnd(r.revenue)) + row('Chi phí vận hành', vnd(r.opex12)) + row('Dòng tiền thuần', vnd(r.netCash12)) + extra + '</dl>'
        + '<div class="dtp-sc-btn"><button type="button" data-sc="' + r.scenario + '" aria-pressed="' + active + '">' + (active ? 'Đang xem' : 'Xem kịch bản này') + '</button></div></article>';
    }).join('');
  }

  function renderOutput() {
    const run = lastRun;
    const res = $('calc-result'), detailOut = $('calc-detail-out'), scen = $('calc-scenarios');
    if (run.state !== 'ok') {
      detailOut.hidden = true; scen.hidden = true;
      if (run.state === 'invalid') res.innerHTML = '<div class="dtp-empty"><strong>Có ô nhập chưa hợp lệ.</strong> Hãy sửa các ô được đánh dấu để xem kết quả. Công cụ không tính với dữ liệu sai.</div>';
      else if (run.state === 'incomplete') {
        const names = run.missing.map(id => C.FIELDS.find(f => f.id === id).label);
        res.innerHTML = '<div class="dtp-empty"><strong>Còn thiếu ' + names.length + ' ô bắt buộc:</strong> ' + esc(names.join('; ')) + '.</div>';
      } else res.innerHTML = '<div class="dtp-empty"><strong>Kết quả sẽ hiện ở đây.</strong> Hãy nhập số của bạn, hoặc bấm “Điền số ví dụ” để xem cách công cụ chạy. Công cụ không điền sẵn số liệu nào.</div>';
      return;
    }
    const r = run.scenarios.find(s => s.scenario === viewScenario);
    res.innerHTML = renderResult(r);
    scen.hidden = false;
    renderScenarios(run);
    if (r.mode === 'detail') {
      detailOut.hidden = false;
      $('chart-title').textContent = 'Kịch bản ' + C.SCENARIOS.find(s => s.id === r.scenario).label + ' · số giả định';
      renderChart(r);
      renderTable(r);
    } else detailOut.hidden = true;
  }

  function recalc() {
    applyMode();
    lastRun = C.run(getMode(), rawValues());
    showErrors(lastRun);
    renderOutput();
  }

  form.addEventListener('input', () => { $('calc-example-note').hidden = true; recalc(); });
  form.addEventListener('submit', e => e.preventDefault());
  // Rời ô tiền → viết lại có dấu chấm cho dễ đọc (không đổi trong lúc đang gõ để con trỏ không nhảy).
  form.addEventListener('focusout', e => {
    const f = C.FIELDS.find(x => x.id === e.target.name);
    if (!f || f.kind !== 'money') return;
    const n = C.parseMoney(e.target.value);
    if (Number.isFinite(n)) e.target.value = vnd(n).replace(' đ', '');
  });
  document.querySelectorAll('input[name="calc-mode"]').forEach(r => r.addEventListener('change', recalc));
  $('calc-example').addEventListener('click', () => {
    C.FIELDS.forEach(f => { form.elements[f.id].value = C.EXAMPLE[f.id]; });
    viewScenario = C.DEFAULT_SCENARIO;
    recalc();
    $('calc-example-note').hidden = false;
  });
  $('calc-clear').addEventListener('click', () => {
    form.reset();
    viewScenario = C.DEFAULT_SCENARIO;
    $('calc-example-note').hidden = true;
    recalc();
  });
  $('scenario-cards').addEventListener('click', e => {
    const b = e.target.closest('button[data-sc]');
    if (!b) return;
    viewScenario = b.dataset.sc;
    renderOutput();
    const again = document.querySelector('button[data-sc="' + viewScenario + '"]');
    if (again) again.focus();
  });
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (lastRun && lastRun.state === 'ok' && getMode() === 'detail') renderChart(lastRun.scenarios.find(s => s.scenario === viewScenario)); }, 150);
  });
  recalc();

  // ---------- Tin nhắn mẫu + sao chép ----------
  const msgBox = $('msg-text'), msgForm = $('msg-form');
  const buildMessage = scale => 'Chào Ji, mình đã đọc trang nuôi Yến Phụng sinh sản trên website Yến Phụng PET.\n\n'
    + 'Quy mô mình quan tâm: ' + (scale || '...') + '\n\n'
    + 'Nhờ Ji tư vấn và báo giá giúp mình.';
  const pickedScale = () => { const el = msgForm.querySelector('input[name="msg-scale"]:checked'); return el ? el.value : ''; };
  msgBox.value = buildMessage('');
  msgForm.addEventListener('change', e => { if (e.target.name === 'msg-scale') msgBox.value = buildMessage(pickedScale()); });
  msgForm.addEventListener('submit', e => e.preventDefault());

  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    return Promise.resolve(legacyCopy(text));
  }
  let toastTimer;
  function showToast(text) {
    const t = $('toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
  }
  $('msg-copy').addEventListener('click', () => {
    copyText(msgBox.value.trim()).then(ok => {
      showToast(ok ? 'Đã sao chép tin nhắn. Hãy dán vào Zalo để gửi cho Ji.' : 'Chưa sao chép được. Hãy chọn và sao chép trong khung tin nhắn.');
      if (!ok) { msgBox.focus(); msgBox.select(); }
    });
  });
  // Nút báo giá theo gói và nút Zalo cuối trang: sao chép tin nhắn rồi để link Zalo mở như thường.
  document.querySelectorAll('[data-pack]').forEach(a => a.addEventListener('click', () => {
    const input = msgForm.querySelector('input[name="msg-scale"][value="' + a.dataset.pack + '"]');
    if (input) input.checked = true;
    msgBox.value = buildMessage(a.dataset.pack);
    copyText(msgBox.value).then(ok => showToast(ok ? 'Đã sao chép tin nhắn về ' + a.dataset.pack + '. Hãy dán vào Zalo để gửi cho Ji.' : 'Zalo đang mở. Bạn nhắn Ji quy mô mình quan tâm nhé.'));
  }));
  $('end-zalo').addEventListener('click', () => {
    copyText(msgBox.value.trim()).then(ok => { if (ok) showToast('Đã sao chép tin nhắn. Hãy dán vào Zalo để gửi cho Ji.'); });
  });
})();
