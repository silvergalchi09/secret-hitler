import { randomInt } from "node:crypto";
import {
  buildRoleList,
  fascistTrack,
  partyOf,
  POLICY_NAME,
  POWER_NAME,
  powerForFascistSlot,
  ROLE_NAME,
} from "../shared/rules.ts";
import type {
  ExpansionMode,
  GameAction,
  LogEntry,
  NightInfo,
  Phase,
  Policy,
  PresidentialPower,
  PrivateState,
  PublicState,
  Role,
  VoteChoice,
  Winner,
} from "../shared/types.ts";

export interface SeatPlayer {
  id: string;
  nickname: string;
  connected: boolean;
  isHost: boolean;
}

export interface InternalGame {
  phase: Phase;
  playerOrder: string[];
  nicknames: Record<string, string>;
  roles: Record<string, Role>;
  alive: Record<string, boolean>;
  investigated: Record<string, boolean>;
  nightConfirmed: Record<string, boolean>;
  liberalPolicies: number;
  fascistPolicies: number;
  electionTracker: number;
  drawPile: Policy[];
  discardPile: Policy[];
  presidentialCandidateId: string;
  chancellorCandidateId: string | null;
  lastElectedPresidentId: string | null;
  lastElectedChancellorId: string | null;
  votes: Record<string, VoteChoice>;
  lastVotes: Record<string, VoteChoice> | null;
  policyHand: Policy[];
  vetoUnlocked: boolean;
  vetoRejectedThisSession: boolean;
  currentPower: PresidentialPower | null;
  pendingPowerReveal: "peek" | "investigate" | null;
  investigationResult: { playerId: string; party: "liberal" | "fascist" | "mastermind" } | null;
  peekedPolicies: Policy[] | null;
  specialElectionReturnId: string | null;
  inSpecialElection: boolean;
  winner: Winner | null;
  winReason: string | null;
  log: LogEntry[];
  logSeq: number;
  expansion: ExpansionMode;
  fascistFiveBeforeLiberalFour: boolean;
}

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function nameOf(game: InternalGame, id: string): string {
  return game.nicknames[id] ?? "알 수 없음";
}

function pushLog(game: InternalGame, text: string): void {
  game.logSeq += 1;
  game.log.push({ id: game.logSeq, text });
  if (game.log.length > 80) {
    game.log.splice(0, game.log.length - 80);
  }
}

function livingIds(game: InternalGame): string[] {
  return game.playerOrder.filter((id) => game.alive[id]);
}

function livingCount(game: InternalGame): number {
  return livingIds(game).length;
}

function nextAliveAfter(game: InternalGame, playerId: string): string {
  const order = game.playerOrder;
  const start = order.indexOf(playerId);
  for (let i = 1; i <= order.length; i++) {
    const id = order[(start + i) % order.length];
    if (game.alive[id]) return id;
  }
  throw new GameError("생존 플레이어가 없습니다.");
}

function firstAliveFrom(game: InternalGame, playerId: string): string {
  if (game.alive[playerId]) return playerId;
  return nextAliveAfter(game, playerId);
}

export function termLimitedIds(game: InternalGame): string[] {
  const ids: string[] = [];
  if (
    game.lastElectedChancellorId &&
    game.alive[game.lastElectedChancellorId]
  ) {
    ids.push(game.lastElectedChancellorId);
  }
  if (
    livingCount(game) > 5 &&
    game.lastElectedPresidentId &&
    game.alive[game.lastElectedPresidentId]
  ) {
    ids.push(game.lastElectedPresidentId);
  }
  return ids;
}

export function eligibleChancellorIds(game: InternalGame): string[] {
  const limited = new Set(termLimitedIds(game));
  return livingIds(game).filter(
    (id) => id !== game.presidentialCandidateId && !limited.has(id),
  );
}

function maybeReshuffle(game: InternalGame): void {
  if (game.drawPile.length >= 3) return;
  game.drawPile = shuffle([...game.drawPile, ...game.discardPile]);
  game.discardPile = [];
  pushLog(game, "정책 덱을 다시 섞었습니다.");
}

function draw(game: InternalGame, n: number): Policy[] {
  maybeReshuffle(game);
  if (game.drawPile.length < n) {
    throw new GameError("정책 카드가 부족합니다.");
  }
  return game.drawPile.splice(0, n);
}

