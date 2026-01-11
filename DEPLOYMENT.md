# Hướng Dẫn Deploy Monopoly (Production)

Để 60 khán giả truy cập ổn định từ mọi nơi (4G/Wifi khác nhau), bạn cần deploy:
1. **Server (Backend API + Socket)** lên **Render**.
2. **Client (Giao diện người chơi)** lên **Vercel**.

---

## Phần 1: Deploy Server (Render)

1. Đẩy code lên **GitHub** (Repo hiện tại của bạn).
2. Truy cập [dashboard.render.com](https://dashboard.render.com).
3. Chọn **New +** -> **Web Service**.
4. Kết nối tới GitHub Repo của bạn.
5. Cấu hình như sau:
   - **Name**: `monopoly-server` (hoặc tên tùy ý)
   - **Root Directory**: `server` (Rất quan trọng! server nằm trong thư mục con)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
6. Bấm **Create Web Service**.
7. Chờ deploy xong. Copy link URL của server (Ví dụ: `https://monopoly-server-xyz.onrender.com`).

---

## Phần 2: Cập Nhật Client

Sau khi có link Server từ Render:

1. Mở file `client/.env` trong code của bạn.
2. Dán link Server vào biến `VITE_SERVER_URL`:
   ```env
   VITE_SERVER_URL=https://monopoly-server-xyz.onrender.com
   ```
   *(Bỏ comment và thay thế link cũ)*.
3. Commit và Push thay đổi này lên GitHub:
   ```bash
   git add client/.env
   git commit -m "Update production server url"
   git push
   ```

---

## Phần 3: Deploy Client (Vercel)

1. Truy cập [vercel.com](https://vercel.com).
2. Chọn **Add New...** -> **Project**.
3. Import GitHub Repo của bạn.
4. Cấu hình:
   - **Framework Preset**: Vite
   - **Root Directory**: `client` (Bấm Edit và chọn folder client)
   - **Build Command**: `npm run build` (Mặc định)
   - **Output Directory**: `dist` (Mặc định)
5. Bấm **Deploy**.
6. Sau khi xong, Vercel sẽ cấp cho bạn một domain (Ví dụ: `https://monopoly-client.vercel.app`).

## Hoàn Tất
Gửi link Vercel (`https://monopoly-client.vercel.app`) cho 60 khán giả. Họ có thể truy cập từ bất kỳ đâu!
