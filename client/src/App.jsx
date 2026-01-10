import React, { useMemo, useReducer, useRef, useState, useEffect } from "react";
import { io } from "socket.io-client";
import Board from "./components/Board";
import { gameReducer } from "./game/reducer";
import { BOARD, LIQUIDITY } from "./game/board";
import { canBuildHouse, canSellHouse } from "./game/engine";
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
  const [playerAIs, setPlayerAIs] = useState([false, false, false, false, false, false]);
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
  const rollIntervalRef = useRef(null);

  useEffect(() => {
    if (!state.roll) return;

    setIsRolling(true);
    setDisplayRoll({ die1: 1, die2: 1 });

    if (rollIntervalRef.current) {
      clearInterval(rollIntervalRef.current);
    }

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
      rollIntervalRef.current = null;
      clearTimeout(timer);
    };
  }, [state.roll?.die1, state.roll?.die2]);

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
    const socketUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
    const socket = io(socketUrl);
    socketRef.current = socket;

    socket.on("room_joined", (payload) => {
      setRoomInfo(payload);
      setYouId(payload.youId);
      setRoomError("");
    });

    socket.on("room_update", (payload) => {
      setRoomInfo(payload);
    });

    socket.on("room_error", (payload) => {
      setRoomError(payload.message || "Không thể vào phòng.");
    });

    socket.on("connect_error", () => {
      setRoomError("Không kết nối được server. Hãy kiểm tra server đang chạy.");
    });

    socket.on("game_state", (payload) => {
      setOnlineState(payload);
    });

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
    if (state.phase === "setup") {
      setSelectedSquareId(0);
    }
  }, [state.phase]);

  const startGame = () => {
    const names = playerNames.map((name) => name.trim()).filter(Boolean);
    if (names.length < 2) {
      alert("Vui lòng nhập ít nhất hai người chơi.");
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
    setPlayerNames(["", "", "", "", "", ""]);
    setPlayerAIs([false, false, false, false, false, false]);
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
    dispatchAction({ type: "BUY_BACK", payload: { squareId: Number(buyBackId) } });
  };

  const dispatchAction = (action) => {
    if (mode === "online") {
      socketRef.current?.emit("dispatch_action", { action });
      return;
    }
    dispatchLocal(action);
  };

  const createRoom = () => {
    if (!nickname.trim()) {
      alert("Vui lòng nhập tên hiển thị.");
      return;
    }
    socketRef.current?.emit("create_room", { name: nickname.trim() });
  };

  const joinRoom = () => {
    if (!nickname.trim() || !roomCode.trim()) {
      alert("Vui lòng nhập nickname và mã phòng.");
      return;
    }
    socketRef.current?.emit("join_room", { code: roomCode.trim().toUpperCase(), name: nickname.trim() });
  };

  const startOnlineGame = () => {
    socketRef.current?.emit("start_game");
  };

  const leaveRoom = () => {
    socketRef.current?.emit("leave_room");
    setRoomInfo(null);
    setOnlineState(null);
    setYouId(null);
  };

  const changeOrderModeOnline = (event) => {
    const modeValue = event.target.value;
    socketRef.current?.emit("set_order_mode", { mode: modeValue });
  };

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
      if (activePlayer.cash >= 250) {
        runAction({ type: "JAIL_PAY" });
      } else {
        runAction({ type: "JAIL_ROLL" });
      }
      return;
    }

    if (state.phase === "buy_decision" && state.pending?.squareId !== undefined) {
      const square = BOARD[state.pending.squareId];
      const shouldBuy = activePlayer.cash - square.price >= 200;
      runAction({ type: shouldBuy ? "BUY" : "DECLINE_BUY" });
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

    if (state.phase === "post_roll") {
      runAction({ type: "END_TURN" });
    }
    if (state.phase === "question" && state.pending?.type === "question") {
      const options = state.pending.question?.options || [];
      const choiceIndex = Math.floor(Math.random() * options.length);
      runAction({ type: "QUESTION_ANSWER", payload: { choiceIndex } });
    }
  }, [state, activePlayer, mode]);

  const selectedSquare = BOARD[selectedSquareId];
  const selectedInfo = state.properties?.[selectedSquareId];
  const selectedOwner = selectedInfo?.ownerId !== null && selectedInfo?.ownerId !== undefined
    ? state.players?.[selectedInfo.ownerId]?.name
    : "Chưa có chủ";

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
        <div className="welcome-card card">
          <h1 className="title" style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>Cờ Tỷ Phú</h1>
          <p className="subtitle" style={{ marginBottom: "2rem" }}>Chọn chế độ chơi để bắt đầu</p>

          <div className="mode-selection">
            <button className="primary big-btn" onClick={() => setMode("local")}>
              <div style={{ fontSize: "1.5rem" }}>🛡️</div>
              <div>
                <strong>Chơi Tại Máy</strong>
                <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>Chơi offline với bạn bè hoặc máy</div>
              </div>
            </button>

            <button className="primary big-btn" onClick={() => setMode("online")}>
              <div style={{ fontSize: "1.5rem" }}>🌍</div>
              <div>
                <strong>Chơi Online</strong>
                <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>Tạo phòng và mời bạn bè từ xa</div>
              </div>
            </button>
          </div>
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
                ? "Chế độ Trực tuyến"
                : "Chế độ Tại máy (Offline)"}
            </div>
            {/* DEBUG OVERLAY */}
            <div style={{ position: 'fixed', top: 0, left: 0, background: 'red', color: 'white', padding: 5, zIndex: 9999, fontSize: 10 }}>
              Phase: {state?.phase} | PType: {state?.pending?.type} | Ctx: {state?.pending?.context} | Q: {state?.pending?.question ? 'YES' : 'NO'}
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

            <div className="panel card" style={{ maxHeight: "30%" }}>
              <h2>Tài chính</h2>
              <div className="leaderboard" style={{ overflowY: "auto" }}>
                {state.players && state.players.length > 0 ? (
                  state.players
                    .slice()
                    .sort((a, b) => b.cash - a.cash)
                    .map((p) => (
                      <div key={p.id} className="leaderboard-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="player-chip" style={{ width: 12, height: 12, backgroundColor: playerColors[p.id % playerColors.length] }} />
                          <span style={{ fontWeight: p.id === activePlayer?.id ? "bold" : "normal" }}>{p.name}</span>
                        </div>
                        <strong style={{ color: p.cash < 0 ? "#ff4444" : "#44ff44" }}>{formatMoney(p.cash)}</strong>
                      </div>
                    ))
                ) : (
                  <div className="player-meta">Chưa có dữ liệu.</div>
                )}
              </div>
            </div>
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

                  <div className="center-msg">Lượt của <strong style={{ color: "#fff" }}>{activePlayer.name}</strong></div>

                  {state.roll && displayRoll && (
                    <div className="dice-readout" style={{ justifyContent: "center", marginBottom: 16 }}>
                      <div className={`dice-pair ${isRolling ? "rolling" : ""}`}>
                        <DiceFace value={displayRoll.die1} />
                        <DiceFace value={displayRoll.die2} />
                      </div>
                    </div>
                  )}

                  <div className="button-row" style={{ width: "auto" }}>
                    {state.phase === "await_roll" && (
                      <button className="primary center-btn" onClick={() => dispatchAction({ type: "ROLL" })}>Đổ xúc xắc</button>
                    )}
                    {state.phase === "post_roll" && (
                      <button className="primary center-btn" onClick={() => dispatchAction({ type: "END_TURN" })}>Kết thúc lượt</button>
                    )}
                    {canRollAgain && (
                      <button className="primary center-btn" onClick={() => dispatchAction({ type: "ROLL" })}>Đổ lại</button>
                    )}
                  </div>

                  {state.phase === "buy_decision" && state.pending?.squareId !== undefined && (
                    <div className="decision-box" style={{ background: "rgba(30, 27, 41, 0.95)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", color: "#fff" }}>
                      <div className="decision-title">Mua {BOARD[state.pending.squareId].name}?</div>
                      <div className="decision-actions">
                        <button className="primary" onClick={() => dispatchAction({ type: "BUY" })}>Mua</button>
                        <button className="ghost" onClick={() => dispatchAction({ type: "DECLINE_BUY" })}>Bỏ qua</button>
                      </div>
                    </div>
                  )}

                  {state.phase === "jail_choice" && activePlayer && (
                    <div className="decision-box" style={{ background: "rgba(30, 27, 41, 0.95)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }}>
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
            {selectedSquare && (
              <div className="panel card">
                <h2 style={{ borderBottom: `2px solid ${selectedSquare.color || "rgba(255,255,255,0.1)"}` }}>
                  {selectedSquare.name}
                </h2>
                <div className="square-info-content">
                  <div className="info-row">
                    <span>Loại:</span>
                    <strong>{typeLabels[selectedSquare.type] || selectedSquare.type}</strong>
                  </div>

                  {/* Properties, Railroads, Utilities */}
                  {["property", "railroad", "utility"].includes(selectedSquare.type) && (
                    <>
                      {selectedSquare.price && (
                        <div className="info-row">
                          <span>Giá mua:</span>
                          <strong>{formatMoney(selectedSquare.price)}</strong>
                        </div>
                      )}
                      {squareInfo?.rent !== undefined && (
                        <div className="info-row">
                          <span>{selectedSquare.type === "utility" ? "Hệ số:" : "Tiền thuê:"}</span>
                          <strong>{selectedSquare.type === "utility" ? `${squareInfo.rent}x` : formatMoney(squareInfo.rent)}</strong>
                        </div>
                      )}
                      {selectedSquare.houseCost && (
                        <div className="info-row">
                          <span>Giá nhà:</span>
                          <strong>{formatMoney(selectedSquare.houseCost)}</strong>
                        </div>
                      )}
                      <div className="info-row">
                        <span>Chủ sở hữu:</span>
                        <strong>{squareInfo?.owner || "Chưa có chủ"}</strong>
                      </div>
                      {squareInfo?.houses > 0 && (
                        <div className="info-row">
                          <span>Đã xây:</span>
                          <strong>{squareInfo.houses === 5 ? "Khách sạn" : `${squareInfo.houses} Nhà`}</strong>
                        </div>
                      )}
                    </>
                  )}

                  {/* Tax */}
                  {selectedSquare.type === "tax" && (
                    <div className="info-row">
                      <span>Số tiền nộp:</span>
                      <strong>{formatMoney(selectedSquare.amount || selectedSquare.price)}</strong>
                    </div>
                  )}

                  {/* Chance / Chest / Challenge */}
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

                  {/* Special Squares */}
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
                </div>
              </div>
            )}

            <div className="panel card">
              <h2>Người chơi</h2>
              {activePlayer ? (
                <div className="property-groups" style={{ maxHeight: "200px", overflowY: "auto" }}>
                  {Object.keys(ownedGroups).length === 0 && (
                    <div className="player-meta">Trống.</div>
                  )}
                  {Object.entries(ownedGroups).map(([group, squares]) => (
                    <div key={group} className="group-block" style={{ background: "rgba(255,255,255,0.03)", border: "none" }}>
                      <div className="group-title" style={{ fontSize: 11, color: "var(--muted)" }}>{groupLabels[group] || group}</div>
                      {squares.map((square) => (
                        <div key={square.id} className="property-row" style={{ border: "none", padding: "2px 0" }}>
                          <div className="property-name" style={{ fontSize: 12 }}>{square.name}</div>
                          <button className="tiny" onClick={() => setSelectedSquareId(square.id)}>Xem</button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="player-meta">...</div>
              )}
            </div>

            <div className="panel card">
              <h2>Giao dịch</h2>
              <button className="ghost" style={{ width: "100%" }} onClick={() => alert("Tính năng giao dịch chi tiết đang phát triển!")}>Mở giao dịch</button>
            </div>


          </section>
        </main>
      </div>

      {state.phase === "question" && state.pending?.type === "question" && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h2>Câu hỏi</h2>
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
          </div>
        </div>
      )}

      {mode === "local" && state.phase === "setup" && (
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
      )}

      {mode === "online" && !roomInfo?.started && (
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
                    <button
                      className="primary"
                      onClick={startOnlineGame}
                      disabled={roomInfo.players.length < 2}
                      style={{ opacity: roomInfo.players.length < 2 ? 0.5 : 1, cursor: roomInfo.players.length < 2 ? 'not-allowed' : 'pointer' }}
                    >
                      {roomInfo.players.length < 2 ? "Chờ người chơi..." : "Bắt đầu ván"}
                    </button>
                  ) : (
                    <div className="player-meta">Đang chờ chủ phòng bắt đầu...</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
