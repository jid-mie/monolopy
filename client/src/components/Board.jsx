import React from "react";

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

const typeLabels = {
  go: "GO",
  jail: "NHÀ TÙ",
  free_parking: "ĐẬU XE",
  go_to_jail: "VÀO TÙ",
  chance: "CƠ HỘI",
  chest: "RƯƠNG",
  challenge: "THỬ THÁCH",
  railroad: "ĐƯỜNG SẮT",
  utility: "TIỆN ÍCH",
  tax: "THUẾ"
};

function TypeIcon({ type }) {
  switch (type) {
    case "chance":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M6 46l26-28 26 28H6z" fill="currentColor" opacity="0.18" />
          <path d="M32 18v18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <circle cx="32" cy="44" r="3.5" fill="currentColor" />
        </svg>
      );
    case "chest":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect x="8" y="22" width="48" height="30" rx="4" fill="currentColor" opacity="0.18" />
          <rect x="12" y="18" width="40" height="10" rx="3" stroke="currentColor" strokeWidth="3" fill="none" />
          <rect x="30" y="30" width="4" height="10" fill="currentColor" />
        </svg>
      );
    case "railroad":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect x="16" y="12" width="32" height="22" rx="4" stroke="currentColor" strokeWidth="3" fill="none" />
          <circle cx="22" cy="38" r="4" fill="currentColor" />
          <circle cx="42" cy="38" r="4" fill="currentColor" />
          <path d="M14 48h36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "utility":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M30 10l10 16h-8l6 18-14-18h8l-6-16z" fill="currentColor" />
        </svg>
      );
    case "tax":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="28" r="12" stroke="currentColor" strokeWidth="3" fill="none" />
          <path d="M32 18v20M26 24h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <rect x="16" y="44" width="32" height="6" rx="3" fill="currentColor" opacity="0.2" />
        </svg>
      );
    case "challenge":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <polygon points="32,10 38,26 56,26 41,36 46,52 32,42 18,52 23,36 8,26 26,26" fill="currentColor" opacity="0.2" />
          <path d="M26 44l12-24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="26" cy="44" r="3" fill="currentColor" />
          <circle cx="38" cy="20" r="3" fill="currentColor" />
        </svg>
      );
    case "jail":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect x="14" y="14" width="36" height="36" rx="4" stroke="currentColor" strokeWidth="3" fill="none" />
          <path d="M22 18v28M32 18v28M42 18v28" stroke="currentColor" strokeWidth="3" />
        </svg>
      );
    case "go_to_jail":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="18" stroke="currentColor" strokeWidth="3" fill="none" />
          <path d="M32 14v12l8 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "free_parking":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect x="14" y="22" width="36" height="20" rx="4" stroke="currentColor" strokeWidth="3" fill="none" />
          <path d="M20 44h24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle cx="24" cy="36" r="3" fill="currentColor" />
          <circle cx="40" cy="36" r="3" fill="currentColor" />
        </svg>
      );
    case "go":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M16 32h32" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M36 20l12 12-12 12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

function getSquareId(row, col) {
  if (row === 10) return 10 - col;
  if (col === 0) return 20 - row;
  if (row === 0) return 20 + col;
  if (col === 10) return 30 + row;
  return null;
}

function renderTokens(players, squareId, colors) {
  const tokens = players.filter((player) => player.position === squareId && !player.bankrupt);
  return (
    <div className="token-row">
      {tokens.map((player) => (
        <span
          key={player.id}
          className="token"
          style={{ backgroundColor: colors[player.id % colors.length] }}
          title={player.name}
        />
      ))}
    </div>
  );
}

export default function Board({ board, properties, players, activePlayerId, colors, onSquareClick, selectedSquareId, squareInfo }) {
  return (
    <div className="board-shell">
      <div className="board-grid">
        {Array.from({ length: 11 }).map((_, row) =>
          Array.from({ length: 11 }).map((_, col) => {
            const squareId = getSquareId(row, col);
            if (squareId === null) {
              return (
                <div key={`${row}-${col}`} className="board-cell board-center" />
              );
            }
            const square = board[squareId];
            const info = properties[squareId];
            const ownerId = info?.ownerId;
            const isActive = players[activePlayerId]?.position === squareId;
            const isSelected = selectedSquareId === squareId && squareInfo?.id === squareId;
            const color = square.color ? colorMap[square.color] : null;
            const isCorner = [0, 10, 20, 30].includes(squareId);
            const typeLabel = typeLabels[square.type];
            const hasIcon = Boolean(typeLabel);

            return (
              <div
                key={`${row}-${col}`}
                className={`board-cell board-square type-${square.type} ${isCorner ? "corner" : ""} ${isActive ? "active" : ""}`}
                onClick={() => onSquareClick?.(squareId)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onSquareClick?.(squareId);
                  }
                }}
              >
                {color && <div className="color-bar" style={{ backgroundColor: color }} />}
                {typeLabel && <div className="type-badge">{typeLabel}</div>}
                {hasIcon && (
                  <div className="square-icon">
                    <TypeIcon type={square.type} />
                  </div>
                )}
                <div className="square-name">{square.name}</div>
                {square.price && (
                  <div className="square-price">${square.price}</div>
                )}
                {info && info.houses > 0 && (
                  <div className="house-row">
                    {Array.from({ length: info.houses }).map((_, idx) => (
                      <span key={idx} className={info.houses === 5 ? "hotel" : "house"} />
                    ))}
                  </div>
                )}
                {ownerId !== null && ownerId !== undefined && (
                  <div className="owner-chip" style={{ backgroundColor: colors[ownerId % colors.length] }} />
                )}
                {renderTokens(players, squareId, colors)}
                {isSelected && squareInfo && (
                  <div className="square-tooltip">
                    <div className="square-tooltip-title">{squareInfo.name}</div>
                    <div className="square-tooltip-meta">Loại: {squareInfo.typeLabel || squareInfo.type}</div>
                    {squareInfo.price && <div className="square-tooltip-meta">Giá: ${squareInfo.price}</div>}
                    {squareInfo.tax && <div className="square-tooltip-meta">Thuế: ${squareInfo.tax}</div>}
                    {squareInfo.owner && <div className="square-tooltip-meta">Chủ: {squareInfo.owner}</div>}
                    {squareInfo.houses > 0 && (
                      <div className="square-tooltip-meta">Nhà: {squareInfo.houses === 5 ? "Khách sạn" : squareInfo.houses}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div className="board-center-content">
          <div className="board-title">Cờ Tỷ Phú</div>
          <div className="board-subtitle">Luật cổ điển, chơi tại máy.</div>
        </div>
      </div>
    </div>
  );
}