function nightInfoFor(game: InternalGame, playerId: string): NightInfo | null {
  const role = game.roles[playerId];
  if (!role || role === "liberal") return null;
  const others = game.playerOrder.filter((id) => id !== playerId);

  if (role === "mastermind") {
    const hitlerId = others.find((id) => game.roles[id] === "hitler") ?? null;
    return {
      teammates: others.map((id) => ({ id, role: game.roles[id] })),
      hitlerId,
      seesHitler: true,
      seesEveryone: true,
    };
  }

  const n = game.playerOrder.length;
  if (n <= 6) {
    const teammates = others
      .filter((id) => game.roles[id] === "fascist" || game.roles[id] === "hitler")
      .map((id) => ({ id, role: game.roles[id] }));
    const hitlerId =
      game.roles[playerId] === "hitler"
        ? null
        : (others.find((id) => game.roles[id] === "hitler") ?? null);
    return { teammates, hitlerId, seesHitler: true };
  }

  if (role === "hitler") return null;

  const teammates = others
    .filter((id) => game.roles[id] === "fascist")
    .map((id) => ({ id, role: game.roles[id] }));
  const hitlerId = others.find((id) => game.roles[id] === "hitler") ?? null;
  return { teammates, hitlerId, seesHitler: true };
}

function mastermindId(game: InternalGame): string | undefined {
  return game.playerOrder.find((id) => game.roles[id] === "mastermind");
}

function tryMastermindWin(
  game: InternalGame,
  policy: Policy,
  chaos: boolean,
): boolean {
  if (game.expansion !== "mastermind") return false;
  const mm = mastermindId(game);
  if (!mm || !game.alive[mm]) return false;

  if (
    policy === "fascist" &&
    game.fascistPolicies >= 5 &&
    game.liberalPolicies >= 4 &&
    !game.fascistFiveBeforeLiberalFour
  ) {
    endGame(
      game,
      "mastermind",
      "자유 정책 4장 이후 파시스트 정책 5장이 발효되어 마스터 마인드가 승리했습니다.",
    );
    return true;
  }

  if (
    policy === "liberal" &&
    game.liberalPolicies >= 4 &&
    game.fascistFiveBeforeLiberalFour &&
    !chaos &&
    game.lastElectedChancellorId === mm
  ) {
    endGame(
      game,
      "mastermind",
      "파시스트 정책 5장 이후 마스터 마인드가 수상으로서 4번째 자유 정책을 발효해 승리했습니다.",
    );
    return true;
  }
  return false;
}

function endGame(game: InternalGame, winner: Winner, winReason: string): void {
  game.phase = "gameOver";
  game.winner = winner;
  game.winReason = winReason;
  game.policyHand = [];
  game.currentPower = null;
  game.pendingPowerReveal = null;
  pushLog(game, winReason);
}

function beginNextElection(game: InternalGame): void {
  if (game.winner) return;
  game.chancellorCandidateId = null;
  game.votes = {};
  game.policyHand = [];
  game.currentPower = null;
  game.pendingPowerReveal = null;
  game.investigationResult = null;
  game.peekedPolicies = null;
  game.vetoRejectedThisSession = false;

  if (game.inSpecialElection) {
    game.inSpecialElection = false;
    const returnId = game.specialElectionReturnId;
    game.specialElectionReturnId = null;
    game.presidentialCandidateId = firstAliveFrom(
      game,
      returnId ?? game.presidentialCandidateId,
    );
  } else {
    game.presidentialCandidateId = nextAliveAfter(
      game,
      game.presidentialCandidateId,
    );
  }
  game.phase = "nominate";
}

function enactRevealedPolicy(
  game: InternalGame,
  policy: Policy,
  chaos: boolean,
): void {
  game.electionTracker = 0;
  if (policy === "liberal") {
    game.liberalPolicies += 1;
    pushLog(
      game,
      chaos
        ? `혼란: ${POLICY_NAME.liberal}이 발효되었습니다. (권한 없음)`
        : `${POLICY_NAME.liberal}이 발효되었습니다.`,
    );
    if (game.liberalPolicies >= 5) {
      endGame(game, "liberal", "자유주의 정책 5장이 발효되어 자유당이 승리했습니다.");
      return;
    }
    if (tryMastermindWin(game, policy, chaos)) return;
    beginNextElection(game);
    return;
  }

  game.fascistPolicies += 1;
  if (game.fascistPolicies >= 5) {
    game.vetoUnlocked = true;
  }
  if (game.fascistPolicies >= 5 && game.liberalPolicies < 4) {
    game.fascistFiveBeforeLiberalFour = true;
  }
  pushLog(
    game,
    chaos
      ? `혼란: ${POLICY_NAME.fascist}이 발효되었습니다. (권한 없음)`
      : `${POLICY_NAME.fascist}이 발효되었습니다.`,
  );
  if (tryMastermindWin(game, policy, chaos)) return;
  if (game.fascistPolicies >= 6) {
    endGame(game, "fascist", "파시스트 정책 6장이 발효되어 파시스트가 승리했습니다.");
    return;
  }
  if (chaos) {
    game.lastElectedPresidentId = null;
    game.lastElectedChancellorId = null;
    beginNextElection(game);
    return;
  }
  const power = powerForFascistSlot(game.playerOrder.length, game.fascistPolicies);
  if (power) {
    game.currentPower = power;
    game.phase = "presidentialPower";
    pushLog(game, `대통령 권한: ${POWER_NAME[power]}`);
    return;
  }
  beginNextElection(game);
}

