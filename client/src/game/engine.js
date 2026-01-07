import { BOARD, GROUPS, RAILROADS, UTILITIES } from "./board.js";
import { CHANCE_CARDS, CHEST_CARDS } from "./cards.js";

export const START_CASH = 1500;
export const GO_BONUS = 200;
export const JAIL_BAIL = 50;

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function rollDice() {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  return { die1, die2, total: die1 + die2, isDouble: die1 === die2 };
}

export function createInitialState(playerNames, aiFlags = []) {
  const players = playerNames.map((name, index) => ({
    id: index,
    name,
    position: 0,
    cash: START_CASH,
    properties: [],
    inJail: false,
    jailTurns: 0,
    jailCards: { chance: 0, chest: 0 },
    bankrupt: false,
    isAI: Boolean(aiFlags[index])
  }));

  const properties = {};
  BOARD.forEach((square) => {
    if (["property", "railroad", "utility"].includes(square.type)) {
      properties[square.id] = {
        ownerId: null,
        houses: 0,
        mortgaged: false
      };
    }
  });

  return {
    phase: "await_roll",
    players,
    activePlayerIndex: 0,
    board: BOARD,
    properties,
    decks: {
      chance: shuffle(CHANCE_CARDS),
      chest: shuffle(CHEST_CARDS)
    },
    roll: null,
    doublesCount: 0,
    pending: null,
    lastCreditorId: null,
    log: ["Bắt đầu ván chơi. Hãy đổ xúc xắc để bắt đầu."]
  };
}

export function getSquare(squareId) {
  return BOARD[squareId];
}

export function addLog(state, message) {
  return {
    ...state,
    log: [message, ...state.log].slice(0, 40)
  };
}

export function countOwnedByType(state, ownerId, list) {
  return list.filter((id) => state.properties[id]?.ownerId === ownerId).length;
}

export function playerOwnsGroup(state, ownerId, color) {
  const group = GROUPS[color] || [];
  return group.every((id) => state.properties[id]?.ownerId === ownerId && !state.properties[id]?.mortgaged);
}

export function canBuildHouse(state, ownerId, squareId) {
  const square = getSquare(squareId);
  if (!square || square.type !== "property") return false;
  const info = state.properties[squareId];
  if (!info || info.ownerId !== ownerId || info.mortgaged) return false;
  if (!playerOwnsGroup(state, ownerId, square.color)) return false;
  if (info.houses >= 5) return false;

  const group = GROUPS[square.color];
  const houseCounts = group.map((id) => state.properties[id].houses);
  const min = Math.min(...houseCounts);
  return info.houses === min;
}

export function canSellHouse(state, ownerId, squareId) {
  const square = getSquare(squareId);
  if (!square || square.type !== "property") return false;
  const info = state.properties[squareId];
  if (!info || info.ownerId !== ownerId || info.houses === 0) return false;

  const group = GROUPS[square.color];
  const houseCounts = group.map((id) => state.properties[id].houses);
  const max = Math.max(...houseCounts);
  return info.houses === max;
}

export function calculateRent(state, squareId, diceTotal, rentMultiplier = 1) {
  const square = getSquare(squareId);
  const info = state.properties[squareId];
  if (!square || !info || info.mortgaged) return 0;

  if (square.type === "property") {
    const baseRent = square.rent[info.houses];
    const hasMonopoly = playerOwnsGroup(state, info.ownerId, square.color);
    const doubled = info.houses === 0 && hasMonopoly ? 2 : 1;
    return baseRent * doubled * rentMultiplier;
  }

  if (square.type === "railroad") {
    const count = countOwnedByType(state, info.ownerId, RAILROADS);
    return square.rent[count - 1] * rentMultiplier;
  }

  if (square.type === "utility") {
    if (rentMultiplier === "card_utility") {
      return diceTotal * 10;
    }
    const count = countOwnedByType(state, info.ownerId, UTILITIES);
    const multiplier = count === 2 ? 10 : 4;
    return diceTotal * multiplier * rentMultiplier;
  }

  return 0;
}

export function movePlayer(state, playerId, steps) {
  const player = state.players[playerId];
  const start = player.position;
  const next = (start + steps) % BOARD.length;
  const passedGo = start + steps >= BOARD.length;

  const updatedPlayers = state.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          position: next,
          cash: passedGo ? p.cash + GO_BONUS : p.cash
        }
      : p
  );

  const message = passedGo ? `${player.name} đã qua GO và nhận $${GO_BONUS}.` : null;
  return { ...state, players: updatedPlayers, log: message ? [message, ...state.log] : state.log };
}

