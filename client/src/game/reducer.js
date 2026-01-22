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
import { PENALTIES } from "./board.js";
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
const WRONG_ANSWER_PENALTY = 50;

function pickQuestion(state, targetDifficulty) {
  const usedIds = state.usedQuestionIds || [];

  // Get all unused questions
  const unusedQuestions = QUESTIONS.filter((q, index) => !usedIds.includes(index));

  // No questions left
  if (unusedQuestions.length === 0) {
    return null;
  }

  // Try to find unused questions with target difficulty
  const candidates = unusedQuestions.filter((q) => q.difficulty === targetDifficulty);

  if (candidates.length > 0) {
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const questionIndex = QUESTIONS.indexOf(picked);
    return { question: picked, questionIndex };
  }

  // Fallback to any unused question
  const picked = unusedQuestions[Math.floor(Math.random() * unusedQuestions.length)];
  const questionIndex = QUESTIONS.indexOf(picked);
  return { question: picked, questionIndex };
}

function isQuestionsExhausted(state) {
  const usedIds = state.usedQuestionIds || [];
  return usedIds.length >= QUESTIONS.length;
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
    const ownerId = info.ownerId !== null && info.ownerId !== undefined ? Number(info.ownerId) : null;
    const currentPlayerId = Number(playerId);

    console.log(`[DEBUG] Landed on ${square.name} (${square.id}). Owner: ${ownerId}, Current: ${currentPlayerId}`);

    // Unowned property
    if (ownerId === null) {
      console.log(`[DEBUG] Property ${square.name} is UNOWNED.`);

      // Check if questions are exhausted - end game
      if (isQuestionsExhausted(nextState)) {
        return {
          ...nextState,
          phase: "game_over",
          gameOverReason: "questions_exhausted"
        };
      }


      // 90% Chance for Question
      if (Math.random() < 0.90) {
        let difficulty = "easy";
        const price = square.price || 150;
        if (price >= 280) difficulty = "hard";
        else if (price >= 140) difficulty = "medium";

        const picked = pickQuestion(nextState, difficulty);
        if (!picked) {
          return {
            ...nextState,
            phase: "game_over",
            gameOverReason: "questions_exhausted"
          };
        }

        return {
          ...nextState,
          phase: "question",
          pending: {
            type: "question",
            context: "purchase",
            squareId: square.id,
            question: picked.question,
            questionIndex: picked.questionIndex
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

    if (ownerId === currentPlayerId) {
      const canUpgrade = canBuildHouse(nextState, currentPlayerId, square.id);
      const player = nextState.players[currentPlayerId];

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
      return logWithLimit(nextState, `${nextState.players[currentPlayerId].name} dừng tại ${square.name}.`);
    }

    const rent = Math.abs(calculateRent(nextState, square.id, diceTotal, rentMultiplier));
    console.log(`[DEBUG] Rent calculated for ${square.name}: ${rent}`);

    // Deduct rent IMMEDIATELY (User Request: "trừ tiền ngay")
    // Use currentPlayerId (Number) ensuring updatePlayer works
    nextState = updatePlayer(nextState, currentPlayerId, (player) => ({
      ...player,
      cash: player.cash - rent
    }));
    nextState = updatePlayer(nextState, ownerId, (player) => ({
      ...player,
      cash: player.cash + rent
    }));
    nextState = {
      ...nextState,
      lastCreditorId: ownerId
    };
    nextState = logWithLimit(nextState, `${nextState.players[currentPlayerId].name} trả $${rent} tiền thuê cho ${nextState.players[ownerId].name}.`);

    // NEW: Option to buy back property from owner
    // Cost is just Value + Houses (Rent is already paid)
    const totalValue = square.price || 0;
    const houseValue = (info.houses || 0) * (square.houseCost || 0);
    const buyBackCost = totalValue + houseValue;

    // Only offer buy back if player can afford it (checking new cash balance)
    if (nextState.players[currentPlayerId].cash >= buyBackCost) {
      return {
        ...nextState,
        phase: "buy_back_decision",
        pending: {
          type: "buy_back",
          squareId: square.id,
          rent: rent, // Pass actual rent for display validation
          buyBackCost: buyBackCost,
          ownerId: ownerId
        }
      };
    }

    return nextState;
  }

  // Penalty Square - Show Modal
  if (square.type === "tax") {
    const randomPenalty = PENALTIES[Math.floor(Math.random() * PENALTIES.length)];
    return {
      ...nextState,
      phase: "penalty",
      pending: {
        type: "penalty",
        squareId: square.id,
        amount: square.amount,
        text: randomPenalty
      }
    };
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
    // Check if questions are exhausted - end game
    if (isQuestionsExhausted(nextState)) {
      return {
        ...nextState,
        phase: "game_over",
        gameOverReason: "questions_exhausted"
      };
    }

    const picked = pickQuestion(nextState, "medium");
    if (!picked) {
      return {
        ...nextState,
        phase: "game_over",
        gameOverReason: "questions_exhausted"
      };
    }

    return {
      ...nextState,
      phase: "question",
      pending: {
        type: "question",
        context: "challenge",
        question: picked.question,
        questionIndex: picked.questionIndex
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

  if (action.type === "DEBUG_MOVE") {
    const { targetId } = action.payload;
    if (typeof targetId !== 'number') return state;

    // Move current player to targetId
    let nextState = movePlayer(state, activeId, 0); // Reset? No, just set pos.
    // Actually movePlayer adds offset. We need to set absolute position.
    // Let's manually set it.
    nextState = {
      ...nextState,
      players: nextState.players.map((p, i) =>
        i === activeId ? { ...p, position: targetId } : p
      ),
      roll: { total: 0, isDouble: false, dice: [0, 0] } // Fake roll
    };

    // Resolve landing at new position
    nextState = resolveLanding(nextState, activeId, 0);
    return nextState;
  }

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

    if (["buy_decision", "question", "auction", "upgrade_decision", "penalty", "buy_back_decision"].includes(nextState.phase)) {
      console.log("ROLL: Keeping phase", nextState.phase);
      return nextState;
    }

    console.log("ROLL: Overwriting phase to post_roll. Previous was:", nextState.phase);
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
      if (["buy_decision", "question", "auction", "upgrade_decision", "penalty", "buy_back_decision"].includes(nextState.phase)) {
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
      if (["buy_decision", "question", "auction", "upgrade_decision", "penalty", "buy_back_decision"].includes(nextState.phase)) {
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
    const questionIndex = state.pending.questionIndex;
    const correct = action.payload.choiceIndex === question.answerIndex;
    const difficulty = question.difficulty;

    // Mark question as used
    const usedQuestionIds = [...(state.usedQuestionIds || [])];
    if (questionIndex !== undefined && !usedQuestionIds.includes(questionIndex)) {
      usedQuestionIds.push(questionIndex);
    }

    // Calculate remaining questions
    const totalQuestions = QUESTIONS.length;
    const remainingQuestions = totalQuestions - usedQuestionIds.length;

    if (state.pending.context === "purchase") {
      const discount = correct ? 20 : 0;

      if (correct) {
        const message = `Trả lời đúng. Giảm giá 20% khi mua tài sản. (Còn ${remainingQuestions} câu hỏi)`;
        return logWithLimit({
          ...state,
          usedQuestionIds,
          phase: "buy_decision",
          pending: { type: "buy", squareId: state.pending.squareId, discountPercent: discount }
        }, message);
      } else {
        // Wrong answer: deduct $50 penalty
        const penaltyState = updatePlayer(state, activeId, (player) => ({
          ...player,
          cash: player.cash - WRONG_ANSWER_PENALTY
        }));
        const message = `Trả lời sai. Không được giảm giá và bị phạt $${WRONG_ANSWER_PENALTY}. (Còn ${remainingQuestions} câu hỏi)`;
        return logWithLimit({
          ...penaltyState,
          usedQuestionIds,
          phase: "buy_decision",
          pending: { type: "buy", squareId: state.pending.squareId, discountPercent: discount }
        }, message);
      }
    }

    if (state.pending.context === "tax") {
      if (correct) {
        return logWithLimit({ ...state, usedQuestionIds, phase: "post_roll", pending: null }, `Trả lời đúng. Được miễn tiền phạt $${state.pending.amount}. (Còn ${remainingQuestions} câu hỏi)`);
      }
      // Incorrect: Pay the tax + $50 penalty
      const amount = state.pending.amount;
      const totalPenalty = amount + WRONG_ANSWER_PENALTY;
      const nextState = updatePlayer(state, activeId, (player) => ({
        ...player,
        cash: player.cash - totalPenalty
      }));
      return logWithLimit({ ...nextState, usedQuestionIds, phase: "post_roll", pending: null }, `Trả lời sai. Bị phạt $${amount} tiền thuế và thêm $${WRONG_ANSWER_PENALTY} phạt trả lời sai. (Còn ${remainingQuestions} câu hỏi)`);
    }

    if (state.pending.context === "challenge") {
      const reward = CHALLENGE_REWARD[difficulty] || CHALLENGE_REWARD.easy;
      // Wrong answer: lose reward.lose + $50 penalty
      const delta = correct ? reward.win : -(reward.lose + WRONG_ANSWER_PENALTY);
      const label = correct
        ? `Trả lời đúng, nhận $${reward.win}. (Còn ${remainingQuestions} câu hỏi)`
        : `Trả lời sai, mất $${reward.lose} và bị phạt thêm $${WRONG_ANSWER_PENALTY}. (Còn ${remainingQuestions} câu hỏi)`;
      const nextState = updatePlayer(state, activeId, (player) => ({
        ...player,
        cash: player.cash + delta
      }));
      return logWithLimit({ ...nextState, usedQuestionIds, phase: "post_roll", pending: null }, label);
    }

    return { ...state, usedQuestionIds, phase: "post_roll", pending: null };
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
    // Skip Auction -> Go directly to post_roll
    return logWithLimit({
      ...state,
      phase: "post_roll",
      pending: null
    }, `${state.players[activeId].name} không mua tài sản.`);
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

    // Check if questions are exhausted -> End Game immediately
    if (isQuestionsExhausted(state)) {
      return { ...state, phase: "game_over", gameOverReason: "questions_exhausted" };
    }

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
    // Allow selling even if upgraded (reset houses to 0)

    const value = square.price || 0; // Refund original price
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
    // If pending was upgrade_decision for this square, clear it to avoid stuck state
    const isPendingTarget = state.pending?.squareId === squareId;
    return logWithLimit(
      { ...nextState, phase: isPendingTarget ? "post_roll" : nextState.phase, pending: isPendingTarget ? null : nextState.pending },
      `${state.players[activeId].name} bán đứt ${square.name} với giá gốc $${value}.`
    );
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

  if (action.type === "BUY_OWNED_PROPERTY") {
    if (state.phase !== "buy_back_decision" || state.pending?.type !== "buy_back") return state;
    const { squareId, buyBackCost, ownerId } = state.pending;
    const square = getSquare(squareId);

    // Deduct from Player
    let nextState = updatePlayer(state, activeId, (p) => ({
      ...p,
      cash: p.cash - buyBackCost,
      properties: [...p.properties, squareId]
    }));

    // Add to Owner
    nextState = updatePlayer(nextState, ownerId, (p) => ({
      ...p,
      cash: p.cash + buyBackCost,
      properties: p.properties.filter((id) => id !== squareId)
    }));

    // Transfer Property (keep houses)
    nextState = {
      ...nextState,
      properties: {
        ...nextState.properties,
        [squareId]: { ...nextState.properties[squareId], ownerId: activeId }
      },
      phase: "post_roll",
      pending: null
    };

    return logWithLimit(nextState, `${state.players[activeId].name} mua lại ${square.name} từ ${state.players[ownerId].name} với giá $${buyBackCost}.`);
  }

  if (action.type === "DECLINE_BUY_OWNED_PROPERTY") {
    if (state.phase !== "buy_back_decision" || state.pending?.type !== "buy_back") return state;
    // Rent was already deducted in resolveLanding. Just move phase.
    return {
      ...state,
      phase: "post_roll",
      pending: null
    };
  }

  if (action.type === "PENALTY_OK") {
    if (state.phase !== "penalty" || state.pending?.type !== "penalty") return state;

    // NO MONEY DEDUCTION !!!
    // Just log and move on.

    const description = state.pending.text;
    const amount = state.pending.amount || 0;

    let nextState = state;
    if (amount > 0) {
      nextState = updatePlayer(state, activeId, (p) => ({
        ...p,
        cash: p.cash - amount
      }));
    }

    return logWithLimit({
      ...nextState,
      phase: "post_roll",
      pending: null
    }, `${state.players[activeId].name} chấp nhận hình phạt: "${description}" (mất $${amount}).`);
  }

  return state;
}