function doChaos(game: InternalGame): void {
  pushLog(game, "내각이 세 번 연속 부결되어 혼란이 발생했습니다.");
  const [policy] = draw(game, 1);
  enactRevealedPolicy(game, policy, true);
}

function startLegislativeSession(game: InternalGame): void {
  game.policyHand = draw(game, 3);
  game.phase = "presidentDiscard";
  game.vetoRejectedThisSession = false;
}

export function createGame(
  players: SeatPlayer[],
  expansion: ExpansionMode = "base",
): InternalGame {
  const playerOrder = players.map((p) => p.id);
  const rolesList = shuffle(buildRoleList(playerOrder.length));
  if (expansion === "mastermind") {
    const liberalIndex = rolesList.findIndex((role) => role === "liberal");
    if (liberalIndex >= 0) {
      rolesList[liberalIndex] = shuffle<Role>(["liberal", "mastermind"])[0];
    }
  }
  const roles: Record<string, Role> = {};
  const alive: Record<string, boolean> = {};
  const investigated: Record<string, boolean> = {};
  const nightConfirmed: Record<string, boolean> = {};
  const nicknames: Record<string, string> = {};
  for (let i = 0; i < playerOrder.length; i++) {
    const id = playerOrder[i];
    roles[id] = rolesList[i];
    alive[id] = true;
    investigated[id] = false;
    nightConfirmed[id] = false;
    nicknames[id] = players[i].nickname;
  }

  const drawPile = shuffle([
    ...Array<Policy>(6).fill("liberal"),
    ...Array<Policy>(11).fill("fascist"),
  ]);
  const firstPresident = playerOrder[randomInt(playerOrder.length)];

  const game: InternalGame = {
    phase: "night",
    playerOrder,
    nicknames,
    roles,
    alive,
    investigated,
    nightConfirmed,
    liberalPolicies: 0,
    fascistPolicies: 0,
    electionTracker: 0,
    drawPile,
    discardPile: [],
    presidentialCandidateId: firstPresident,
    chancellorCandidateId: null,
    lastElectedPresidentId: null,
    lastElectedChancellorId: null,
    votes: {},
    lastVotes: null,
    policyHand: [],
    vetoUnlocked: false,
    vetoRejectedThisSession: false,
    currentPower: null,
    pendingPowerReveal: null,
    investigationResult: null,
    peekedPolicies: null,
    specialElectionReturnId: null,
    inSpecialElection: false,
    winner: null,
    winReason: null,
    log: [],
    logSeq: 0,
    expansion,
    fascistFiveBeforeLiberalFour: false,
  };
  pushLog(game, `게임이 시작되었습니다. 첫 대통령은 ${nameOf(game, firstPresident)}입니다.`);
  if (expansion === "mastermind") {
    pushLog(
      game,
      "마스터 마인드 규칙을 사용합니다. 자유당 한 자리에 마스터 마인드가 섞여 들어갈 수 있습니다.",
    );
  }
  return game;
}

function assertAliveActor(game: InternalGame, playerId: string): void {
  if (!game.alive[playerId]) {
    throw new GameError("처형된 플레이어는 행동할 수 없습니다.");
  }
}

