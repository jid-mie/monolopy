import {
  addLog,
  applyCardEffect,
  canBuildHouse,
  canSellHouse,
  calculateRent,
  createInitialState,
  drawCard,
  getSquare,
  movePlayer,
  playerOwnsGroup,
  rollDice,
  sendToJail,
  JAIL_BAIL
} from "./engine.js";
import { CHANCE_CARDS, CHEST_CARDS } from "./cards.js";
import { QUESTIONS } from "./questions.js";

const MAX_LOG = 40;
const DISCOUNT_BY_DIFFICULTY = { easy: 10, medium: 20, hard: 30 };
const CHALLENGE_REWARD = {
  easy: { win: 50, lose: 20 },
  medium: { win: 100, lose: 40 },
  hard: { win: 150, lose: 60 }
};
const QUESTION_CHANCE = 1.0;

function pickQuestion(targetDifficulty) {
  const candidates = QUESTIONS.filter((q) => q.difficulty === targetDifficulty);
  if (candidates.length === 0) {
    return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function getNextActiveIndex(state) {
  const total = state.players.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const next = (state.activePlayerIndex + offset) % total;
    if (!state.players[next].bankrupt) return next;
  }
  return state.activePlayerIndex;
}

function setPhaseForPlayer(state) {
  const current = state.players[state.activePlayerIndex];
  if (current.inJail) {
    return { ...state, phase: "jail_choice", roll: null, pending: null };
  }
  return { ...state, phase: "await_roll", roll: null, pending: null };
}

function logWithLimit(state, message) {
  return { ...state, log: [message, ...state.log].slice(0, MAX_LOG) };
}

function updatePlayer(state, playerId, updater) {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? updater(player) : player
    )
  };
}

function resolveLanding(state, playerId, diceTotal, rentMultiplier = 1) {
  let nextState = state;
  const square = getSquare(nextState.players[playerId].position);

  if (!square) return nextState;

  // Property / Railroad / Utility
  if (["property", "railroad", "utility"].includes(square.type)) {
    const info = nextState.properties[square.id];

    // Unowned
    if (!info.ownerId && info.ownerId !== 0) {
      // 80% Chance for Question
      if (Math.random() < 0.8) {
        let difficulty = "easy";
        const price = square.price || 150;
        if (price >= 280) difficulty = "hard";
        else if (price >= 140) difficulty = "medium";

        return {
          ...nextState,
          phase: "question",
          pending: {
            type: "question",
            context: "purchase",
            squareId: square.id,
            question: pickQuestion(difficulty)
          }
        };
      }

      // 20% Chance: Direct Buy Decision
      return {
        ...nextState,
        phase: "buy_decision",
        pending: { type: "buy", squareId: square.id, discountPercent: 0 }
      };
    }

    if (info.ownerId === playerId) {
      const canUpgrade = canBuildHouse(nextState, playerId, square.id);
      const player = nextState.players[playerId];

      if (canUpgrade) {
        if (player.cash >= (square.houseCost || 0)) {
          return {
            ...nextState,
            phase: "upgrade_decision",
            pending: { type: "upgrade", squareId: square.id }
          };
        }
        return logWithLimit(nextState, `${player.name} dừng tại ${square.name} (Không đủ tiền nâng cấp).`);
      } else {
        if (info.houses >= 5) {
          return logWithLimit(nextState, `${player.name} dừng tại ${square.name} (Đã nâng cấp tối đa).`);
        }
        if (info.mortgaged) {
          return logWithLimit(nextState, `${player.name} dừng tại ${square.name} (Đất đang cầm cố).`);
        }
        return logWithLimit(nextState, `${player.name} dừng tại ${square.name}.`);
      }
    }

    if (info.mortgaged) {
      return logWithLimit(nextState, `${nextState.players[playerId].name} dừng tại ${square.name}.`);
    }

    const rent = calculateRent(nextState, square.id, diceTotal, rentMultiplier);
    nextState = updatePlayer(nextState, playerId, (player) => ({
      ...player,
      cash: player.cash - rent
    }));
    nextState = updatePlayer(nextState, info.ownerId, (player) => ({
      ...player,
      cash: player.cash + rent
    }));
    nextState = {
      ...nextState,
      lastCreditorId: info.ownerId
    };
    return logWithLimit(nextState, `${nextState.players[playerId].name} trả $${rent} tiền thuê cho ${nextState.players[info.ownerId].name}.`);
  }

  // Tax Square - NO Question, direct payment
  if (square.type === "tax") {
    nextState = updatePlayer(nextState, playerId, (player) => ({
      ...player,
      cash: player.cash - square.amount
    }));
    nextState = { ...nextState, lastCreditorId: null };
    return logWithLimit(nextState, `${nextState.players[playerId].name} trả $${square.amount} tiền thuế.`);
  }

  if (square.type === "chance" || square.type === "chest") {
    const deckName = square.type;
    const { card, newDeck } = drawCard(nextState, deckName);
    nextState = { ...nextState, decks: { ...nextState.decks, [deckName]: newDeck } };
    const applied = applyCardEffect(nextState, playerId, card, diceTotal, deckName);
    nextState = applied.state;

    if (applied.landed) {
      const multiplier = applied.rentMultiplier || 1;
      return resolveLanding(nextState, playerId, diceTotal, multiplier);
    }
    return nextState;
  }

  if (square.type === "challenge") {
    return {
      ...nextState,
      phase: "question",
      pending: {
        type: "question",
        context: "challenge",
        question: pickQuestion("medium") // Default challenge difficulty
      }
    };
  }

  if (square.type === "go_to_jail") {
    return sendToJail(nextState, playerId);
  }

  return logWithLimit(nextState, `${nextState.players[playerId].name} dừng tại ${square.name}.`);
}

