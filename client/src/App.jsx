import React, { useMemo, useReducer, useRef, useState, useEffect } from "react";
import { io } from "socket.io-client";
import Board from "./components/Board";
import { gameReducer } from "./game/reducer";
import { BOARD, LIQUIDITY } from "./game/board";
import { canBuildHouse, canSellHouse } from "./game/engine";
import { QUESTIONS } from "./game/questions";
import "./App.css";

const playerColors = [
  "#2f6f9f",
  "#b64b3a",
  "#6c8f3f",
  "#7851a9",
  "#c3912c",
  "#1f3a3a"
];

const playerIcons = [
  "🎩", // Top hat
  "🚗", // Car
  "🚢", // Ship
  "👟", // Shoe
  "🐕", // Dog
  "🐈", // Cat
  "🦖", // Dino
  "🦆"  // Duck
];

const initialState = { phase: "setup", players: [], log: [] };

const typeLabels = {
  go: "GO",
  jail: "Nhà tù",
  free_parking: "Bãi đỗ xe",
  go_to_jail: "Vào tù",
  chance: "Cơ hội",
  chest: "Rương kho báu",
  challenge: "Thử thách",
  railroad: "Đường sắt",
  utility: "Tiện ích",
  tax: "Thuế",
  property: "Bất động sản"
};

const groupLabels = {
  railroads: "Đường sắt",
  utilities: "Tiện ích",
  brown: "Nâu",
  lightblue: "Xanh nhạt",
  pink: "Hồng",
  orange: "Cam",
  red: "Đỏ",
  yellow: "Vàng",
  green: "Xanh lá",
  darkblue: "Xanh đậm"
};

const colorMap = {
  brown: "#8d5a3b",
  lightblue: "#8cc7e8",
  pink: "#d17bb7",
  orange: "#f39c32",
  red: "#cf3f3f",
  yellow: "#f2d94e",
  green: "#3b8f5a",
  darkblue: "#2150a0"
};

const DISCOUNT_BY_DIFFICULTY = { easy: 10, medium: 20, hard: 30 };
const CHALLENGE_REWARD = {
  easy: { win: 50, lose: 20 },
  medium: { win: 100, lose: 40 },
  hard: { win: 150, lose: 60 }
};