function applyStartLegislativeAfterElection(game: InternalGame): void {
  const presidentId = game.presidentialCandidateId;
  const chancellorId = game.chancellorCandidateId;
  if (!chancellorId) throw new GameError("수상이 없습니다.");
  game.lastElectedPresidentId = presidentId;
  game.lastElectedChancellorId = chancellorId;
  pushLog(
    game,
    `내각이 구성되었습니다. 대통령 ${nameOf(game, presidentId)}, 수상 ${nameOf(game, chancellorId)}.`,
  );

  if (game.fascistPolicies >= 3 && game.roles[chancellorId] === "hitler") {
    endGame(
      game,
      "fascist",
      "파시스트 정책 3장 이후 히틀러가 수상으로 선출되어 파시스트가 승리했습니다.",
    );
    return;
  }
  startLegislativeSession(game);
}

export function actorIsUp(game: InternalGame, playerId: string): boolean {
  if (game.phase === "gameOver" || game.phase === "lobby") return false;
  if (!game.alive[playerId] && game.phase !== "night") return false;
  switch (game.phase) {
    case "night":
      return !game.nightConfirmed[playerId];
    case "nominate":
      return playerId === game.presidentialCandidateId;
    case "vote":
      return game.alive[playerId] && game.votes[playerId] === undefined;
    case "presidentDiscard":
      return playerId === game.presidentialCandidateId;
    case "chancellorEnact":
      return playerId === game.chancellorCandidateId;
    case "vetoConfirm":
      return playerId === game.presidentialCandidateId;
    case "presidentialPower":
      return playerId === game.lastElectedPresidentId;
    default:
      return false;
  }
}

