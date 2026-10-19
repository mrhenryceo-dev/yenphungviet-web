# PROGRESS — Phase 1R hoàn thiện + Phase 1S AI Content Factory

Bắt đầu: 2026-10-14. OWNER vắng ~5 ngày. File này để tiếp tục nếu phiên Claude Code bị gián đoạn.

## Ràng buộc (không được vi phạm)
- Không đụng dự án khác ngoài YenPhungViet / restart Windows / tác vụ nặng kéo dài.
- Không Production, không merge `main`, không push, không deploy Preview mới.
- Không ghi Supabase thật (chỉ đọc bằng anon key khi cần), không migration thật, không đổi Auth/RLS/Storage.
- Không gọi API AI trả phí. Dùng mock provider, ghi rõ là mock.
- Không lưu khóa/mật khẩu vào Git.
- Dev server chỉ 127.0.0.1:8781; chỉ tắt đúng tiến trình node của dev server.

## Nhánh
- `feature/phase1r-kien-thuc` (đã push tới 7640553): Giai đoạn 1 — sửa Phase 1R (commit local, chưa push).
- `feature/phase1s-ai-factory` (tạo từ 1R sau GĐ1): Giai đoạn 2–5.

## Tài liệu tham chiếu
- Knowledge / MASTER LIST FINAL 4.2: KHÔNG có trên máy. Dùng `data/catalogue.js` (MASTER LIST Phase 1B đã duyệt, 50 tên quốc tế) và `data/guides.js` (25 Cẩm nang) — ghi rõ phần chưa xác minh.

## Trạng thái
- [x] GĐ1 Phase 1R (commit trên feature/phase1r-kien-thuc, CHƯA push): bỏ cuộn ngang bộ lọc, thiết kế tạp chí, mục lục + tiến độ đọc, 5 bố cục (cover.layout), ảnh bìa fetchpriority, menu mobile, link theo môi trường + dải cảnh báo Preview, CSP cho /quan-tri/, bỏ cờ og_stale khi lưu. Test: SQL 74, web 15, render 18, media 8, data 7.
- [x] GĐ2 Phase 1S: migration kt_r2 (chuẩn bị, KHÔNG chạy) + test PGlite; lõi AI (topics, schema, layouts, QA, providers mock/openai/anthropic, limits); Edge Function kt-ai; UI Xưởng nội dung + trang duyệt + phiên bản
- [x] GĐ3: 3 bài mẫu (assets/kt/ai/mock-data.mjs → tools/kt-sample-ai.json, không ghi DB)
- [x] GĐ4: node tools/run-all-tests.mjs → 11/11 nhóm (render 18, ảnh 8, data 7, AI 33, SQL 74+26+15, đồng bộ, hồi quy, quét khóa, frontend)
- [x] GĐ5: PHASE_1R_1S_FINAL_REPORT.md, DEPLOYMENT_CHECKLIST.md, OWNER_APPROVAL_REQUIRED.md, SECURITY_AUDIT.md, COST_ESTIMATE.md, NEXT_ACTIONS.md

## Nhật ký
- 2026-10-14: khởi tạo. Đã xác nhận không có tài liệu Knowledge trên máy.
- 2026-10-14: GĐ1 xong. Kiểm tra 390/341/314px: không tràn ngang. CSP không chặn admin (thật + dev + xem trước).
- 2026-10-14: GĐ2 phần lõi: assets/kt/ai/{taxonomy,text,package,compose,qa,prompt,limits,providers,mockimg,mock-data,pipeline}.mjs; Edge Function supabase/functions/kt-ai (handler.mjs + index.ts, bản sao ai/ qua tools/build-edge.mjs); migration kt_r2 (CHƯA CHẠY) + 26 test PGlite. 3 bài mẫu (GĐ3) nằm trong mock-data.mjs, nguồn đã mở đọc được. Còn lại: UI Xưởng + trang duyệt, test lõi, docs.
- 2026-10-14: GĐ2 UI xong (Xưởng #ai, duyệt #duyet/<id>), E2E dev: nạp mẫu → tạo → ảnh → góp ý → AI sửa → duyệt xuất bản (dev) → đồng bộ trạng thái. GĐ3 xong. Tiếp: GĐ4 bộ chạy test + GĐ5 tài liệu.
- 2026-10-19: Đã push 2 nhánh (commit viết lại để bỏ thông tin riêng: 1R `6a3c64a`, 1S `12e6109`). Đã sao lưu đầy đủ ra ngoài thư mục dự án (OWNER biết vị trí).
- 2026-10-19: **GIAI ĐOẠN B** (máy chạy việc phía máy chủ) — xong ở local: worker.mjs (hàng đợi, khóa thuê, từng bước, thử lại có giới hạn), AI bất đồng bộ (OpenAI background / Anthropic Batches), kiểm tra link nguồn (sources.mjs), thông báo dry-run + Telegram (notify.mjs), Edge Function tick/kick, migration kt_r3 (CHƯA CHẠY) + lịch cron riêng (CHƯA CHẠY), lịch tự động mặc định TẮT, sửa khung xem trước bị cắt ở ~1216 px. Test: 13/13 nhóm (mới: worker 37, SQL kt_r3 32). Không deploy / migration / AI thật. Xem `PHASE_1S_GIAI_DOAN_B_REPORT.md`.
- 2026-10-19 (tối): Bổ sung 3 lựa chọn của OWNER: Duyệt & đăng / Sửa – Tạo lại / 🗑 Xóa bài (chỉ nháp, hỏi xác nhận, ghi nhớ chủ đề + lý do để AI không đề xuất lại); chống xóa bài công khai bằng trigger trong kt_r3 (CHƯA CHẠY, hash mới `781baf74…`); nút lớn dính đáy trên điện thoại. Test 13/13 (worker 44, SQL kt_r3 42). Chưa push.
- 2026-10-14: HOÀN TẤT 5 giai đoạn trong phạm vi được phép. Dừng chờ OWNER duyệt (xem OWNER_APPROVAL_REQUIRED.md). Chi phí phát sinh: 0đ. Không push / deploy / ghi Supabase.
