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
- 2026-10-14: HOÀN TẤT 5 giai đoạn trong phạm vi được phép. Dừng chờ OWNER duyệt (xem OWNER_APPROVAL_REQUIRED.md). Chi phí phát sinh: 0đ. Không push / deploy / ghi Supabase.