export function applyAction(game: InternalGame, playerId: string, action: GameAction): void {
  if (action.type === "restart") {
    throw new GameError("재시작은 로비에서 처리됩니다.");
  }
  if (game.phase === "gameOver") {
    throw new GameError("이미 종료된 게임입니다.");
  }

  switch (action.type) {
    case "startGame":
      throw new GameError("이미 게임이 진행 중입니다.");

    case "confirmNight": {
      if (game.phase !== "night") throw new GameError("역할 확인 단계가 아닙니다.");
      game.nightConfirmed[playerId] = true;
      if (game.playerOrder.every((id) => game.nightConfirmed[id])) {
        game.phase = "nominate";
        pushLog(
          game,
          `${nameOf(game, game.presidentialCandidateId)} 대통령이 수상을 지명합니다.`,
        );
      }
      return;
    }

    case "nominate": {
      assertAliveActor(game, playerId);
      if (game.phase !== "nominate") throw new GameError("지명 단계가 아닙니다.");
      if (playerId !== game.presidentialCandidateId) {
        throw new GameError("대통령만 수상을 지명할 수 있습니다.");
      }
      if (!eligibleChancellorIds(game).includes(action.playerId)) {
        throw new GameError("그 플레이어는 수상 후보가 될 수 없습니다.");
      }
      game.chancellorCandidateId = action.playerId;
      game.votes = {};
      game.lastVotes = null;
      game.phase = "vote";
      pushLog(
        game,
        `${nameOf(game, playerId)} 대통령이 ${nameOf(game, action.playerId)}을(를) 수상 후보로 지명했습니다.`,
      );
      return;
    }

    case "vote": {
      assertAliveActor(game, playerId);
      if (game.phase !== "vote") throw new GameError("투표 단계가 아닙니다.");
      if (game.votes[playerId] !== undefined) {
        throw new GameError("이미 투표했습니다.");
      }
      if (action.choice !== "ja" && action.choice !== "nein") {
        throw new GameError("잘못된 투표입니다.");
      }
      game.votes[playerId] = action.choice;
      if (livingIds(game).some((id) => game.votes[id] === undefined)) {
        return;
      }
      game.lastVotes = { ...game.votes };
      const ja = livingIds(game).filter((id) => game.votes[id] === "ja").length;
      const nein = livingCount(game) - ja;
      pushLog(game, `투표 결과: Ja ${ja} / Nein ${nein}`);
      if (ja > livingCount(game) / 2) {
        applyStartLegislativeAfterElection(game);
      } else {
        game.electionTracker += 1;
        pushLog(game, `내각이 부결되었습니다. (선거 추적 ${game.electionTracker}/3)`);
        game.chancellorCandidateId = null;
        game.votes = {};
        if (game.electionTracker >= 3) {
          doChaos(game);
        } else {
          beginNextElection(game);
        }
      }
      return;
    }

    case "discardPolicy": {
      assertAliveActor(game, playerId);
      if (game.phase !== "presidentDiscard") throw new GameError("대통령 입법 단계가 아닙니다.");
      if (playerId !== game.presidentialCandidateId) {
        throw new GameError("대통령만 정책을 버릴 수 있습니다.");
      }
      if (game.policyHand.length !== 3) throw new GameError("정책 3장이 필요합니다.");
      if (action.index < 0 || action.index > 2) throw new GameError("잘못된 카드입니다.");
      const discarded = game.policyHand.splice(action.index, 1)[0];
      game.discardPile.push(discarded);
      game.phase = "chancellorEnact";
      return;
    }

    case "enactPolicy": {
      assertAliveActor(game, playerId);
      if (game.phase !== "chancellorEnact") throw new GameError("수상 입법 단계가 아닙니다.");
      if (playerId !== game.chancellorCandidateId) {
        throw new GameError("수상만 정책을 발효할 수 있습니다.");
      }
      if (game.policyHand.length !== 2) throw new GameError("정책 2장이 필요합니다.");
      if (action.index < 0 || action.index > 1) throw new GameError("잘못된 카드입니다.");
      const enacted = game.policyHand[action.index];
      const leftover = game.policyHand[1 - action.index];
      game.discardPile.push(leftover);
      game.policyHand = [];
      enactRevealedPolicy(game, enacted, false);
      return;
    }

    case "requestVeto": {
      assertAliveActor(game, playerId);
      if (game.phase !== "chancellorEnact") throw new GameError("수상 입법 단계가 아닙니다.");
      if (playerId !== game.chancellorCandidateId) {
        throw new GameError("수상만 거부권을 제안할 수 있습니다.");
      }
      if (!game.vetoUnlocked) throw new GameError("아직 거부권이 해금되지 않았습니다.");
      if (game.vetoRejectedThisSession) {
        throw new GameError("이번 입법에서 거부권이 이미 거절되었습니다.");
      }
      game.phase = "vetoConfirm";
      pushLog(game, `${nameOf(game, playerId)} 수상이 거부권을 제안했습니다.`);
      return;
    }

    case "vetoResponse": {
      assertAliveActor(game, playerId);
      if (game.phase !== "vetoConfirm") throw new GameError("거부권 확인 단계가 아닙니다.");
      if (playerId !== game.presidentialCandidateId) {
        throw new GameError("대통령만 거부권에 응답할 수 있습니다.");
      }
      if (action.agree) {
        game.discardPile.push(...game.policyHand);
        game.policyHand = [];
        game.electionTracker += 1;
        pushLog(
          game,
          `거부권이 가결되었습니다. 정책이 모두 폐기되었습니다. (선거 추적 ${game.electionTracker}/3)`,
        );
        if (game.electionTracker >= 3) {
          doChaos(game);
        } else {
          beginNextElection(game);
        }
      } else {
        game.vetoRejectedThisSession = true;
        game.phase = "chancellorEnact";
        pushLog(game, "대통령이 거부권을 거절했습니다. 수상은 정책을 발효해야 합니다.");
      }
      return;
    }

    case "usePower": {
      assertAliveActor(game, playerId);
      if (game.phase !== "presidentialPower") throw new GameError("대통령 권한 단계가 아닙니다.");
      if (playerId !== game.lastElectedPresidentId) {
        throw new GameError("현직 대통령만 권한을 사용할 수 있습니다.");
      }
      if (game.pendingPowerReveal) {
        throw new GameError("먼저 확인 버튼을 눌러 주세요.");
      }
      const power = game.currentPower;
      if (!power) throw new GameError("사용할 권한이 없습니다.");

      if (power === "policyPeek") {
        maybeReshuffle(game);
        game.peekedPolicies = game.drawPile.slice(0, 3);
        game.pendingPowerReveal = "peek";
        pushLog(game, `${nameOf(game, playerId)} 대통령이 정책 덱 윗장을 확인했습니다.`);
        return;
      }

      const targetId = action.targetId;
      if (!targetId) throw new GameError("대상을 선택해야 합니다.");
      if (!game.alive[targetId]) throw new GameError("이미 처형된 플레이어입니다.");
      if (targetId === playerId) throw new GameError("자기 자신을 선택할 수 없습니다.");

      if (power === "investigate") {
        if (game.investigated[targetId]) {
          throw new GameError("이미 조사한 플레이어입니다.");
        }
        game.investigated[targetId] = true;
        game.investigationResult = {
          playerId: targetId,
          party: partyOf(game.roles[targetId]),
        };
        game.pendingPowerReveal = "investigate";
        pushLog(
          game,
          `${nameOf(game, playerId)} 대통령이 ${nameOf(game, targetId)}의 소속을 확인합니다.`,
        );
        return;
      }

      if (power === "specialElection") {
        game.inSpecialElection = true;
        game.specialElectionReturnId = nextAliveAfter(game, playerId);
        game.presidentialCandidateId = targetId;
        game.chancellorCandidateId = null;
        game.votes = {};
        game.policyHand = [];
        game.currentPower = null;
        game.pendingPowerReveal = null;
        game.phase = "nominate";
        pushLog(
          game,
          `${nameOf(game, playerId)} 대통령이 ${nameOf(game, targetId)}을(를) 다음 대통령 후보로 지정했습니다. (특별 선거)`,
        );
        return;
      }

      if (power === "execution") {
        if (game.roles[targetId] === "hitler") {
          game.alive[targetId] = false;
          endGame(
            game,
            "liberal",
            `${nameOf(game, targetId)}이(가) 히틀러였습니다. 자유당이 승리했습니다.`,
          );
          return;
        }
        game.alive[targetId] = false;
        pushLog(
          game,
          `${nameOf(game, playerId)} 대통령이 ${nameOf(game, targetId)}을(를) 처형했습니다.`,
        );
        beginNextElection(game);
        return;
      }
      return;
    }

    case "acknowledgePower": {
      if (game.phase !== "presidentialPower") throw new GameError("대통령 권한 단계가 아닙니다.");
      if (playerId !== game.lastElectedPresidentId) {
        throw new GameError("현직 대통령만 확인할 수 있습니다.");
      }
      if (!game.pendingPowerReveal) throw new GameError("확인할 내용이 없습니다.");
      game.pendingPowerReveal = null;
      game.peekedPolicies = null;
      game.investigationResult = null;
      beginNextElection(game);
      return;
    }

    default:
      throw new GameError("알 수 없는 행동입니다.");
  }
}

