# COST ESTIMATE — Xưởng nội dung AI

## Chi phí thực tế trong 5 ngày OWNER vắng: **0đ**
Không gọi API AI trả phí, không tạo dịch vụ mới. Chỉ dùng mock provider và yêu cầu đọc công khai miễn phí.

## Chi phí cố định
| Khoản | Chi phí | Ghi chú |
|---|---|---|
| Supabase (Free) — bảng, Storage, Edge Function | 0đ thêm | Dùng chung hạn mức với App trại (DB 500 MB, Storage 1 GB, 500.000 lượt gọi function / tháng — theo gói Free công bố; OWNER kiểm tra trang Billing) |
| Vercel | 0đ (Hobby) / 20 USD tháng (Pro, khuyến nghị cho website bán hàng) | Việc riêng, không phụ thuộc Xưởng |
| ChatGPT Plus | Không cần cho Xưởng | API tính tiền riêng |

## Chi phí theo lượt (AI thật) — CÔNG THỨC, chưa dùng bảng giá thật
Giá model thay đổi thường xuyên → Claude **không ghi số cố định**. OWNER lấy giá ở trang giá chính thức của nhà cung cấp và điền vào Secret `KT_AI_PRICES`; Xưởng tự ước tính chi phí từng lượt và chặn khi vượt ngân sách tháng.

Ước lượng khối lượng mỗi bài (từ prompt và độ dài bài mẫu):
- Viết bài: ~4.000–6.000 token vào (hướng dẫn biên tập + danh sách bài đã có) và ~4.000–8.000 token ra (bài 900–1.800 từ tiếng Việt kèm JSON).
- Sửa theo góp ý: thêm ~1 lần như trên.
- Ảnh: 4–8 ảnh mỗi bài (mặc định tối đa 8).
- Gợi ý chủ đề: ~1.500 token vào, ~800 token ra.

```
Chi phí 1 bài ≈ (token_vào × giá_vào + token_ra × giá_ra) / 1.000.000 + số_ảnh × giá_ảnh
```
Ví dụ cách tính (giá GIẢ ĐỊNH, không phải báo giá): nếu giá chữ là 3 USD / 1M token vào và 15 USD / 1M token ra, ảnh 0,05 USD / ảnh → 5.000 × 3/1M + 6.000 × 15/1M + 6 × 0,05 ≈ 0,015 + 0,09 + 0,30 ≈ **0,4 USD / bài**. Phần lớn chi phí thường là ảnh.

## Cập nhật Giai đoạn B (2026-10-19) — theo bảng giá công bố, OWNER kiểm tra lại trước khi bật
Nguồn: trang giá OpenAI (developers.openai.com/api/docs/pricing) + bảng giá ảnh trong hướng dẫn tạo ảnh của OpenAI.
| Khoản | Giá công bố | Mỗi bài (~6 nghìn token vào, ~7 nghìn ra, 6 ảnh) |
|---|---|---|
| Chữ `gpt-6.1-sol` | 2 USD vào / 10 USD ra mỗi 1M token | ≈ 0,08 USD |
| Chữ mini `gpt-6-luna` | 0,10 / 0,50 USD | ≈ 0,004 USD |
| Ảnh GPT Image 2 low / **medium** / high (1536×1024) | 0,005 / **0,041** / 0,165 USD mỗi ảnh | 0,03 / **0,25–0,32** / 1,0–1,3 USD |
| Anthropic Message Batches (chữ) | giảm 50 % so với giá thường | xem bảng giá Anthropic |
| Supabase: Edge Function, DB, Storage | trong gói Free | 15–30 lần gọi + ~1–2 MB ảnh |
| Telegram | miễn phí | 0 |

→ **~0,35 USD / bài** (chữ thường + ảnh medium) · **1 bài / ngày ≈ 10–11 USD / tháng** · ảnh low ≈ 3–4 USD / tháng.
Nhịp cron 5 phút (nếu bật) ≈ 8.640 lần gọi / tháng (Free: 500.000). Lịch tự động bắt buộc có ngân sách tháng trong `kt_ai_settings` (≤ 200 USD) — máy chủ dùng giá trị NHỎ HƠN giữa ngân sách này và `KT_AI_MONTHLY_BUDGET_USD`.

## Giới hạn mặc định (đổi qua Secrets, có trần cứng trong code)
| Giới hạn | Mặc định | Trần cứng |
|---|---|---|
| Ngân sách tháng | 15 USD | 200 USD |
| Bài / ngày | 5 | 30 |
| Ảnh / ngày | 40 | 120 |
| Ảnh / bài | 8 | 12 |
| Token ra / lượt | 9.000 | 32.000 |
| Thử lại khi lỗi tạm thời | 2 | 3 |
| Lần tạo / 1 việc | 3 | — |

Khuyến nghị: đặt thêm **hạn mức chi tiêu tháng ở trang nhà cung cấp** (lớp chặn cuối cùng, kể cả khi code có lỗi).
