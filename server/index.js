import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { createInitialState } from "../client/src/game/engine.js";
import { gameReducer } from "../client/src/game/reducer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const clientDist = path.resolve(__dirname, "..", "client", "dist");

const rooms = new Map();

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createRoom(socketId, name) {
  let code = makeRoomCode();
  while (rooms.has(code)) code = makeRoomCode();
  const room = {
    code,
    hostId: socketId,
    players: [{ socketId, name }],
    started: false,
    state: null,
    playerOrder: [],
    orderMode: "sequential"
  };
  rooms.set(code, room);
  return room;
}

function roomPayload(room) {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    players: room.players.map((player) => ({ id: player.socketId, name: player.name })),
    started: room.started,
    orderMode: room.orderMode
  };
}

function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.socketId === socketId)) return room;
  }
  return null;
}

function getPlayerIndex(room, socketId) {
  const source = room.started ? room.playerOrder : room.players.map((p) => p.socketId);
  return source.indexOf(socketId);
}

function nextActiveIndex(state) {
  const total = state.players.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const next = (state.activePlayerIndex + offset) % total;
    if (!state.players[next].bankrupt) return next;
  }
  return state.activePlayerIndex;
}

function forceBankrupt(state, index, playerName) {
  const nextState = {
    ...state,
    players: state.players.map((player, idx) => {
      if (idx !== index) return player;
      return {
        ...player,
        bankrupt: true,
        cash: 0,
        properties: []
      };
    }),
    properties: { ...state.properties },
    lastCreditorId: null,
    log: [`${playerName} đã rời phòng và bị phá sản.`, ...state.log].slice(0, 40)
  };

  Object.keys(nextState.properties).forEach((key) => {
    const id = Number(key);
    if (nextState.properties[id]?.ownerId === index) {
      nextState.properties[id] = {
        ...nextState.properties[id],
        ownerId: null,
        mortgaged: false,
        houses: 0
      };
    }
  });

  if (nextState.activePlayerIndex === index) {
    nextState.activePlayerIndex = nextActiveIndex(nextState);
  }

  return nextState;
}

function canAct(state, action, playerIndex) {
  if (playerIndex < 0) return false;
  if (action.type === "AUCTION_BID" || action.type === "AUCTION_PASS") {
    return state.pending?.type === "auction" && state.pending.activeBidderId === playerIndex;
  }
  return state.activePlayerIndex === playerIndex;
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(express.static(clientDist));

app.get("*", (req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

function handleLeave(socket) {
  const room = findRoomBySocket(socket.id);
  if (!room) return;

  room.players = room.players.filter((p) => p.socketId !== socket.id);

  if (room.started && room.state) {
    const index = getPlayerIndex(room, socket.id);
    if (index >= 0) {
      const playerName = room.state.players[index]?.name || "Người chơi";
      room.state = forceBankrupt(room.state, index, playerName);
      io.to(room.code).emit("game_state", room.state);
    }
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players[0]?.socketId || null;
  }

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  io.to(room.code).emit("room_update", roomPayload(room));
}

io.on("connection", (socket) => {
  socket.on("create_room", ({ name }) => {
    if (!name) {
      io.to(socket.id).emit("room_error", { message: "Vui lòng nhập nickname." });
      return;
    }
    const room = createRoom(socket.id, name);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    io.to(socket.id).emit("room_joined", { ...roomPayload(room), youId: socket.id });
  });

  socket.on("join_room", ({ code, name }) => {
    const roomCode = String(code || "").trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!name) {
      io.to(socket.id).emit("room_error", { message: "Vui lòng nhập nickname." });
      return;
    }
    if (!room || room.players.length >= 8) {
      io.to(socket.id).emit("room_error", { message: "Phòng không tồn tại hoặc đã đầy." });
      return;
    }
    if (room.started) {
      io.to(socket.id).emit("room_error", { message: "Ván chơi đã bắt đầu." });
      return;
    }
    room.players.push({ socketId: socket.id, name });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    io.to(room.code).emit("room_update", roomPayload(room));
    io.to(socket.id).emit("room_joined", { ...roomPayload(room), youId: socket.id });
  });

  socket.on("start_game", () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id) return;
    const orderedPlayers = room.orderMode === "random" ? shuffle(room.players) : room.players;
    const names = orderedPlayers.map((p) => p.name);
    room.playerOrder = orderedPlayers.map((p) => p.socketId);
    room.state = createInitialState(names, []);
    room.started = true;
    io.to(room.code).emit("game_state", room.state);
    io.to(room.code).emit("room_update", roomPayload(room));
  });

  socket.on("set_order_mode", ({ mode }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.hostId !== socket.id || room.started) return;
    room.orderMode = mode === "random" ? "random" : "sequential";
    io.to(room.code).emit("room_update", roomPayload(room));
  });

  socket.on("dispatch_action", ({ action }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.started || !room.state) return;
    const playerIndex = getPlayerIndex(room, socket.id);
    if (!canAct(room.state, action, playerIndex)) return;
    room.state = gameReducer(room.state, action);
    io.to(room.code).emit("game_state", room.state);
  });

  socket.on("leave_room", () => {
    handleLeave(socket);
    socket.leave(socket.data.roomCode || "");
    socket.data.roomCode = null;
    io.to(socket.id).emit("room_left");
  });

  socket.on("disconnect", () => {
    handleLeave(socket);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