function formatMoney(value) {
  if (value === null || value === undefined) return "--";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function groupProperties(properties, player) {
  const groups = {};
  if (!player?.properties) return groups;
  player.properties.forEach((id) => {
    const square = BOARD[id];
    let key = square.color;
    if (square.type === "railroad") key = "railroads";
    if (square.type === "utility") key = "utilities";
    if (!key) return;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(square);
  });
  return groups;
}

function getLiquidity(square) {
  if (square.type === "property") return LIQUIDITY[square.color] || 1;
  if (square.type === "railroad") return LIQUIDITY.railroads;
  if (square.type === "utility") return LIQUIDITY.utilities;
  return 1;
}

function computeLiquidityScores(players, properties) {
  return players.map((player) => {
    let total = player.cash || 0;
    (player.properties || []).forEach((id) => {
      const square = BOARD[id];
      const info = properties[id];
      const baseValue = square.price || 0;
      total += baseValue * getLiquidity(square);
      if (square.houseCost && info?.houses) {
        total += (square.houseCost * info.houses) * 0.5;
      }
    });
    return { id: player.id, name: player.name, total };
  }).sort((a, b) => b.total - a.total);
}

export default function App() {
  const [localState, dispatchLocal] = useReducer(gameReducer, initialState);
  const [mode, setMode] = useState(null); // 'local', 'online', or null (menu)
  const [onlineTab, setOnlineTab] = useState("create"); // 'create' or 'join'
  const [onlineState, setOnlineState] = useState(null);
  const [roomInfo, setRoomInfo] = useState(null);
  const [roomError, setRoomError] = useState("");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [youId, setYouId] = useState(null);
  const socketRef = useRef(null);
  const [playerNames, setPlayerNames] = useState(["", "", "", "", "", ""]);
  const [presentationMode, setPresentationMode] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [teamCount, setTeamCount] = useState(4);
  const [trade, setTrade] = useState({ fromId: 0, toId: 1, cash: 0, propertyId: "" });
  const [auctionBid, setAuctionBid] = useState(0);
  const [selectedSquareId, setSelectedSquareId] = useState(0);
  const [orderModeLocal, setOrderModeLocal] = useState("sequential");
  const [buyBackId, setBuyBackId] = useState("");

  const state = mode === "online"
    ? (roomInfo?.started
      ? (onlineState || { phase: "loading", players: roomInfo?.players || [], log: [] })
      : { phase: roomInfo ? "lobby" : "setup", players: roomInfo?.players || [], log: [] })
    : localState;

  const activePlayer = state?.players?.[state?.activePlayerIndex];

  const ownedGroups = useMemo(() => {
    if (!activePlayer) return {};
    return groupProperties(state.properties, activePlayer);
  }, [activePlayer, state.properties]);

  const canRollAgain = state.roll?.isDouble && state.phase === "post_roll";
  const needsFunds = activePlayer && activePlayer.cash < 0;
  const [isRolling, setIsRolling] = useState(false);
  const [displayRoll, setDisplayRoll] = useState(null);
  const [questionTimer, setQuestionTimer] = useState(15);
  const rollIntervalRef = useRef(null);
  const questionTimerRef = useRef(null);

  useEffect(() => {
    if (!state.roll) return;
    setIsRolling(true);
    setDisplayRoll({ die1: 1, die2: 1 });
    if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
    rollIntervalRef.current = setInterval(() => {
      setDisplayRoll({
        die1: Math.floor(Math.random() * 6) + 1,
        die2: Math.floor(Math.random() * 6) + 1
      });
    }, 120);
    const timer = setTimeout(() => {
      clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = null;
      setDisplayRoll({ die1: state.roll.die1, die2: state.roll.die2 });
      setIsRolling(false);
    }, 900);
    return () => {
      clearInterval(rollIntervalRef.current);
      if (timer) clearTimeout(timer);
    };
  }, [state.roll?.die1, state.roll?.die2]);

  // Question timer effect
  useEffect(() => {
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }
    if (state.phase !== "question" || !state.pending?.type === "question") {
      setQuestionTimer(15);
      return;
    }
    setQuestionTimer(15);
    questionTimerRef.current = setInterval(() => {
      setQuestionTimer((prev) => {
        if (prev <= 1) {
          clearInterval(questionTimerRef.current);
          questionTimerRef.current = null;
          dispatchAction({ type: "QUESTION_ANSWER", payload: { choiceIndex: -1 } });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    };
  }, [state.phase, state.pending?.questionIndex]);

  useEffect(() => {
    if (mode !== "online") {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setRoomInfo(null);
      setOnlineState(null);
      setYouId(null);
      setRoomError("");
      return;
    }
    if (socketRef.current) return;
    const socketUrl = import.meta.env.VITE_SERVER_URL || undefined;
    console.log("Initializing socket...");
    const socket = io(socketUrl, {
      path: "/socket.io",
      transports: ["websocket", "polling"], // Enable WS for performance
      reconnectionAttempts: 10
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ Socket Connected! ID:", socket.id);
      setRoomError("");
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Socket Connect Error:", err.message);
      setRoomError("Lỗi kết nối Server: " + err.message);
    });
    socket.on("room_joined", (payload) => {
      console.log("🔥 ROOM JOINED PAYLOAD:", payload); // Look for this in console
      setRoomInfo(payload);
      setYouId(payload.youId);
      setRoomError("");
    });
    socket.on("room_update", (payload) => setRoomInfo(payload));
    socket.on("room_error", (payload) => setRoomError(payload.message || "Lỗi phòng."));
    socket.on("connect_error", () => setRoomError("Không kết nối được server."));
    socket.on("game_state", (payload) => setOnlineState(payload));
    socket.on("room_left", () => {
      setRoomInfo(null);
      setOnlineState(null);
      setYouId(null);
    });
  }, [mode]);

  const availableProperties = useMemo(() => {
    if (!state.players?.length || !state.players[0]?.properties) return [];
    return state.players.flatMap((player) =>
      player.properties.map((id) => ({ id, name: BOARD[id].name, ownerId: player.id }))
    );
  }, [state.players]);

  const tradeOptions = useMemo(() => {
    return availableProperties.filter((prop) => prop.ownerId === Number(trade.fromId));
  }, [availableProperties, trade.fromId]);

  const unownedOptions = useMemo(() => {
    if (!state.properties) return [];
    return Object.entries(state.properties)
      .filter(([, info]) => info.ownerId === null || info.ownerId === undefined)
      .map(([id]) => Number(id))
      .filter((id) => ["property", "railroad", "utility"].includes(BOARD[id]?.type));
  }, [state.properties]);

  useEffect(() => {
    if (state.phase === "setup") setSelectedSquareId(0);
  }, [state.phase]);

  // AUTO KEEP ALIVE: Ping server every 5 minutes to prevent Render Sleep Mode
  useEffect(() => {
    if (mode === "online") {
      const pingInterval = setInterval(() => {
        const url = import.meta.env.VITE_SERVER_URL;
        if (url) {
          console.log("[KeepAlive] Pinging server...");
          fetch(url, { mode: 'no-cors' }) // no-cors to avoid CORS errors if just pinging
            .then(() => console.log("[KeepAlive] Ping sent."))
            .catch(e => console.warn("[KeepAlive] Ping failed:", e));
        }
      }, 4 * 60 * 1000); // 4 minutes (safe margin < 15 mins)
      return () => clearInterval(pingInterval);
    }
  }, [mode]);

  const startGame = () => {
    const names = playerNames.map((name) => name.trim()).filter(Boolean);
    if (names.length < 2) {
      alert("Cần ít nhất 2 người.");
      return;
    }
    const aiFlags = playerNames.map((name, idx) => Boolean(name.trim()) && playerAIs[idx]);
    if (orderModeLocal === "random") {
      const zipped = names.map((name, idx) => ({ name, ai: aiFlags[idx] }));
      const shuffled = shuffle(zipped);
      dispatchLocal({
        type: "START_GAME",
        payload: {
          names: shuffled.map((item) => item.name),
          aiFlags: shuffled.map((item) => item.ai)
        }
      });
      return;
    }
    dispatchLocal({ type: "START_GAME", payload: { names, aiFlags } });
  };

  const resetGame = () => {
    dispatchLocal({ type: "RESET" });
    setPlayerNames(Array(6).fill(""));
    setPlayerAIs(Array(6).fill(false));
    setOrderModeLocal("sequential");
  };

  const handleTrade = () => {
    if (trade.fromId === trade.toId) return;
    dispatchAction({
      type: "TRADE_EXECUTE",
      payload: {
        fromId: Number(trade.fromId),
        toId: Number(trade.toId),
        cash: Number(trade.cash || 0),
        propertyId: trade.propertyId ? Number(trade.propertyId) : null
      }
    });
  };

  const handleBuyBack = () => {
    if (!buyBackId) return;
    dispatchAction({ type: "BUY_OWNED_PROPERTY", payload: { squareId: Number(buyBackId) } });
  };

  const dispatchAction = (action) => {
    if (mode === "online") {
      socketRef.current?.emit("dispatch_action", { action });
      return;
    }
    dispatchLocal(action);
  };

  const createRoom = () => {
    console.log("createRoom called", {
      nickname,
      presentationMode,
      teamCount,
      socketExists: !!socketRef.current,
      connected: socketRef.current?.connected
    });

    if (!nickname.trim()) {
      alert("Vui lòng nhập tên hiển thị.");
      return;
    }
    if (!socketRef.current || !socketRef.current.connected) {
      alert("Chưa kết nối được đến Server (Đang kết nối...). Vui lòng đợi 5s rồi thử lại.");
      return;
    }
    socketRef.current.emit("create_room", { name: nickname.trim(), presentationMode, teamCount });
  };

  const joinRoom = () => {
    if (!nickname.trim() || !roomCode.trim()) {
      alert("Vui lòng nhập Tên hiển thị và Mã phòng.");
      return;
    }
    socketRef.current?.emit("join_room", { code: roomCode.trim().toUpperCase(), name: nickname.trim() });
  };

  const startOnlineGame = () => socketRef.current?.emit("start_game");
  const leaveRoom = () => {
    socketRef.current?.emit("leave_room");
    setRoomInfo(null);
    setOnlineState(null);
    setYouId(null);
  };
  const changeOrderModeOnline = (e) => socketRef.current?.emit("set_order_mode", { mode: e.target.value });

  const aiLock = useRef(false);

  useEffect(() => {
    if (mode !== "local") return;
    if (!activePlayer || !activePlayer.isAI) {
      aiLock.current = false;
      return;
    }
    if (aiLock.current) return;

    const runAction = (action) => {
      aiLock.current = true;
      setTimeout(() => {
        dispatchLocal(action);
        aiLock.current = false;
      }, 600);
    };

    if (state.phase === "await_roll") {
      runAction({ type: "ROLL" });
      return;
    }
    if (state.phase === "jail_choice") {
      runAction({ type: activePlayer.cash >= 250 ? "JAIL_PAY" : "JAIL_ROLL" });
      return;
    }
    if (state.phase === "buy_decision" && state.pending?.squareId !== undefined) {
      const sq = BOARD[state.pending.squareId];
      runAction({ type: activePlayer.cash - sq.price >= 200 ? "BUY" : "DECLINE_BUY" });
      return;
    }
    if (state.phase === "buy_back_decision" && state.pending?.type === "buy_back") {
      runAction({ type: activePlayer.cash >= state.pending.buyBackCost ? "BUY_OWNED_PROPERTY" : "DECLINE_BUY_OWNED_PROPERTY" });
      return;
    }
    if (state.phase === "auction" && state.pending?.type === "auction") {
      const auction = state.pending;
      const bidder = state.players[auction.activeBidderId];
      if (!bidder?.isAI) return;
      const square = BOARD[auction.squareId];
      const maxBid = Math.min(bidder.cash, Math.floor(square.price * 1.1));
      if (auction.highestBid < maxBid) {
        runAction({ type: "AUCTION_BID", payload: { bid: auction.highestBid + 10 } });
      } else {
        runAction({ type: "AUCTION_PASS" });
      }
      return;
    }
    if (state.phase === "post_roll") runAction({ type: "END_TURN" });
    if (state.phase === "penalty") {
      runAction({ type: "PENALTY_OK" });
      return;
    }
    if (state.phase === "question" && state.pending?.type === "question") {
      const opts = state.pending.question?.options || [];
      runAction({ type: "QUESTION_ANSWER", payload: { choiceIndex: Math.floor(Math.random() * opts.length) } });
    }
  }, [state, activePlayer, mode]);

  const selectedSquare = BOARD[selectedSquareId];
  const selectedInfo = state.properties?.[selectedSquareId];
  const selectedOwner = selectedInfo?.ownerId != null ? state.players?.[selectedInfo.ownerId]?.name : "Chưa có chủ";

  const squareInfo = selectedSquare ? {
    id: selectedSquareId,
    name: selectedSquare.name,
    type: selectedSquare.type,
    typeLabel: typeLabels[selectedSquare.type] || selectedSquare.type,
    price: selectedSquare.price,
    mortgage: selectedSquare.mortgage,
    tax: selectedSquare.amount,
    rent: selectedSquare.rent,
    houseCost: selectedSquare.houseCost,
    owner: selectedInfo ? selectedOwner : null,
    houses: selectedInfo ? selectedInfo.houses : 0,
    mortgaged: selectedInfo ? selectedInfo.mortgaged : false
  } : null;

  if (mode === null) {
    return (
      <div className="app-shell welcome-screen">
        <div className="welcome-card card" style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.92) 100%)',
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 25px 80px rgba(0,0,0,0.25), 0 10px 30px rgba(99,102,241,0.15)',
          maxWidth: 500,
          padding: '50px 40px'
        }}>
          {/* Decorative top border */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '60%',
            height: 4,
            background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)',
            borderRadius: '0 0 4px 4px'
          }} />

          {/* Logo/Icon */}
          <div style={{
            fontSize: '4rem',
            marginBottom: '16px',
            filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))'
          }}>🎲</div>

          <h1 style={{
            fontSize: "2.8rem",
            marginBottom: "0.5rem",
            background: 'linear-gradient(135deg, #1e293b 0%, #6366f1 50%, #a855f7 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 800,
            letterSpacing: '-1px'
          }}>Cờ Tỷ Phú</h1>

          <p style={{
            marginBottom: "2.5rem",
            color: '#64748b',
            fontSize: '1rem'
          }}>Trò chơi kiến thức hấp dẫn</p>

          <button
            className="primary big-btn"
            onClick={() => setMode("online")}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
              border: 'none',
              padding: '24px 48px',
              borderRadius: 16,
              boxShadow: '0 10px 40px rgba(99,102,241,0.4)',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              width: '100%',
              maxWidth: 320
            }}
          >
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>🌍</div>
            <div style={{ color: '#fff' }}>
              <strong style={{ fontSize: '1.2rem', display: 'block', marginBottom: 4 }}>Bắt Đầu Chơi</strong>
              <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>Tạo phòng và mời bạn bè</div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (mode === "online" && (!roomInfo || !roomInfo.roomCode)) {
    return (
      <div className="app-shell welcome-screen">
        <div className="welcome-card card" style={{ maxWidth: 420 }}>
          <h2 className="title" style={{ fontSize: "2rem" }}>Chơi Online</h2>
          <button className="ghost" onClick={() => setMode(null)} style={{ marginBottom: 20 }}>
            ← Quay lại
          </button>

          {/* Connection Status Indicator Removed */}

          <div style={{ width: "100%", textAlign: "left", marginBottom: 8, color: "#334155", fontWeight: 500 }}>Tên hiển thị:</div>
          <input
            className="input"
            placeholder="Nhập tên của bạn..."
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            style={{ marginBottom: 24 }}
          />

          <div style={{ borderTop: "1px solid rgba(99, 102, 241, 0.15)", margin: "0 0 24px 0", paddingTop: 24 }}>
            <h3 style={{ margin: "0 0 16px 0", color: "var(--accent)" }}>Tạo phòng mới</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  id="presentationMode"
                  checked={presentationMode}
                  onChange={(e) => setPresentationMode(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#6366f1" }}
                />
                <label htmlFor="presentationMode" style={{ cursor: "pointer", fontSize: "0.95rem", color: "#334155" }}>
                  Chế độ Thuyết trình <span style={{ fontSize: "0.8em", opacity: 0.6 }}>(Host điều khiển tất cả)</span>
                </label>
              </div>

              {presentationMode && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 28, animation: "fadeIn 0.3s ease" }}>
                  <label style={{ fontSize: "0.9rem", color: "#334155" }}>Số lượng nhóm:</label>
                  <input
                    type="number"
                    min="2"
                    max="8"
                    value={teamCount}
                    onChange={(e) => setTeamCount(Math.max(2, Math.min(8, Number(e.target.value))))}
                    style={{
                      width: 100,
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "#fff",
                      color: "#1e293b",
                      border: "1px solid rgba(99, 102, 241, 0.3)",
                      fontSize: "1rem",
                      fontWeight: "bold",
                      textAlign: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                    }}
                  />
                </div>
              )}
            </div>

            <button className="primary" style={{ width: "100%" }} onClick={createRoom}>
              Tạo Phòng
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "0 0 24px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }}></div>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.9rem" }}>HOẶC</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }}></div>
          </div>

          <div>
            <h3 style={{ margin: "0 0 16px 0" }}>Vào phòng có sẵn</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                placeholder="Mã phòng (VD: ABCDE)"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                style={{ flex: 1, textTransform: "uppercase" }}
              />
              <button className="primary" onClick={joinRoom} disabled={!roomCode}>
                Vào
              </button>
            </div>
          </div>

          {roomError && (
            <div style={{ marginTop: 20, color: "#ff5252", background: "rgba(255,82,82,0.1)", padding: 12, borderRadius: 8, fontSize: "0.9rem" }}>
              {roomError}
            </div>
          )}
        </div>
      </div>
    );
  }


  return (
    <>
      <div className="app-shell">
        <header className="top-bar">
          <div>
            <div className="title">Cờ Tỷ Phú</div>
            <div className="subtitle">
              {mode === "online"
                ? (roomInfo?.presentationMode ? "Chế độ Thuyết trình" : "Chế độ Trực tuyến")
                : "Chế độ Tại máy (Offline)"}
            </div>

            {mode === "online" && roomInfo?.roomCode && (
              <div className="player-meta">Mã phòng: <strong style={{ color: "var(--accent)" }}>{roomInfo.roomCode}</strong></div>
            )}
          </div>
          <div className="header-actions">
            <button className="ghost" onClick={() => {
              setMode(null);
              setRoomInfo(null);
              setOnlineState(null);
              if (socketRef.current) socketRef.current.disconnect();
              socketRef.current = null;
            }}>Về Menu</button>
          </div>
        </header>

        <main className="main-grid">
          {/* Left Column: Social & Chat */}
          <section className="left-panel">
            <div className="panel card">
              <h2>Thông tin</h2>
              {mode === "online" && roomInfo?.roomCode ? (
                <div className="player-meta">
                  Mã phòng: <strong style={{ color: "var(--accent)", fontSize: "1.2em" }}>{roomInfo.roomCode}</strong>
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
                    Gửi mã này cho bạn bè.
                  </div>
                </div>
              ) : (
                <div className="player-meta">
                  {mode === "local" ? "Đang chơi Offline." : "Chưa vào phòng."}
                </div>
              )}
            </div>

            <div className="panel card log-panel" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <h2>Nhật ký</h2>
              <ul style={{ flex: 1, overflowY: "auto" }}>
                {state.log?.length ? (
                  state.log.map((entry, idx) => (
                    <li key={idx} style={{ padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {entry}
                    </li>
                  ))
                ) : (
                  <div className="player-meta">Chưa có sự kiện.</div>
                )}
              </ul>
            </div>

            {selectedSquare ? (
              <div className="panel card">
                <h2 style={{ borderBottom: `2px solid ${selectedSquare.color || "rgba(0,0,0,0.1)"}` }}>
                  {selectedSquare.name}
                </h2>
                <div className="square-info-content">
                  <div className="info-row">
                    <span>Loại:</span>
                    <strong>{typeLabels[selectedSquare.type] || selectedSquare.type}</strong>
                  </div>

                  {["property", "railroad", "utility"].includes(selectedSquare.type) && (
                    <>
                      {selectedSquare.price && (
                        <div className="info-row">
                          <span>Giá mua:</span>
                          <strong>{formatMoney(selectedSquare.price)}</strong>
                        </div>
                      )}

                      {selectedSquare.type === "property" && Array.isArray(selectedSquare.rent) && (
                        <div className="rent-schedule" style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Bảng giá thuê:</div>
                          {selectedSquare.rent.map((r, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: idx === (squareInfo?.houses || 0) && squareInfo?.owner ? '#4f4' : 'inherit', fontWeight: idx === (squareInfo?.houses || 0) && squareInfo?.owner ? 'bold' : 'normal' }}>
                              <span>{idx === 0 ? "Đất trống" : idx === 5 ? "Khách sạn" : `${idx} Nhà`}</span>
                              <span>{formatMoney(r)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {selectedSquare.type !== "property" && squareInfo?.rent !== undefined && (
                        <div className="info-row">
                          <span>{selectedSquare.type === "utility" ? "Hệ số:" : "Tiền thuê:"}</span>
                          <strong>{selectedSquare.type === "utility" ? `${squareInfo.rent}x` : formatMoney(squareInfo.rent)}</strong>
                        </div>
                      )}

                      {selectedSquare.houseCost && (
                        <div className="info-row" style={{ marginTop: 8 }}>
                          <span>Giá nhà:</span>
                          <strong>{formatMoney(selectedSquare.houseCost)}</strong>
                        </div>
                      )}
                      <div className="info-row">
                        <span>Chủ sở hữu:</span>
                        <strong>{squareInfo?.owner || "Chưa có chủ"}</strong>
                      </div>
                      {squareInfo?.houses > 0 && selectedSquare.type !== "property" && (
                        <div className="info-row">
                          <span>Đã xây:</span>
                          <strong>{squareInfo.houses === 5 ? "Khách sạn" : `${squareInfo.houses} Nhà`}</strong>
                        </div>
                      )}
                    </>
                  )}

                  {selectedSquare.type === "tax" && (
                    <div className="info-row">
                      <span>Số tiền nộp:</span>
                      <strong>{formatMoney(selectedSquare.amount || selectedSquare.price)}</strong>
                    </div>
                  )}

                  {["chance", "chest", "challenge"].includes(selectedSquare.type) && (
                    <div className="info-row" style={{ display: "block", paddingTop: 8 }}>
                      <span style={{ display: "block", marginBottom: 4 }}>Mô tả:</span>
                      <strong style={{ fontWeight: "normal", color: "#ddd" }}>
                        {selectedSquare.type === "chance" && "Rút một thẻ Cơ Hội ngẫu nhiên."}
                        {selectedSquare.type === "chest" && "Rút một thẻ Khí Vận ngẫu nhiên."}
                        {selectedSquare.type === "challenge" && "Tham gia thử thách minigame để nhận thưởng hoặc chịu phạt."}
                      </strong>
                    </div>
                  )}

                  {selectedSquare.type === "go" && (
                    <div className="info-row">
                      <span>Thưởng:</span>
                      <strong>Nhận $200 khi đi qua.</strong>
                    </div>
                  )}
                  {selectedSquare.type === "jail" && (
                    <div className="info-row" style={{ display: "block" }}>
                      <span style={{ display: "block", marginBottom: 4 }}>Quy tắc:</span>
                      <strong style={{ fontWeight: "normal", color: "#ddd" }}>Thăm tù (nếu đi vào) hoặc Ở tù (nếu bị bắt). Cần đổ đôi hoặc trả tiền để ra.</strong>
                    </div>
                  )}
                  {selectedSquare.type === "free_parking" && (
                    <div className="info-row">
                      <span>Tác dụng:</span>
                      <strong>Bãi đậu xe miễn phí. Không có gì xảy ra.</strong>
                    </div>
                  )}
                  {selectedSquare.type === "go_to_jail" && (
                    <div className="info-row">
                      <span>Hành động:</span>
                      <strong>Đi tù ngay lập tức!</strong>
                    </div>
                  )}

                  {/* Option to Sell Owned Property (Especially for Debt) */}
                  {squareInfo?.ownerId === state?.activePlayerIndex && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                      <button
                        className="primary"
                        style={{ width: "100%", background: "rgba(255, 61, 0, 0.2)", border: "1px solid #ff3d00", color: "#ff3d00" }}
                        onClick={() => dispatchAction({ type: "SELL_PROPERTY", payload: { squareId: selectedSquare.id } })}
                      >
                        Bán Tài Sản (${formatMoney(selectedSquare.price)})
                      </button>
                      {activePlayer?.cash < 0 && (
                        <div style={{ fontSize: 11, color: '#ff3d00', marginTop: 4, textAlign: 'center' }}>
                          Cần bán để trả nợ!
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="panel card">
                <h2>Chi tiết ô</h2>
                <div className="player-meta">Chọn một ô trên bàn cờ để xem chi tiết.</div>
              </div>
            )}
          </section>

          {/* Center Column: Board */}
          <section className="board-panel">
            <Board
              board={BOARD}
              properties={state.properties || {}}
              players={state.players || []}
              activePlayerId={state.activePlayerIndex}
              colors={playerColors}
              onSquareClick={setSelectedSquareId}
              selectedSquareId={selectedSquareId}
              squareInfo={squareInfo}
            >
              {activePlayer ? (
                <div className="center-controls">
                  <style>{`
                  .center-controls {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    width: 100%;
                    height: 100%;
                    pointer-events: auto;
                    z-index: 100;
                  }
                  .center-msg {
                    font-size: 14px;
                    color: rgba(255,255,255,0.7);
                    text-align: center;
                    margin-bottom: 8px;
                  }
                  .center-btn {
                    padding: 12px 24px;
                    font-size: 16px;
                    min-width: 160px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                  }
                `}</style>

                  <div className="center-msg">
                    Lượt của <strong style={{
                      color: playerColors[state.activePlayerIndex % playerColors.length],
                      textShadow: `0 0 12px ${playerColors[state.activePlayerIndex % playerColors.length]}`
                    }}>
                      {activePlayer.name}
                    </strong>
                  </div>

                  {(() => {
                    const isPresenter = mode === "online" && roomInfo?.presentationMode && youId === roomInfo.hostId;
                    const isSpectator = mode === "online" && roomInfo?.presentationMode && youId !== roomInfo.hostId;
                    const canControl = mode === "local" || !roomInfo?.presentationMode || isPresenter;

                    return (
                      <>
                        {state.roll && displayRoll && (
                          <div className="dice-readout" style={{ justifyContent: "center", marginBottom: 16 }}>
                            <div className={`dice-pair ${isRolling ? "rolling" : ""}`}>
                              <DiceFace value={displayRoll.die1} />
                              <DiceFace value={displayRoll.die2} />
                            </div>
                          </div>
                        )}

                        {!canControl ? (
                          <div className="center-msg" style={{ marginTop: 20, color: "var(--accent)" }}>Đang ở chế độ khán giả</div>
                        ) : (
                          <div className="button-row" style={{ width: "auto" }}>
                            {state.phase === "await_roll" && (
                              <button className="primary center-btn" onClick={() => dispatchAction({ type: "ROLL" })}>Đổ xúc xắc</button>
                            )}
                            {state.phase === "post_roll" && (
                              <button className="primary center-btn" onClick={() => dispatchAction({ type: "END_TURN" })}>Kết thúc lượt</button>
                            )}
                          </div>
                        )}

                        {state.phase === "buy_decision" && state.pending?.squareId !== undefined && (
                          <div className="decision-box" style={{ background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(99, 102, 241, 0.2)", backdropFilter: "blur(12px)", color: "#1e293b", borderRadius: 16, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
                            <div className="decision-title">Mua {BOARD[state.pending.squareId].name}?</div>
                            <div className="decision-actions">
                              <button className="primary" onClick={() => dispatchAction({ type: "BUY" })}>Mua</button>
                              <button className="ghost" onClick={() => dispatchAction({ type: "DECLINE_BUY" })}>Bỏ qua</button>
                            </div>
                          </div>
                        )}

                        {state.phase === "buy_back_decision" && state.pending?.squareId !== undefined && (
                          <div className="decision-box" style={{ background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(99, 102, 241, 0.2)", backdropFilter: "blur(12px)", color: "#1e293b", minWidth: 320, borderRadius: 16, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
                            <div className="decision-title">Mua lại {BOARD[state.pending.squareId].name}?</div>
                            <div className="player-meta" style={{ marginBottom: 8 }}>
                              Giá mua lại: <strong style={{ color: "#4f4" }}>{formatMoney(state.pending.buyBackCost)}</strong><br />
                              (Tiền thuê: {formatMoney(state.pending.rent)})
                            </div>
                            <div className="decision-actions" style={{ flexDirection: "column" }}>
                              <button className="primary" onClick={() => dispatchAction({ type: "BUY_OWNED_PROPERTY" })}>Mua lại</button>
                              <button className="ghost" onClick={() => dispatchAction({ type: "DECLINE_BUY_OWNED_PROPERTY" })}>Chỉ trả thuê ({formatMoney(state.pending.rent)})</button>
                            </div>
                          </div>
                        )}

                        {state.phase === "upgrade_decision" && state.pending?.squareId !== undefined && (
                          <div className="decision-box" style={{ background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(99, 102, 241, 0.2)", backdropFilter: "blur(12px)", color: "#1e293b", borderRadius: 16, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
                            <div className="decision-title">Nâng cấp {BOARD[state.pending.squareId].name}?</div>
                            <div className="player-meta">Giá: <strong>{formatMoney(BOARD[state.pending.squareId].houseCost)}</strong></div>
                            <div className="decision-actions">
                              <button className="primary" onClick={() => dispatchAction({ type: "UPGRADE_CONFIRM" })}>Nâng cấp</button>
                              <button className="ghost" onClick={() => dispatchAction({ type: "UPGRADE_DECLINE" })}>Bỏ qua</button>
                              <button className="ghost" style={{ border: "1px solid #ff5252", color: "#ff5252" }} onClick={() => dispatchAction({ type: "SELL_PROPERTY", payload: { squareId: state.pending.squareId } })}>Bán (${BOARD[state.pending.squareId].price})</button>
                            </div>
                          </div>
                        )}

                        {state.phase === "auction" && state.pending && (
                          <div className="decision-box" style={{ background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(99, 102, 241, 0.2)", backdropFilter: "blur(12px)", color: "#1e293b", minWidth: 280, borderRadius: 16, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
                            <div className="decision-title">Đấu giá: {BOARD[state.pending.squareId].name}</div>
                            <div className="player-meta">Giá cao nhất: <strong style={{ color: "#4f4" }}>{formatMoney(state.pending.highestBid)}</strong></div>
                            <div className="player-meta">Người giữ giá: <strong>{state.pending.highestBidderId !== null ? state.players[state.pending.highestBidderId].name : "Chưa có"}</strong></div>
                            <div className="player-meta" style={{ marginTop: 8, color: "var(--accent)" }}>Đến lượt: <strong>{state.players[state.pending.activeBidderId].name}</strong></div>

                            <div className="decision-actions" style={{ marginTop: 12, flexDirection: "column" }}>
                              <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'center' }}>
                                <input
                                  className="input"
                                  type="number"
                                  placeholder="Giá"
                                  style={{ width: 100, textAlign: "center" }}
                                  value={auctionBid}
                                  onChange={(e) => setAuctionBid(Number(e.target.value))}
                                />
                                <button className="primary" onClick={() => dispatchAction({ type: "AUCTION_BID", payload: { bid: auctionBid } })}>Ra giá</button>
                              </div>
                              <button className="ghost" style={{ width: '100%' }} onClick={() => dispatchAction({ type: "AUCTION_PASS" })}>Bỏ lượt đấu giá</button>
                            </div>
                          </div>
                        )}

                        {state.phase === "jail_choice" && activePlayer && (
                          <div className="decision-box" style={{ background: "rgba(255, 255, 255, 0.95)", color: "#1e293b", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: 16, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
                            <div className="decision-title">Trong tù</div>
                            <div className="decision-actions" style={{ flexDirection: "column" }}>
                              <button className="primary" onClick={() => dispatchAction({ type: "JAIL_ROLL" })}>Đổ đôi</button>
                              <button className="ghost" onClick={() => dispatchAction({ type: "JAIL_PAY" })}>Nộp $50</button>
                            </div>
                          </div>
                        )}

                        {activePlayer && activePlayer.inJail && state.phase === "await_roll" && (
                          <div className="player-meta">Đang ở tù.</div>
                        )}

                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="center-controls">
                  <style>{`
                  .center-controls {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    width: 100%; height: 100%;
                  }
                `}</style>
                  <div className="board-title">Cờ Tỷ Phú</div>
                  <div className="player-meta">
                    {mode === "online" && !roomInfo?.started ? "Đang chờ..." : "Chờ bắt đầu..."}
                  </div>
                </div>
              )}
            </Board>
          </section>

          {/* Right Column: Game Controls & Info */}
          <section className="right-panel">
            {/* Selected Square Info Moved to Left Panel */}

            <div className="panel card" style={{ maxHeight: "40%", display: 'flex', flexDirection: 'column', overflow: "hidden" }}>
              <h2 style={{ margin: "0 0 12px 0", flexShrink: 0, color: "#1e293b" }}>Tài chính</h2>
              <div className="finance-list" style={{ flex: 1, overflowY: "auto", display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
                {state.players && state.players.length > 0 ? (
                  state.players
                    .slice()
                    .sort((a, b) => b.cash - a.cash)
                    .map((p) => {
                      const pColor = playerColors[p.id % playerColors.length];
                      const isActive = p.id === activePlayer?.id;

                      return (
                        <div key={p.id} className="player-finance-card" style={{
                          background: isActive
                            ? `linear-gradient(145deg, rgba(255,255,255,0.95) 0%, ${pColor}20 100%)`
                            : 'rgba(255, 255, 255, 0.85)',
                          backdropFilter: 'blur(8px)',
                          borderRadius: 12,
                          padding: 16,
                          border: isActive
                            ? `3px solid ${pColor}`
                            : '1px solid rgba(255, 255, 255, 0.5)',
                          boxShadow: isActive
                            ? `0 8px 24px ${pColor}40`
                            : '0 4px 16px rgba(0,0,0,0.08)',
                          transition: 'all 0.3s ease',
                          transform: isActive ? 'scale(1.02)' : 'scale(1)'
                        }}>
                          {/* Header Info */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div className="player-avatar" style={{
                                width: 36, height: 36, borderRadius: 10,
                                backgroundColor: playerColors[p.id % playerColors.length],
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1.4rem', boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                border: '2px solid #fff', color: '#fff'
                              }}>
                                {p.name.startsWith("Nhóm ") ? <span style={{ fontWeight: 800 }}>{p.name.split(" ")[1]}</span> : playerIcons[p.id % playerIcons.length]}
                              </div>
                              <div>
                                <div style={{ fontWeight: '700', fontSize: '0.95rem', color: '#1e293b', letterSpacing: '0.02em' }}>{p.name}</div>
                                {p.id === activePlayer?.id && (
                                  <div style={{ fontSize: '0.65rem', color: '#6366f1', textTransform: 'uppercase', fontWeight: 600, marginTop: 2 }}>
                                    ● Đang chơi
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.65rem', color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Tài sản</div>
                              <div style={{ color: p.cash < 0 ? '#ef4444' : '#10b981', fontSize: '1.2rem', fontWeight: '800', fontFamily: 'monospace' }}>
                                {formatMoney(p.cash)}
                              </div>
                            </div>
                          </div>

                          {/* Property Groups */}
                          {(() => {
                            const groups = groupProperties(state.properties, p);
                            const hasProperties = Object.keys(groups).length > 0;
                            if (!hasProperties) {
                              return <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.3)', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>Chưa sở hữu bất động sản</div>;
                            }
                            return (
                              <div className="property-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {Object.entries(groups).map(([key, list]) => {
                                  const color = colorMap[key] || (key === 'railroads' ? '#78909c' : key === 'utilities' ? '#bcaaa4' : '#fff');
                                  return (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.04)', borderRadius: 6, padding: '6px 8px' }}>
                                      <div style={{ width: 4, height: 28, backgroundColor: color, borderRadius: 4, marginRight: 10, flexShrink: 0, boxShadow: `0 0 6px ${color}` }}></div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: '1.3' }}>
                                          {list.map(s => s.name).join(', ')}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })
                ) : (
                  <div className="player-meta">Chưa có dữ liệu.</div>
                )}
              </div>
            </div>




          </section>
        </main>
      </div >

      {console.log("RENDER CHECK:", state.phase, state.pending)}
      {
        state.phase === "penalty" && state.pending?.type === "penalty" && (
          <div className="modal-backdrop" style={{ zIndex: 9999 }}>
            <div className="modal-card" style={{ maxWidth: '700px', textAlign: 'center', border: '4px solid #ff4444' }}>
              <div style={{ fontSize: '5rem', marginBottom: '10px' }}>😈</div>
              <h2 style={{ fontSize: '3rem', color: '#ff4444', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '2px' }}>HÌNH PHẠT!</h2>

              <div style={{
                background: 'rgba(255, 68, 68, 0.1)',
                border: '2px dashed rgba(255, 68, 68, 0.5)',
                borderRadius: '20px',
                padding: '40px',
                marginBottom: '32px',
                fontSize: '2.5rem',
                fontWeight: '900',
                color: '#1e293b',
                lineHeight: 1.3
              }}>
                {state.pending.text || "Hình phạt bí ẩn..."}
              </div>

              <button
                className="primary"
                style={{
                  width: '200px',
                  padding: '20px',
                  fontSize: '1.5rem',
                  backgroundColor: '#ff4444',
                  boxShadow: '0 4px 12px rgba(255, 68, 68, 0.4)',
                  borderRadius: '50px'
                }}
                onClick={() => dispatchAction({ type: "PENALTY_OK" })}
              >
                OK
              </button>
            </div>
          </div>
        )
      }
      {
        state.phase === "question" && state.pending?.type === "question" && (
          <div className="modal-backdrop">
            <div className="modal-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0 }}>Câu hỏi</h2>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.8rem',
                  fontWeight: '800',
                  background: questionTimer <= 5 ? 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)' :
                    questionTimer <= 10 ? 'linear-gradient(135deg, #ffaa00 0%, #ff6600 100%)' :
                      'linear-gradient(135deg, #44ff44 0%, #00cc00 100%)',
                  color: '#fff',
                  boxShadow: questionTimer <= 5 ? '0 0 20px rgba(255, 68, 68, 0.6)' : '0 4px 12px rgba(0,0,0,0.3)',
                  animation: questionTimer <= 5 ? 'pulse 0.5s infinite' : 'none'
                }}>
                  {questionTimer}
                </div>
              </div>
              <div className="player-meta">Độ khó: {state.pending.question?.difficulty === "hard" ? "Khó" : state.pending.question?.difficulty === "medium" ? "Trung bình" : "Dễ"}</div>
              {state.pending.context === "purchase" && (
                <div className="player-meta">
                  Trả lời đúng được giảm giá <strong style={{ color: "#4f4" }}>20%</strong> khi mua.
                </div>
              )}
              {state.pending.context === "tax" && (
                <div className="player-meta">
                  Trả lời đúng được miễn <strong style={{ color: "#4f4" }}>{formatMoney(state.pending.amount)}</strong> tiền phạt.
                </div>
              )}
              {state.pending.context === "challenge" && (
                <div className="player-meta">
                  Đúng nhận ${CHALLENGE_REWARD[state.pending.question?.difficulty]?.win || 50}, sai mất ${CHALLENGE_REWARD[state.pending.question?.difficulty]?.lose || 20}.
                </div>
              )}
              <div className="question-text">{state.pending.question?.text}</div>
              <div className="question-options">
                {state.pending.question?.options?.map((option, index) => (
                  <button key={index} className="ghost" onClick={() => dispatchAction({ type: "QUESTION_ANSWER", payload: { choiceIndex: index } })}>
                    {option}
                  </button>
                ))}
              </div>
              {questionTimer <= 5 && (
                <div style={{ textAlign: 'center', marginTop: '12px', color: '#ff4444', fontWeight: '600', animation: 'pulse 0.5s infinite' }}>
                  ⚠️ Sắp hết giờ!
                </div>
              )}
            </div>
          </div>
        )
      }

      {
        state.phase === "game_over" && (() => {
          // Calculate total assets for each player
          const playerAssets = state.players.map((player) => {
            let totalAssets = player.cash;

            // Add property values
            if (player.properties) {
              player.properties.forEach((propId) => {
                const square = BOARD[propId];
                const propInfo = state.properties[propId];
                if (square) {
                  // Add property purchase price
                  totalAssets += square.price || 0;
                  // Add house/hotel values (50% of cost for selling)
                  if (propInfo?.houses && square.houseCost) {
                    totalAssets += propInfo.houses * Math.floor(square.houseCost / 2);
                  }
                }
              });
            }

            return {
              ...player,
              totalAssets
            };
          });

          // Sort by total assets (descending)
          const sortedPlayers = [...playerAssets]
            .filter(p => !p.bankrupt)
            .sort((a, b) => b.totalAssets - a.totalAssets);

          const winner = sortedPlayers[0];
          const isQuestionsExhausted = state.gameOverReason === "questions_exhausted";
          const usedQuestions = state.usedQuestionIds?.length || 0;
          const totalQuestions = QUESTIONS.length;

          return (
            <div className="modal-backdrop">
              <div className="modal-card" style={{ textAlign: 'center', maxWidth: '700px' }}>
                <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🏆</div>
                <h2 style={{ fontSize: '2.5rem', marginBottom: '8px', color: '#ffd700' }}>Trò chơi kết thúc!</h2>

                {isQuestionsExhausted && (
                  <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '24px' }}>
                    Đã sử dụng hết {usedQuestions}/{totalQuestions} câu hỏi!
                  </p>
                )}

                <div style={{
                  background: 'linear-gradient(135deg, rgba(255,215,0,0.2) 0%, rgba(255,215,0,0.05) 100%)',
                  borderRadius: '16px',
                  padding: '24px',
                  marginBottom: '24px',
                  border: '2px solid rgba(255,215,0,0.3)'
                }}>
                  <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>🎉 NGƯỜI CHIẾN THẮNG 🎉</div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                    marginBottom: '12px'
                  }}>
                    <div style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      backgroundColor: playerColors[winner?.id % playerColors.length],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '2rem',
                      boxShadow: '0 0 20px rgba(255,215,0,0.5)'
                    }}>
                      {playerIcons[winner?.id % playerIcons.length]}
                    </div>
                    <div>
                      <div style={{ fontSize: '2rem', fontWeight: '800', color: '#fff' }}>{winner?.name}</div>
                      <div style={{ fontSize: '1.5rem', color: '#69f0ae', fontWeight: '700' }}>
                        {formatMoney(winner?.totalAssets)}
                      </div>
                    </div>
                  </div>
                </div>

                <h3 style={{ marginBottom: '16px', color: 'rgba(255,255,255,0.8)' }}>Bảng xếp hạng</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                  {sortedPlayers.map((player, index) => (
                    <div
                      key={player.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '12px 16px',
                        background: index === 0 ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
                        borderRadius: '12px',
                        border: index === 0 ? '1px solid rgba(255,215,0,0.3)' : '1px solid rgba(255,255,255,0.1)'
                      }}
                    >
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '800',
                        fontSize: '1rem',
                        background: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : 'rgba(255,255,255,0.1)',
                        color: index < 3 ? '#000' : '#fff'
                      }}>
                        {index + 1}
                      </div>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: playerColors[player.id % playerColors.length],
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem'
                      }}>
                        {playerIcons[player.id % playerIcons.length]}
                      </div>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontWeight: '600' }}>{player.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                          Tiền: {formatMoney(player.cash)} | BĐS: {player.properties?.length || 0}
                        </div>
                      </div>
                      <div style={{
                        fontSize: '1.1rem',
                        fontWeight: '700',
                        color: player.totalAssets >= 0 ? '#69f0ae' : '#ff5252'
                      }}>
                        {formatMoney(player.totalAssets)}
                      </div>
                    </div>
                  ))}
                </div>

                <button className="primary" style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }} onClick={resetGame}>
                  Chơi lại
                </button>
              </div>
            </div>
          );
        })()
      }

      {
        mode === "local" && state.phase === "setup" && (
          <div className="modal-backdrop">
            <div className="modal-card">
              <h2>Thiết lập người chơi</h2>
              <p>Nhập 2 đến 6 người chơi để bắt đầu.</p>
              <div className="setup-grid">
                {playerNames.map((name, idx) => (
                  <div key={idx} className="setup-row">
                    <input
                      className="input"
                      placeholder={`Người chơi ${idx + 1}`}
                      value={name}
                      onChange={(event) => {
                        const next = [...playerNames];
                        next[idx] = event.target.value;
                        setPlayerNames(next);
                      }}
                    />
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={playerAIs[idx]}
                        onChange={(event) => {
                          const next = [...playerAIs];
                          next[idx] = event.target.checked;
                          setPlayerAIs(next);
                        }}
                      />
                      Máy
                    </label>
                  </div>
                ))}
              </div>
              <label className="select-row">
                Thứ tự lượt:
                <select className="input" value={orderModeLocal} onChange={(event) => setOrderModeLocal(event.target.value)}>
                  <option value="sequential">Lần lượt</option>
                  <option value="random">Bốc thăm</option>
                </select>
              </label>
              <div className="decision-actions">
                <button className="ghost" onClick={() => setMode(null)}>Quay lại</button>
                <button className="primary" onClick={startGame}>Bắt đầu</button>
              </div>
            </div>
          </div>
        )
      }

      {
        mode === "online" && !roomInfo?.started && (
          <div className="modal-backdrop">
            <div className="modal-card">
              <h2>Chơi trực tuyến</h2>
              {!roomInfo ? (
                <>
                  <div className="tabs" style={{ display: "flex", gap: 16, marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <button
                      className={onlineTab === "create" ? "primary" : "ghost"}
                      style={{ flex: 1 }}
                      onClick={() => setOnlineTab("create")}
                    >Tạo phòng</button>
                    <button
                      className={onlineTab === "join" ? "primary" : "ghost"}
                      style={{ flex: 1 }}
                      onClick={() => setOnlineTab("join")}
                    >Tìm phòng</button>
                  </div>

                  {onlineTab === "create" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <p>Nhập tên của bạn để tạo phòng mới.</p>
                      <input
                        className="input"
                        placeholder="Tên hiển thị của bạn"
                        value={nickname}
                        onChange={(event) => setNickname(event.target.value)}
                      />
                      <button className="primary" style={{ width: "100%" }} onClick={createRoom}>Tạo phòng ngay</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <p>Nhập mã phòng từ bạn bè.</p>
                      <input
                        className="input"
                        placeholder="Tên hiển thị của bạn"
                        value={nickname}
                        onChange={(event) => setNickname(event.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Mã phòng (VD: ABC123)"
                        value={roomCode}
                        onChange={(event) => setRoomCode(event.target.value)}
                      />
                      <button className="primary" style={{ width: "100%" }} onClick={joinRoom}>Vào phòng</button>
                    </div>
                  )}
                  {roomError && <div className="player-meta" style={{ color: "#ff4444", marginTop: 8 }}>{roomError}</div>}
                </>
              ) : (
                <>
                  <p>Phòng: <strong style={{ fontSize: "1.5em", color: "var(--accent)" }}>{roomInfo.roomCode}</strong></p>
                  <div className="player-list">
                    {roomInfo.players?.map((player, idx) => (
                      <div key={player.id} className="player-row">
                        <div className="player-chip" style={{ backgroundColor: playerColors[idx % playerColors.length] }} />
                        <div>
                          <div className="player-name">{player.name}</div>
                          <div className="player-meta">{player.id === roomInfo.hostId ? "Chủ phòng" : "Khách"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {youId === roomInfo.hostId && (
                    <label className="select-row">
                      Thứ tự lượt:
                      <select className="input" value={roomInfo.orderMode || "sequential"} onChange={changeOrderModeOnline}>
                        <option value="sequential">Lần lượt</option>
                        <option value="random">Bốc thăm</option>
                      </select>
                    </label>
                  )}
                  <div className="decision-actions">
                    {youId === roomInfo.hostId ? (
                      (() => {
                        const canStart = roomInfo.presentationMode || roomInfo.players.length >= 2;
                        return (
                          <button
                            className="primary"
                            onClick={startOnlineGame}
                            disabled={!canStart}
                            style={{ opacity: !canStart ? 0.5 : 1, cursor: !canStart ? 'not-allowed' : 'pointer' }}
                          >
                            {canStart ? "Bắt đầu ván" : "Chờ người chơi..."}
                          </button>
                        );
                      })()
                    ) : (
                      <div className="player-meta">Đang chờ chủ phòng bắt đầu...</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      }
      {
        showIntro && (
          <div className="modal-backdrop" style={{ zIndex: 9999 }}>
            <div className="modal-card" style={{ maxWidth: 800, textAlign: 'left', background: 'rgba(255,255,255,0.98)' }}>
              <h1 style={{ textAlign: 'center', color: '#6366f1', marginBottom: 20 }}>HƯỚNG DẪN & LUẬT CHƠI</h1>

              <div style={{ marginBottom: 12, color: '#334155', fontSize: '0.9rem' }}>
                💰 Tiền khởi điểm cho mỗi nhóm: <strong>$1250</strong>
              </div>
              <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 10, fontSize: '0.95rem', lineHeight: 1.6, color: '#334155' }}>
                <h3 style={{ color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: 5 }}>1. Cách sử dụng Web</h3>
                <ul style={{ marginBottom: 20, paddingLeft: 20 }}>
                  <li style={{ marginBottom: 8 }}><strong>Bước 1:</strong> Nhập <strong>Tên hiển thị</strong> (Nickname).</li>
                  <li style={{ marginBottom: 8 }}><strong>Bước 2:</strong>
                    <ul style={{ marginTop: 4 }}>
                      <li>Chọn <strong>Tạo phòng:</strong> Nếu bạn là Host. Tick vào <em>"Chế độ Thuyết trình"</em> để tự động tạo các nhóm (Nhóm 1, 3, 4...) nếu muốn chơi team trên lớp.</li>
                      <li>Chọn <strong>Vào phòng:</strong> Nhập Mã phòng từ Host để tham gia.</li>
                    </ul>
                  </li>
                  <li><strong>Lưu ý:</strong> Chế độ Thuyết trình dành cho lớp học/nhóm đông sử dụng chung một màn hình lớn.</li>
                </ul>

                <h3 style={{ color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: 5 }}>2. Luật chơi Đặc biệt</h3>
                <ul style={{ paddingLeft: 20 }}>
                  <li style={{ marginBottom: 6 }}><strong>Mục tiêu:</strong> Trở thành đại gia bất động sản cuối cùng chưa phá sản.</li>
                  <li style={{ marginBottom: 6 }}><strong>Trả lời câu hỏi:</strong> Cơ hội nhận giảm giá <strong>20%</strong> khi mua đất hoặc miễn phạt nếu trả lời đúng câu hỏi kiến thức.</li>
                  <li style={{ marginBottom: 6 }}><strong>Thị trường khốc liệt:</strong> Giá thuê nhà đất rất cao. Hãy cẩn thận khi đi vào đất đối thủ!</li>
                  <li style={{ marginBottom: 6 }}><strong>Gỡ nợ:</strong> Nếu thiếu tiền, bạn có thể bán tài sản lại cho Ngân hàng với <strong>100% giá gốc</strong>.</li>
                  <li style={{ marginBottom: 6 }}><strong>Nhà tù:</strong> Phí bảo lãnh <strong>$100</strong>. Sau 3 lượt không đổ được đôi, bạn bắt buộc phải đóng phạt để ra.</li>
                  <li><strong>Hình phạt:</strong> Các ô Thuế là ô Hình phạt, mất tiền ngay lập tức.</li>
                </ul>
              </div>

              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <button
                  className="primary"
                  style={{ padding: '12px 40px', fontSize: '1.2rem', boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)' }}
                  onClick={() => setShowIntro(false)}
                >
                  ĐÃ HIỂU, VÀO GAME!
                </button>
              </div>
            </div>
          </div>
        )
      }
    </>
  );
}

function DiceFace({ value }) {
  const dots = Array.from({ length: value });
  return (
    <div className={`dice-face dice-${value}`}>
      {dots.map((_, idx) => (
        <span key={idx} className="pip" />
      ))}
    </div>
  );
}