export function sendToJail(state, playerId) {
  const updatedPlayers = state.players.map((p) =>
    p.id === playerId
      ? { ...p, position: 10, inJail: true, jailTurns: 0 }
      : p
  );
  return addLog({ ...state, players: updatedPlayers, roll: null, doublesCount: 0 }, `${state.players[playerId].name} bị đưa vào tù.`);
}

export function drawCard(state, deckName) {
  const deck = state.decks[deckName];
  const [card, ...rest] = deck;
  return { card, newDeck: [...rest, card] };
}

export function removeCardFromDeck(state, deckName, cardId) {
  const deck = state.decks[deckName].filter((card) => card.id !== cardId);
  return { ...state, decks: { ...state.decks, [deckName]: deck } };
}

export function applyCardEffect(state, playerId, card, diceTotal, deckName) {
  let nextState = addLog(state, `${state.players[playerId].name} rút thẻ: ${card.text}`);

  if (card.type === "advance") {
    const target = card.target;
    const player = nextState.players[playerId];
    const passedGo = target < player.position;
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === playerId
          ? { ...p, position: target, cash: passedGo ? p.cash + GO_BONUS : p.cash }
          : p
      )
    };
    if (passedGo) {
      nextState = addLog(nextState, `${player.name} đã qua GO và nhận $${GO_BONUS}.`);
    }
    return { state: nextState, landed: true };
  }

  if (card.type === "back") {
    const player = nextState.players[playerId];
    const nextPosition = (player.position - card.spaces + BOARD.length) % BOARD.length;
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === playerId ? { ...p, position: nextPosition } : p))
    };
    return { state: nextState, landed: true };
  }

  if (card.type === "go_to_jail") {
    return { state: sendToJail(nextState, playerId), landed: false };
  }

  if (card.type === "collect") {
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === playerId ? { ...p, cash: p.cash + card.amount } : p))
    };
    return { state: nextState, landed: false };
  }

  if (card.type === "pay") {
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === playerId ? { ...p, cash: p.cash - card.amount } : p))
    };
    return { state: { ...nextState, lastCreditorId: null }, landed: false };
  }

  if (card.type === "collect_each") {
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === playerId
          ? { ...p, cash: p.cash + card.amount * (nextState.players.length - 1) }
          : { ...p, cash: p.cash - card.amount }
      )
    };
    return { state: nextState, landed: false };
  }

  if (card.type === "pay_each") {
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === playerId
          ? { ...p, cash: p.cash - card.amount * (nextState.players.length - 1) }
          : { ...p, cash: p.cash + card.amount }
      )
    };
    return { state: nextState, landed: false };
  }

  if (card.type === "repairs") {
    const player = nextState.players[playerId];
    const properties = player.properties.map((id) => nextState.properties[id]);
    let houses = 0;
    let hotels = 0;
    properties.forEach((info) => {
      if (info.houses === 5) hotels += 1;
      else houses += info.houses;
    });
    const cost = houses * card.house + hotels * card.hotel;
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === playerId ? { ...p, cash: p.cash - cost } : p))
    };
    return { state: nextState, landed: false };
  }

  if (card.type === "jail_free") {
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === playerId
          ? { ...p, jailCards: { ...p.jailCards, [deckName]: p.jailCards[deckName] + 1 } }
          : p
      )
    };
    return { state: removeCardFromDeck(nextState, deckName, card.id), landed: false };
  }

  if (card.type === "nearest_utility" || card.type === "nearest_railroad") {
    const list = card.type === "nearest_utility" ? UTILITIES : RAILROADS;
    const player = nextState.players[playerId];
    const current = player.position;
    const next = list.find((id) => id > current) ?? list[0];
    const passedGo = next < current;
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === playerId
          ? { ...p, position: next, cash: passedGo ? p.cash + GO_BONUS : p.cash }
          : p
      )
    };
    if (passedGo) {
      nextState = addLog(nextState, `${player.name} đã qua GO và nhận $${GO_BONUS}.`);
    }
    const multiplier = card.type === "nearest_railroad" ? 2 : "card_utility";
    return { state: nextState, landed: true, rentMultiplier: multiplier };
  }

  return { state: nextState, landed: false };
}
