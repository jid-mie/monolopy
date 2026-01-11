# Hướng Dẫn Giữ Server Render Không Bị "Ngủ Đông" (Keep-Alive)

Dịch vụ Render Free sẽ tắt server sau 15 phút không hoạt động. Để giữ server luôn chạy cho 60 khán giả, bạn hãy làm theo các bước sau.

## Bước 1: Deploy Server lên Render
*(Đã hướng dẫn ở file DEPLOYMENT.md)*
Sau khi deploy xong, bạn sẽ có link ví dụ: `https://monopoly-server-xyz.onrender.com`

Đường dẫn kiểm tra sức khỏe (Health Check) sẽ là:
`https://monopoly-server-xyz.onrender.com/api/health`
*(Hãy thử dán link này vào trình duyệt, nếu thấy `{"status":"ok"}` là đúng)*.

---

## Bước 2: Cấu Hình Ping Tự Động (Chọn 1 trong 2 cách)

### Cách A: Dùng Cron-job.org (Khuyên dùng - Đơn giản nhất)
1. Truy cập [https://console.cron-job.org](https://console.cron-job.org) và đăng ký tài khoản (miễn phí).
2. Chọn **Create Cronjob**.
3. Điền thông tin:
   - **Title**: Monopoly Ping
   - **URL**: `https://monopoly-server-xyz.onrender.com/api/health` (Thay bằng link Server thật của bạn).
   - **Execution schedule**: Chọn **Every 5 minutes** (5 phút một lần).
4. Bấm **Create**.

Xong! Cron-job sẽ "gõ cửa" server của bạn 5 phút một lần, đảm bảo nó không bao giờ ngủ.

### Cách B: Dùng UptimeRobot
1. Truy cập [https://uptimerobot.com](https://uptimerobot.com) và đăng ký.
2. Chọn **Add New Monitor**.
3. Chọn Monitor Type: **HTTP(s)**.
4. Điền thông tin:
   - **Friendly Name**: Monopoly Server
   - **URL**: `https://monopoly-server-xyz.onrender.com/api/health`
   - **Monitoring Interval**: 5 minutes.
5. Bấm **Create Monitor**.

---

## Lưu ý quan trọng
- Ngay sau khi sự kiện kết thúc, bạn nên **Xóa** hoặc **Tạm dừng (Pause)** Cronjob/Monitor này.
- Lý do: Render Free cho phép 750 giờ chạy mỗi tháng (đủ cho 1 server chạy 24/7). Nếu bạn treo server này mãi mãi mà không dùng, bạn có thể hết giờ miễn phí cho các dự án khác của bạn.
