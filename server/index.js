import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";
import { Server } from "socket.io";
import { createInitialState } from "../client/src/game/engine.js";
import { gameReducer } from "../client/src/game/reducer.js";

// Increase EventEmitter listener limit to avoid warnings in high‑player rooms
EventEmitter.defaultMaxListeners = 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);

console.log("--------------------------------------");
console.log(">>> SERVER STARTING v3 - PAYLOAD HACK <<<");
console.log("--------------------------------------");

const io = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 10000, // 10s
  pingTimeout: 5000   // 5s
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

function generateRoomPayload(room) {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    players: room.players.map((player) => ({ id: player.socketId, name: player.name })),
    started: room.started,
    orderMode: room.orderMode,
    presentationMode: room.presentationMode || false
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


  io.to(room.code).emit("room_update", generateRoomPayload(room));
}

io.on("connection", (socket) => {
  socket.on("create_room", (payload) => {
    console.log("[DEBUG] create_room payload:", payload);
    const { name, presentationMode, teamCount } = payload || {};
    if (!name) {
      io.to(socket.id).emit("room_error", { message: "Vui lòng nhập nickname." });
      return;
    }

    const room = createRoom(socket.id, name);
    room.presentationMode = !!presentationMode;
    room.teamCount = teamCount || 4;

    if (room.presentationMode) {
      // Auto-start game logic for Presentation Mode
      const count = room.teamCount;
      const names = Array.from({ length: count }, (_, i) => {
        const num = i === 0 ? 1 : i + 2;
        return `Nhóm ${num}`;
      });
      console.log("[DEBUG] Generated Names:", names); // Verify logic
      const dummyIds = Array.from({ length: count }, (_, i) => `team-${room.code}-${i}`);
      room.playerOrder = dummyIds;
      room.state = createInitialState(names, names.map(() => false));
      room.started = true;
    }

    socket.join(room.code);
    socket.data.roomCode = room.code;

    io.to(socket.id).emit("room_joined", { ...generateRoomPayload(room), youId: socket.id });

    if (room.started && room.state) {
      io.to(socket.id).emit("game_state", room.state);
    }

    // ...
  });

  socket.on("join_room", ({ code, name }) => {
    const room = rooms.get(code);
    if (!room) {
      io.to(socket.id).emit("room_error", { message: "Phòng không tồn tại." });
      return;
    }
    if (room.players.length >= 60) {
      io.to(socket.id).emit("room_error", { message: "Phòng đã đầy." });
      return;
    }

    room.players.push({ socketId: socket.id, name });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    io.to(room.code).emit("room_update", generateRoomPayload(room));
    io.to(socket.id).emit("room_joined", { ...generateRoomPayload(room), youId: socket.id });

    // ...
  });

  socket.on("start_game", () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;

    if (room.hostId !== socket.id) return; // Only host starts

    // Determine Player Order
    let orderedPlayers = [...room.players];
    if (room.orderMode === "random") {
      orderedPlayers = shuffle(orderedPlayers);
    }

    // Set room.playerOrder (list of socketIds)
    room.playerOrder = orderedPlayers.map(p => p.socketId);

    // Initialize game
    const playerNames = orderedPlayers.map(p => p.name);
    // AI flags? Default to false for online for now, or could pass in
    const aiFlags = orderedPlayers.map(() => false);

    room.state = createInitialState(playerNames, aiFlags);
    room.state.orderMode = room.orderMode;

    room.started = true;

    io.to(room.code).emit("game_state", room.state);
    io.to(room.code).emit("room_update", generateRoomPayload(room));
  });

  socket.on("set_order_mode", ({ mode }) => {
    // ...
    io.to(room.code).emit("room_update", generateRoomPayload(room));
  });

  socket.on("dispatch_action", ({ action }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.started || !room.state) return;

    // Check Controller Rights
    const isPresentationHost = room.presentationMode && room.hostId === socket.id;
    const playerIndex = getPlayerIndex(room, socket.id);

    // Allow action if it's normal turn OR if it's Host in Presentation Mode
    if (!isPresentationHost && !canAct(room.state, action, playerIndex)) return;

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
server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
