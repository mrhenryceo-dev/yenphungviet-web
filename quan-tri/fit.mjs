// Phase 1S / Giai đoạn B — khung xem trước bài trong trang duyệt.
// Chế độ 🖥 dựng trang ở đúng 1200 px (bố cục máy tính thật) rồi THU NHỎ cho vừa khung — trước đây khung 1200 px
// nằm trong vùng ~780 px (màn hình ~1216 px) nên bị cắt hai bên. Chế độ 📱 390 px không thu nhỏ khi đủ chỗ.
export function fitScale(stageWidth, frameWidth) {
  const avail = Math.max(0, Number(stageWidth) || 0);
  const scale = Math.max(0.25, Math.min(1, Math.round((avail / frameWidth) * 1000) / 1000));
  return { scale, width: frameWidth, outerWidth: Math.round(frameWidth * scale) };
}
