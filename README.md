# Monopoly Local
A modernized, local multiplayer Monopoly game. The project is split into a Vite React client and an Express server.

## Structure
- `client/` - Vite React front-end
- `server/` - Express server for production builds
- `client-legacy/` - Previous React/Sass build (kept for reference)

## Quick Start (dev)
```sh
chmod 755 start.sh
./start.sh
```
This installs dependencies and runs both client and server in dev mode.

## Run Manually
```sh
npm install
npm install --prefix client
npm install --prefix server

npm run dev
```
- Client: `http://localhost:5173`
- Server: `http://localhost:3000`

## Online Multiplayer
- Chọn chế độ `Online`.
- Nhập nickname, tạo phòng hoặc nhập mã để tham gia.
- Host bấm “Bắt đầu ván” để khởi động.
- Nếu server chạy khác host, đặt `VITE_SERVER_URL` trong môi trường khi chạy client.

## Production Build
```sh
npm run client:build
npm run server:start
```
Then open `http://localhost:3000`.

## Deploy (Vercel)
Lưu ý: Vercel không hỗ trợ Socket.IO server lâu dài, nên chế độ online cần deploy server ở nơi khác (Render/Fly/Railway).

### Deploy client lên Vercel
1. Tạo project mới trên Vercel từ repo này.
2. Build command: `npm run client:build`
3. Output directory: `client/dist`
4. (Nếu có server riêng) set env `VITE_SERVER_URL` đến URL server.

Repo đã có `vercel.json` để cấu hình sẵn các bước trên.

## Gameplay Notes
- Local multiplayer only (2-6 players).
- Full classic rules: properties, rent, houses/hotels, mortgaging, jail, taxes, chance/community chest, auctions, bankruptcy.
