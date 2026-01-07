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
  const [mode, setMode] = useState("online");
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
      alert("Vui lòng nhập nickname.");
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

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <div className="title">Cờ Tỷ Phú</div>
          <div className="subtitle">
            {mode === "online"
              ? "Chơi trực tuyến, tạo phòng và mời bạn bè."
              : "Luật cổ điển, bàn cờ mới, chơi tại máy."}
          </div>
          {mode === "online" && roomInfo?.roomCode && (
            <div className="player-meta">Mã phòng: {roomInfo.roomCode}</div>
          )}
        </div>
        <div className="header-actions">
          <div className="mode-toggle">
            <button className={mode === "local" ? "primary" : "ghost"} onClick={() => setMode("local")}>Tại máy</button>
            <button className={mode === "online" ? "primary" : "ghost"} onClick={() => setMode("online")}>Trực tuyến</button>
          </div>
          {mode === "local" && <button className="ghost" onClick={resetGame}>Ván mới</button>}
          {mode === "online" && roomInfo && <button className="ghost" onClick={leaveRoom}>Rời phòng</button>}
        </div>
      </header>

      <main className="main-grid">
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
          />
        </section>

        <section className="side-panel">
          <div className="panel card">
            <h2>Điều khiển lượt</h2>
            {activePlayer ? (
              <div className="player-row">
                <div className="player-chip" style={{ backgroundColor: playerColors[activePlayer.id % playerColors.length] }} />
                <div>
                  <div className="player-name">{activePlayer.name}</div>
                  <div className="player-meta">Tiền: {formatMoney(activePlayer.cash)}</div>
                  {activePlayer.inJail && (
                    <div className="player-meta">Trong tù (lượt {activePlayer.jailTurns + 1} / 3)</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="player-meta">Bắt đầu ván mới để chơi.</div>
            )}

            <div className="button-row">
              {state.phase === "await_roll" && (
                <button className="primary" onClick={() => dispatchAction({ type: "ROLL" })}>Đổ xúc xắc</button>
              )}

              {state.phase === "post_roll" && (
                <button className="primary" onClick={() => dispatchAction({ type: "END_TURN" })}>Kết thúc lượt</button>
              )}

              {canRollAgain && (
                <button className="primary" onClick={() => dispatchAction({ type: "ROLL" })}>Đổ lại</button>
              )}
            </div>

            {state.roll && displayRoll && (
              <div className="dice-readout">
                <div className={`dice-pair ${isRolling ? "rolling" : ""}`}>
                  <DiceFace value={displayRoll.die1} />
                  <DiceFace value={displayRoll.die2} />
                </div>
                {isRolling ? (
                  <div className="player-meta">Đang lắc...</div>
                ) : (
                  <>
                    <div>Xúc xắc: {state.roll.die1} + {state.roll.die2} = {state.roll.total}</div>
                    {state.roll.isDouble && <div className="badge">Đôi!</div>}
                  </>
                )}
              </div>
            )}

            {state.phase === "buy_decision" && state.pending?.squareId !== undefined && (
              <div className="decision-box">
                <div className="decision-title">Mua {BOARD[state.pending.squareId].name}?</div>
                {state.pending.discountPercent > 0 && (
                  <div className="decision-meta">Giảm giá: {state.pending.discountPercent}%</div>
                )}
                <div className="decision-actions">
                  <button className="primary" onClick={() => dispatchAction({ type: "BUY" })}>Mua</button>
                  <button className="ghost" onClick={() => dispatchAction({ type: "DECLINE_BUY" })}>Đấu giá</button>
                </div>
              </div>
            )}

            {state.phase === "auction" && state.pending?.type === "auction" && (
              <div className="decision-box">
                <div className="decision-title">Đấu giá: {BOARD[state.pending.squareId].name}</div>
                <div className="decision-meta">Giá cao nhất: ${state.pending.highestBid}</div>
                <div className="decision-meta">Người ra giá: {state.players[state.pending.activeBidderId]?.name}</div>
                <input
                  type="number"
                  min={state.pending.highestBid + 1}
                  className="input"
                  value={auctionBid}
                  onChange={(event) => setAuctionBid(event.target.value)}
                />
                <div className="decision-actions">
                  <button className="primary" onClick={() => dispatchAction({ type: "AUCTION_BID", payload: { bid: Number(auctionBid) } })}>Ra giá</button>
                  <button className="ghost" onClick={() => dispatchAction({ type: "AUCTION_PASS" })}>Bỏ qua</button>
                </div>
              </div>
            )}

            {state.phase === "jail_choice" && activePlayer && (
              <div className="decision-box">
                <div className="decision-title">Trong tù</div>
                <div className="decision-actions">
                  <button className="primary" onClick={() => dispatchAction({ type: "JAIL_ROLL" })}>Đổ để ra đôi</button>
                  <button className="ghost" onClick={() => dispatchAction({ type: "JAIL_PAY" })}>Nộp $50 bảo lãnh</button>
                  <button className="ghost" onClick={() => dispatchAction({ type: "JAIL_USE_CARD" })}>Dùng thẻ ra tù</button>
                </div>
              </div>
            )}

            {needsFunds && (
              <div className="warning-box">
                <div>Bạn đang âm tiền. Thế chấp/bán nhà hoặc tuyên bố phá sản.</div>
                <button className="ghost" onClick={() => dispatchAction({ type: "DECLARE_BANKRUPTCY" })}>Tuyên bố phá sản</button>
              </div>
            )}
          </div>

          <div className="panel card">
            <h2>Người chơi</h2>
            <div className="player-list">
              {state.players?.map((player) => (
                <div key={player.id} className={`player-row ${player.bankrupt ? "bankrupt" : ""}`}>
                  <div className="player-chip" style={{ backgroundColor: playerColors[player.id % playerColors.length] }} />
                  <div>
                    <div className="player-name">{player.name}</div>
                    <div className="player-meta">
                      {formatMoney(player.cash)}
                      {player.isAI && <span className="ai-tag">Máy</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel card">
            <h2>Quản lý tài sản</h2>
            {activePlayer ? (
              <div className="property-groups">
                {Object.keys(ownedGroups).length === 0 && (
                  <div className="player-meta">Chưa có tài sản.</div>
                )}
                {Object.entries(ownedGroups).map(([group, squares]) => (
                  <div key={group} className="group-block">
                    <div className="group-title">{groupLabels[group] || group.toUpperCase()}</div>
                    {squares.map((square) => {
                      const info = state.properties[square.id];
                      const isBuildable = square.type === "property";
                      const canBuild = isBuildable && canBuildHouse(state, activePlayer.id, square.id);
                      const canSell = isBuildable && canSellHouse(state, activePlayer.id, square.id);
                      return (
                        <div key={square.id} className="property-row">
                          <div>
                            <div className="property-name">{square.name}</div>
                            <div className="property-meta">
                              Nhà: {info.houses} {info.mortgaged ? "• Đang thế chấp" : ""}
                            </div>
                          </div>
                          <div className="property-actions">
                            <button className="tiny" disabled={!canBuild} onClick={() => dispatchAction({ type: "BUILD", payload: { squareId: square.id } })}>Xây</button>
                            <button className="tiny" disabled={!canSell} onClick={() => dispatchAction({ type: "SELL", payload: { squareId: square.id } })}>Bán</button>
                            <button
                              className="tiny"
                              disabled={info.houses > 0 || info.mortgaged}
                              onClick={() => dispatchAction({ type: "MORTGAGE", payload: { squareId: square.id } })}
                            >Thế chấp</button>
                            <button
                              className="tiny"
                              disabled={!info.mortgaged}
                              onClick={() => dispatchAction({ type: "UNMORTGAGE", payload: { squareId: square.id } })}
                            >Giải chấp</button>
                            <button
                              className="tiny"
                              disabled={info.houses > 0 || info.mortgaged}
                              onClick={() => dispatchAction({ type: "SELL_PROPERTY", payload: { squareId: square.id } })}
                            >Bán tài sản</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="player-meta">Bắt đầu ván để quản lý tài sản.</div>
            )}
          </div>

          <div className="panel card">
            <h2>Mua lại tài sản</h2>
            {state.players?.[0]?.properties ? (
              <>
                <select className="input" value={buyBackId} onChange={(event) => setBuyBackId(event.target.value)}>
                  <option value="">Chọn tài sản</option>
                  {unownedOptions.map((id) => (
                    <option key={id} value={id}>{BOARD[id].name} (${BOARD[id].price})</option>
                  ))}
                </select>
                <button className="primary" onClick={handleBuyBack}>Mua lại</button>
              </>
            ) : (
              <div className="player-meta">Bắt đầu ván để mua lại tài sản.</div>
            )}
          </div>

          <div className="panel card">
            <h2>Thông tin ô</h2>
            {(() => {
              if (!selectedSquare) {
                return <div className="player-meta">Chọn một ô.</div>;
              }
              return (
                <div className="square-info">
                  <div className="square-info-title">{squareInfo.name}</div>
                  <div className="square-info-meta">Loại: {squareInfo.typeLabel}</div>
                  {squareInfo.price && <div className="square-info-meta">Giá: ${squareInfo.price}</div>}
                  {squareInfo.mortgage && <div className="square-info-meta">Thế chấp: ${squareInfo.mortgage}</div>}
                  {squareInfo.tax && <div className="square-info-meta">Thuế: ${squareInfo.tax}</div>}
                  {squareInfo.rent && (
                    <div className="square-info-meta">Tiền thuê: {squareInfo.rent.join(", ")}</div>
                  )}
                  {squareInfo.houseCost && (
                    <div className="square-info-meta">Giá nhà: ${squareInfo.houseCost}</div>
                  )}
                  {squareInfo.owner && <div className="square-info-meta">Chủ sở hữu: {squareInfo.owner}</div>}
                  {squareInfo.houses > 0 && (
                    <div className="square-info-meta">Nhà: {squareInfo.houses === 5 ? "Khách sạn" : squareInfo.houses}</div>
                  )}
                  {squareInfo.mortgaged && <div className="square-info-meta">Trạng thái: Đang thế chấp</div>}
                </div>
              );
            })()}
          </div>

          <div className="panel card">
            <h2>Giao dịch</h2>
            {state.players?.[0]?.properties ? (
              <>
                <div className="trade-grid">
                  <label>
                    Từ
                    <select className="input" value={trade.fromId} onChange={(event) => setTrade({ ...trade, fromId: event.target.value })}>
                      {state.players?.map((player) => (
                        <option key={player.id} value={player.id}>{player.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Đến
                    <select className="input" value={trade.toId} onChange={(event) => setTrade({ ...trade, toId: event.target.value })}>
                      {state.players?.map((player) => (
                        <option key={player.id} value={player.id}>{player.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tiền
                    <input className="input" type="number" value={trade.cash} onChange={(event) => setTrade({ ...trade, cash: event.target.value })} />
                  </label>
                  <label>
                    Tài sản
                    <select className="input" value={trade.propertyId} onChange={(event) => setTrade({ ...trade, propertyId: event.target.value })}>
                      <option value="">Không</option>
                      {tradeOptions.map((prop) => (
                        <option key={prop.id} value={prop.id}>{prop.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button className="primary" onClick={handleTrade}>Thực hiện giao dịch</button>
              </>
            ) : (
              <div className="player-meta">Bắt đầu ván để giao dịch.</div>
            )}
          </div>

          <div className="panel card log-panel">
            <h2>Nhật ký</h2>
            {state.log?.length ? (
              <ul>
                {state.log.map((entry, idx) => (
                  <li key={idx}>{entry}</li>
                ))}
              </ul>
            ) : (
              <div className="player-meta">Chưa có sự kiện.</div>
            )}
          </div>

          {state.phase === "game_over" && state.players?.length > 0 && state.properties && (
            <div className="panel card">
              <h2>Kết quả cuối game</h2>
              <div className="player-meta">Tính theo chỉ số thanh khoản nhóm.</div>
              <div className="score-list">
                {computeLiquidityScores(state.players, state.properties).map((result, idx) => (
                  <div key={result.id} className="score-row">
                    <span>{idx + 1}. {result.name}</span>
                    <span>{formatMoney(result.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {state.phase === "question" && state.pending?.type === "question" && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h2>Câu hỏi</h2>
            <div className="player-meta">Độ khó: {state.pending.question?.difficulty === "hard" ? "Khó" : state.pending.question?.difficulty === "medium" ? "Trung bình" : "Dễ"}</div>
            {state.pending.context === "purchase" && (
              <div className="player-meta">
                Đúng sẽ giảm {DISCOUNT_BY_DIFFICULTY[state.pending.question?.difficulty] || 0}% khi mua tài sản.
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
                <p>Tạo phòng hoặc nhập mã phòng để tham gia.</p>
                <div className="setup-grid">
                  <input
                    className="input"
                    placeholder="Biệt danh"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Mã phòng"
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value)}
                  />
                </div>
                {roomError && <div className="player-meta">{roomError}</div>}
                <div className="decision-actions">
                  <button className="primary" onClick={createRoom}>Tạo phòng</button>
                  <button className="ghost" onClick={joinRoom}>Tham gia</button>
                </div>
              </>
            ) : (
              <>
                <p>Phòng: <strong>{roomInfo.roomCode}</strong></p>
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
                    <button className="primary" onClick={startOnlineGame}>Bắt đầu ván</button>
                  ) : (
                    <div className="player-meta">Đang chờ host bắt đầu...</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
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
