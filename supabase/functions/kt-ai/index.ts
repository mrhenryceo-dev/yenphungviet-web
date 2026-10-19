// Phase 1S — Supabase Edge Function "kt-ai" (Deno). Toàn bộ logic ở handler.mjs (test được bằng Node).
// Thư mục ./ai/ là BẢN SAO của assets/kt/ai/ — tạo bằng: node tools/build-edge.mjs (test kiểm tra luôn đồng bộ).
// Triển khai (OWNER duyệt trước): supabase functions deploy kt-ai --project-ref bnumqtjzbyrtavsdlleq
// verify_jwt = true (mặc định) → Supabase chặn request không có JWT hợp lệ trước khi vào đây
// (cron / tự nối tiếp gửi kèm anon key làm JWT + header x-kt-worker-secret).
// Giai đoạn B: EdgeRuntime.waitUntil giữ máy chạy việc hoạt động SAU khi đã trả lời (trong giới hạn 150 s / 400 s).
import { handle } from './handler.mjs';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve((req: Request) => {
  const env = Deno.env.toObject();
  // Không bao giờ cho phép cờ dành riêng máy local đi vào môi trường thật
  delete env.KT_DEV_FAKE_OWNER;
  delete env.KT_RUNTIME;
  const waitUntil = typeof EdgeRuntime !== 'undefined' && EdgeRuntime ? (p: Promise<unknown>) => EdgeRuntime!.waitUntil(p) : null;
  return handle(req, env, { waitUntil });
});