export function getPrivateState(game: InternalGame | null, playerId: string): PrivateState {
  if (!game) {
    return {
      playerId,
      role: null,
      party: null,
      nightInfo: null,
      policyHand: null,
      investigationResult: null,
      peekedPolicies: null,
    };
  }

  const role = game.roles[playerId] ?? null;
  let policyHand: Policy[] | null = null;
  if (
    game.phase === "presidentDiscard" &&
    playerId === game.presidentialCandidateId
  ) {
    policyHand = [...game.policyHand];
  }
  if (
    (game.phase === "chancellorEnact" || game.phase === "vetoConfirm") &&
    playerId === game.chancellorCandidateId
  ) {
    policyHand = [...game.policyHand];
  }

  return {
    playerId,
    role,
    party: role ? partyOf(role) : null,
    nightInfo: nightInfoFor(game, playerId),
    policyHand,
    investigationResult:
      playerId === game.lastElectedPresidentId ? game.investigationResult : null,
    peekedPolicies:
      playerId === game.lastElectedPresidentId ? game.peekedPolicies : null,
  };
}

export function getPublicGameFields(
  game: InternalGame,
  playerId: string,
): Omit<PublicState, "roomCode" | "players" | "testMode"> {
  return {
    expansion: game.expansion,
    phase: game.phase,
    playerOrder: game.playerOrder,
    liberalPolicies: game.liberalPolicies,
    fascistPolicies: game.fascistPolicies,
    electionTracker: game.electionTracker,
    drawPileCount: game.drawPile.length,
    discardPileCount: game.discardPile.length,
    presidentialCandidateId: game.presidentialCandidateId,
    chancellorCandidateId: game.chancellorCandidateId,
    lastElectedPresidentId: game.lastElectedPresidentId,
    lastElectedChancellorId: game.lastElectedChancellorId,
    termLimitedIds: termLimitedIds(game),
    votedIds: Object.keys(game.votes),
    lastVotes: game.lastVotes,
    vetoUnlocked: game.vetoUnlocked,
    vetoRejectedThisSession: game.vetoRejectedThisSession,
    inSpecialElection: game.inSpecialElection,
    currentPower: game.currentPower,
    pendingPowerReveal: game.pendingPowerReveal,
    log: game.log,
    winner: game.winner,
    winReason: game.winReason,
    revealedRoles:
      game.phase === "gameOver" ? { ...game.roles } : null,
    fascistTrack: fascistTrack(game.playerOrder.length),
    nightConfirmedIds: game.playerOrder.filter((id) => game.nightConfirmed[id]),
    youAreUp: actorIsUp(game, playerId),
  };
}