function allButOneBankrupt(players) {
  return players.filter((p) => !p.bankrupt).length <= 1;
}

export function gameReducer(state, action) {
  if (action.type === "RESET") {
    return { phase: "setup", players: [], log: [] };
  }

  if (action.type === "START_GAME") {
    return createInitialState(action.payload.names, action.payload.aiFlags);
  }

  if (!state.players?.length) {
    return state;
  }

  const activeId = state.activePlayerIndex;

  if (action.type === "ROLL") {
    if (state.phase !== "await_roll") return state;
    const roll = rollDice();
    let nextState = { ...state, roll };

    const doublesCount = roll.isDouble ? state.doublesCount + 1 : 0;
    nextState = { ...nextState, doublesCount };

    if (roll.isDouble && doublesCount >= 3) {
      nextState = sendToJail(nextState, activeId);
      nextState = logWithLimit(nextState, `${nextState.players[activeId].name} đổ 3 lần đôi và vào tù.`);
      nextState = { ...nextState, activePlayerIndex: getNextActiveIndex(nextState) };
      return setPhaseForPlayer(nextState);
    }

    nextState = movePlayer(nextState, activeId, roll.total);
    nextState = resolveLanding(nextState, activeId, roll.total);

    if (["buy_decision", "question", "auction", "upgrade_decision"].includes(nextState.phase)) {
      return nextState;
    }

    return { ...nextState, phase: "post_roll" };
  }

  if (action.type === "JAIL_PAY") {
    if (state.phase !== "jail_choice") return state;
    const player = state.players[activeId];
    if (!player.inJail || player.cash < JAIL_BAIL) return state;

    let nextState = updatePlayer(state, activeId, (p) => ({
      ...p,
      cash: p.cash - JAIL_BAIL,
      inJail: false,
      jailTurns: 0
    }));
    nextState = logWithLimit(nextState, `${player.name} trả $${JAIL_BAIL} tiền bảo lãnh.`);
    return { ...nextState, phase: "await_roll" };
  }

  if (action.type === "JAIL_USE_CARD") {
    if (state.phase !== "jail_choice") return state;
    const player = state.players[activeId];
    if (!player.inJail) return state;
    const deckName = player.jailCards.chance > 0 ? "chance" : player.jailCards.chest > 0 ? "chest" : null;
    if (!deckName) return state;
    const card = deckName === "chance"
      ? CHANCE_CARDS.find((item) => item.type === "jail_free")
      : CHEST_CARDS.find((item) => item.type === "jail_free");
    if (!card) return state;

    let nextState = updatePlayer(state, activeId, (p) => ({
      ...p,
      inJail: false,
      jailTurns: 0,
      jailCards: {
        ...p.jailCards,
        [deckName]: Math.max(0, p.jailCards[deckName] - 1)
      }
    }));
    nextState = {
      ...nextState,
      decks: {
        ...nextState.decks,
        [deckName]: [...nextState.decks[deckName], card]
      }
    };
    return logWithLimit({ ...nextState, phase: "await_roll" }, `${player.name} dùng thẻ ra tù miễn phí.`);
  }

  if (action.type === "JAIL_ROLL") {
    if (state.phase !== "jail_choice") return state;
    const roll = rollDice();
    let nextState = { ...state, roll };
    const player = nextState.players[activeId];

    if (roll.isDouble) {
      nextState = updatePlayer(nextState, activeId, (p) => ({
        ...p,
        inJail: false,
        jailTurns: 0
      }));
      nextState = logWithLimit(nextState, `${player.name} đổ ra đôi và được ra tù.`);
      nextState = movePlayer(nextState, activeId, roll.total);
      nextState = resolveLanding(nextState, activeId, roll.total);
      if (["buy_decision", "question", "auction", "upgrade_decision"].includes(nextState.phase)) {
        return { ...nextState, doublesCount: 0 };
      }
      return { ...nextState, phase: "post_roll", doublesCount: 0 };
    }

    const turns = player.jailTurns + 1;
    if (turns >= 3) {
      nextState = updatePlayer(nextState, activeId, (p) => ({
        ...p,
        cash: p.cash - JAIL_BAIL,
        inJail: false,
        jailTurns: 0
      }));
      nextState = logWithLimit(nextState, `${player.name} trả $${JAIL_BAIL} sau 3 lượt trong tù.`);
      nextState = movePlayer(nextState, activeId, roll.total);
      nextState = resolveLanding(nextState, activeId, roll.total);
      if (["buy_decision", "question", "auction", "upgrade_decision"].includes(nextState.phase)) {
        return { ...nextState, doublesCount: 0 };
      }
      return { ...nextState, phase: "post_roll", doublesCount: 0 };
    }

    nextState = updatePlayer(nextState, activeId, (p) => ({
      ...p,
      jailTurns: turns
    }));
    nextState = logWithLimit(nextState, `${player.name} không đổ ra đôi và vẫn ở trong tù.`);
    nextState = { ...nextState, activePlayerIndex: getNextActiveIndex(nextState), roll: null };
    return setPhaseForPlayer(nextState);
  }

  if (action.type === "QUESTION_ANSWER") {
    if (state.phase !== "question" || state.pending?.type !== "question") return state;
    const question = state.pending.question;
    const correct = action.payload.choiceIndex === question.answerIndex;
    const difficulty = question.difficulty;

    if (state.pending.context === "purchase") {
      const discount = correct ? 20 : 0;
      const message = correct
        ? `Trả lời đúng. Giảm giá 20% khi mua tài sản.`
        : "Trả lời sai. Không được giảm giá.";
      return logWithLimit({
        ...state,
        phase: "buy_decision",
        pending: { type: "buy", squareId: state.pending.squareId, discountPercent: discount }
      }, message);
    }

    if (state.pending.context === "tax") {
      if (correct) {
        return logWithLimit({ ...state, phase: "post_roll", pending: null }, `Trả lời đúng. Được miễn tiền phạt $${state.pending.amount}.`);
      }
      // Incorrect: Pay the tax
      const amount = state.pending.amount;
      const nextState = updatePlayer(state, activeId, (player) => ({
        ...player,
        cash: player.cash - amount
      }));
      return logWithLimit({ ...nextState, phase: "post_roll", pending: null }, `Trả lời sai. Bị phạt $${amount} tiền thuế.`);
    }

    if (state.pending.context === "challenge") {
      const reward = CHALLENGE_REWARD[difficulty] || CHALLENGE_REWARD.easy;
      const delta = correct ? reward.win : -reward.lose;
      const label = correct ? `Trả lời đúng, nhận $${reward.win}.` : `Trả lời sai, mất $${reward.lose}.`;
      const nextState = updatePlayer(state, activeId, (player) => ({
        ...player,
        cash: player.cash + delta
      }));
      return logWithLimit({ ...nextState, phase: "post_roll", pending: null }, label);
    }

    return { ...state, phase: "post_roll", pending: null };
  }

  if (action.type === "BUY") {
    if (state.phase !== "buy_decision" || state.pending?.type !== "buy") return state;
    const squareId = state.pending.squareId;
    const square = getSquare(squareId);
    const player = state.players[activeId];
    const discount = state.pending.discountPercent || 0;
    const finalPrice = Math.round(square.price * (100 - discount) / 100);
    if (player.cash < finalPrice) return state;

    let nextState = updatePlayer(state, activeId, (p) => ({
      ...p,
      cash: p.cash - finalPrice,
      properties: [...p.properties, squareId]
    }));
    nextState = {
      ...nextState,
      properties: {
        ...nextState.properties,
        [squareId]: { ...nextState.properties[squareId], ownerId: activeId }
      },
      pending: null,
      phase: "post_roll"
    };
    const priceLabel = discount > 0 ? `${finalPrice} (giảm ${discount}%)` : `${finalPrice}`;
    return logWithLimit(nextState, `${player.name} mua ${square.name} với giá $${priceLabel}.`);
  }

  if (action.type === "DECLINE_BUY") {
    if (state.phase !== "buy_decision" || state.pending?.type !== "buy") return state;
    return {
      ...state,
      phase: "auction",
      pending: {
        type: "auction",
        squareId: state.pending.squareId,
        highestBid: 0,
        highestBidderId: null,
        activeBidderId: getNextActiveIndex(state),
        passedIds: []
      }
    };
  }

  if (action.type === "AUCTION_BID") {
    if (state.phase !== "auction" || state.pending?.type !== "auction") return state;
    const bid = action.payload.bid;
    const auction = state.pending;
    const bidderId = auction.activeBidderId;
    const bidder = state.players[bidderId];
    if (bid <= auction.highestBid || bid > bidder.cash) return state;

    const nextActive = getNextActiveIndex({ ...state, activePlayerIndex: bidderId });
    return {
      ...state,
      pending: {
        ...auction,
        highestBid: bid,
        highestBidderId: bidderId,
        activeBidderId: nextActive
      }
    };
  }

  if (action.type === "AUCTION_PASS") {
    if (state.phase !== "auction" || state.pending?.type !== "auction") return state;
    const auction = state.pending;
    const passedIds = [...auction.passedIds, auction.activeBidderId];
    const remaining = state.players.filter((p) => !p.bankrupt && !passedIds.includes(p.id));

    if (remaining.length <= 1) {
      if (auction.highestBidderId === null) {
        return { ...state, phase: "post_roll", pending: null };
      }

      const winnerId = auction.highestBidderId;
      const square = getSquare(auction.squareId);
      let nextState = updatePlayer(state, winnerId, (p) => ({
        ...p,
        cash: p.cash - auction.highestBid,
        properties: [...p.properties, auction.squareId]
      }));
      nextState = {
        ...nextState,
        properties: {
          ...nextState.properties,
          [auction.squareId]: { ...nextState.properties[auction.squareId], ownerId: winnerId }
        },
        phase: "post_roll",
        pending: null
      };
      return logWithLimit(nextState, `${nextState.players[winnerId].name} thắng đấu giá ${square.name} với $${auction.highestBid}.`);
    }

    const nextActive = getNextActiveIndex({ ...state, activePlayerIndex: auction.activeBidderId });
    return { ...state, pending: { ...auction, passedIds, activeBidderId: nextActive } };
  }

  if (action.type === "UPGRADE_CONFIRM") {
    if (state.phase !== "upgrade_decision" || state.pending?.type !== "upgrade") return state;
    const { squareId } = state.pending;
    const square = getSquare(squareId);
    const activeId = state.activePlayerIndex;

    if (!canBuildHouse(state, activeId, squareId) || state.players[activeId].cash < square.houseCost) {
      return { ...state, phase: "post_roll", pending: null };
    }

    let nextState = updatePlayer(state, activeId, (p) => ({ ...p, cash: p.cash - square.houseCost }));
    nextState = {
      ...nextState,
      properties: {
        ...nextState.properties,
        [squareId]: {
          ...nextState.properties[squareId],
          houses: nextState.properties[squareId].houses + 1
        }
      },
      phase: "post_roll",
      pending: null
    };
    return logWithLimit(nextState, `${state.players[activeId].name} nâng cấp ${square.name} (-$${square.houseCost}).`);
  }

  if (action.type === "UPGRADE_DECLINE") {
    if (state.phase !== "upgrade_decision") return state;
    return { ...state, phase: "post_roll", pending: null };
  }

  if (action.type === "END_TURN") {
    if (!["post_roll", "buy_decision", "await_roll"].includes(state.phase)) return state;
    let nextState = { ...state, activePlayerIndex: getNextActiveIndex(state), roll: null, doublesCount: 0 };
    if (allButOneBankrupt(nextState.players)) {
      return { ...nextState, phase: "game_over" };
    }
    return setPhaseForPlayer(nextState);
  }

  if (action.type === "BUILD") {
    const { squareId } = action.payload;
    const square = getSquare(squareId);
    const info = state.properties[squareId];
    const player = state.players[activeId];
    if (!square || square.type !== "property") return state;
    if (!canBuildHouse(state, activeId, squareId)) return state;
    if (player.cash < square.houseCost) return state;

    const nextState = {
      ...state,
      properties: {
        ...state.properties,
        [squareId]: { ...info, houses: info.houses + 1 }
      },
      players: state.players.map((p) =>
        p.id === activeId ? { ...p, cash: p.cash - square.houseCost } : p
      )
    };
    return logWithLimit(nextState, `${player.name} xây nhà trên ${square.name}.`);
  }

  if (action.type === "SELL") {
    const { squareId } = action.payload;
    const square = getSquare(squareId);
    const info = state.properties[squareId];
    if (!square || square.type !== "property") return state;
    if (!canSellHouse(state, activeId, squareId)) return state;

    const refund = Math.floor(square.houseCost / 2);
    const nextState = {
      ...state,
      properties: {
        ...state.properties,
        [squareId]: { ...info, houses: info.houses - 1 }
      },
      players: state.players.map((p) =>
        p.id === activeId ? { ...p, cash: p.cash + refund } : p
      )
    };
    return logWithLimit(nextState, `${state.players[activeId].name} bán một nhà trên ${square.name}.`);
  }

  if (action.type === "MORTGAGE") {
    const { squareId } = action.payload;
    const square = getSquare(squareId);
    const info = state.properties[squareId];
    if (!square || !info || info.ownerId !== activeId || info.mortgaged || info.houses > 0) return state;

    const nextState = {
      ...state,
      properties: {
        ...state.properties,
        [squareId]: { ...info, mortgaged: true }
      },
      players: state.players.map((p) =>
        p.id === activeId ? { ...p, cash: p.cash + square.mortgage } : p
      )
    };
    return logWithLimit(nextState, `${state.players[activeId].name} thế chấp ${square.name}.`);
  }

  if (action.type === "UNMORTGAGE") {
    const { squareId } = action.payload;
    const square = getSquare(squareId);
    const info = state.properties[squareId];
    const cost = Math.ceil(square.mortgage * 1.1);
    if (!square || !info || info.ownerId !== activeId || !info.mortgaged) return state;
    if (state.players[activeId].cash < cost) return state;

    const nextState = {
      ...state,
      properties: {
        ...state.properties,
        [squareId]: { ...info, mortgaged: false }
      },
      players: state.players.map((p) =>
        p.id === activeId ? { ...p, cash: p.cash - cost } : p
      )
    };
    return logWithLimit(nextState, `${state.players[activeId].name} giải chấp ${square.name}.`);
  }

  if (action.type === "SELL_PROPERTY") {
    const { squareId } = action.payload;
    const square = getSquare(squareId);
    const info = state.properties[squareId];
    if (!square || !info || info.ownerId !== activeId) return state;
    if (info.houses > 0 || info.mortgaged) return state;
    const value = Math.round(square.price * 0.5);
    const nextState = {
      ...state,
      properties: {
        ...state.properties,
        [squareId]: { ...info, ownerId: null, mortgaged: false, houses: 0 }
      },
      players: state.players.map((p) =>
        p.id === activeId
          ? { ...p, cash: p.cash + value, properties: p.properties.filter((id) => id !== squareId) }
          : p
      )
    };
    return logWithLimit(nextState, `${state.players[activeId].name} bán ${square.name} và nhận $${value}.`);
  }

  if (action.type === "BUY_BACK") {
    const { squareId } = action.payload;
    const square = getSquare(squareId);
    const info = state.properties[squareId];
    const player = state.players[activeId];
    if (!square || !info || info.ownerId !== null && info.ownerId !== undefined) return state;
    if (!["property", "railroad", "utility"].includes(square.type)) return state;
    if (player.cash < square.price) return state;
    const nextState = {
      ...state,
      properties: {
        ...state.properties,
        [squareId]: { ...info, ownerId: activeId }
      },
      players: state.players.map((p) =>
        p.id === activeId
          ? { ...p, cash: p.cash - square.price, properties: [...p.properties, squareId] }
          : p
      )
    };
    return logWithLimit(nextState, `${player.name} mua lại ${square.name} với giá $${square.price}.`);
  }

  if (action.type === "DECLARE_BANKRUPTCY") {
    const creditorId = state.lastCreditorId;
    const player = state.players[activeId];

    let nextState = {
      ...state,
      players: state.players.map((p) =>
        p.id === activeId ? { ...p, bankrupt: true, properties: [], cash: 0 } : p
      ),
      properties: { ...state.properties }
    };

    player.properties.forEach((squareId) => {
      if (creditorId !== null && creditorId !== undefined) {
        nextState.properties[squareId] = { ...nextState.properties[squareId], ownerId: creditorId, mortgaged: false, houses: 0 };
        nextState = updatePlayer(nextState, creditorId, (p) => ({
          ...p,
          properties: [...p.properties, squareId]
        }));
      } else {
        nextState.properties[squareId] = { ...nextState.properties[squareId], ownerId: null, mortgaged: false, houses: 0 };
      }
    });

    nextState = logWithLimit(nextState, `${player.name} tuyên bố phá sản.`);
    nextState = { ...nextState, activePlayerIndex: getNextActiveIndex(nextState), phase: "await_roll", lastCreditorId: null };

    if (allButOneBankrupt(nextState.players)) {
      return { ...nextState, phase: "game_over" };
    }

    return setPhaseForPlayer(nextState);
  }

  if (action.type === "TRADE_EXECUTE") {
    const { fromId, toId, cash, propertyId } = action.payload;
    if (fromId === toId) return state;
    const from = state.players[fromId];
    const to = state.players[toId];
    if (cash < 0) return state;
    if (cash > 0 && from.cash < cash) return state;
    if (propertyId && state.properties[propertyId]?.ownerId !== fromId) return state;
    if (propertyId && state.properties[propertyId]?.houses > 0) return state;
    const nextState = {
      ...state,
      players: state.players.map((p) => {
        if (p.id === fromId) {
          return {
            ...p,
            cash: p.cash - cash,
            properties: propertyId ? p.properties.filter((id) => id !== propertyId) : p.properties
          };
        }
        if (p.id === toId) {
          return {
            ...p,
            cash: p.cash + cash,
            properties: propertyId ? [...p.properties, propertyId] : p.properties
          };
        }
        return p;
      }),
      properties: propertyId
        ? {
          ...state.properties,
          [propertyId]: { ...state.properties[propertyId], ownerId: toId }
        }
        : state.properties
    };
    return logWithLimit(nextState, `Giao dịch đã thực hiện giữa ${from.name} và ${to.name}.`);
  }

  return state;
}
