import { randomInt } from "node:crypto";
import { MAX_PLAYERS, MIN_PLAYERS } from "../shared/rules.ts";
import type {
  ClientSnapshot,
  GameAction,
  PrivateState,
  PublicState,
} from "../shared/types.ts";
import {
  applyAction,
  createGame,
  GameError,
  getPrivateState,
  getPublicGameFields,
  type InternalGame,
} from "./game.ts";
import { botIdsNeedingAction, chooseBotAction } from "./bots.ts";

export interface RoomPlayer {
  id: string;
  nickname: string;
  socketId: string | null;
  connected: boolean;
  isBot: boolean;
}

const BOT_NAMES = ["한스", "오토", "그레타", "에밀", "리제", "카를", "안나", "프리츠", "헬가"];

const rooms = new Map<string, GameRoom>();

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}

export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code.toUpperCase());
}

export function createRoom(nickname: string, socketId: string): GameRoom {
  let code = generateCode();
  while (rooms.has(code)) code = generateCode();
  const room = new GameRoom(code, nickname, socketId);
  rooms.set(code, room);
  return room;
}

export function deleteRoomIfEmpty(code: string): void {
  const room = rooms.get(code);
  if (room && !room.players.some((p) => p.connected && !p.isBot)) {
    room.stopBots();
    rooms.delete(code);
  }
}

export class GameRoom {
  code: string;
  hostId: string;
  players: RoomPlayer[] = [];
  game: InternalGame | null = null;
  testMode = false;

  constructor(code: string, hostNickname: string, socketId: string) {
    this.code = code;
    const host: RoomPlayer = {
      id: crypto.randomUUID(),
      nickname: hostNickname.trim(),
      socketId,
      connected: true,
      isBot: false,
    };
    this.hostId = host.id;
    this.players.push(host);
  }

  get host(): RoomPlayer | undefined {
    return this.players.find((p) => p.id === this.hostId);
  }

  playerById(id: string): RoomPlayer | undefined {
    return this.players.find((p) => p.id === id);
  }

  playerBySocket(socketId: string): RoomPlayer | undefined {
    return this.players.find((p) => p.socketId === socketId);
  }

  join(nickname: string, socketId: string): RoomPlayer {
    if (this.game && this.game.phase !== "gameOver") {
      throw new GameError("이미 게임이 진행 중입니다. 기존 계정으로 재접속하세요.");
    }
    const name = nickname.trim();
    if (this.players.some((p) => p.nickname === name && p.connected)) {
      throw new GameError("이미 사용 중인 닉네임입니다.");
    }
    if (this.players.filter((p) => p.connected).length >= MAX_PLAYERS) {
      const bot = [...this.players].reverse().find((p) => p.isBot && p.connected);
      if (bot && !this.game) {
        this.players = this.players.filter((p) => p.id !== bot.id);
      } else {
        throw new GameError("방이 가득 찼습니다.");
      }
    }
    const existing = this.players.find((p) => p.nickname === name && !p.connected);
    if (existing && !this.game) {
      existing.socketId = socketId;
      existing.connected = true;
      return existing;
    }
    const player: RoomPlayer = {
      id: crypto.randomUUID(),
      nickname: name,
      socketId,
      connected: true,
      isBot: false,
    };
    this.players.push(player);
    return player;
  }

  reconnect(playerId: string, socketId: string, nickname?: string): RoomPlayer {
    const player = this.playerById(playerId);
    if (!player) {
      throw new GameError("이 방에 해당 플레이어가 없습니다.");
    }
    player.socketId = socketId;
    player.connected = true;
    if (nickname && nickname.trim() && !this.game) {
      player.nickname = nickname.trim();
    }
    return player;
  }

  disconnect(socketId: string): void {
    const player = this.playerBySocket(socketId);
    if (!player) return;
    player.connected = false;
    player.socketId = null;
    this.ensureHost();
  }

  ensureHost(): void {
    const connected =
      this.players.find((p) => p.connected && !p.isBot) ??
      this.players.find((p) => p.connected);
    if (connected) {
      this.hostId = connected.id;
    }
  }

  addBots(count: number): void {
    for (let i = 0; i < count; i++) this.addBot();
  }

  addBot(): RoomPlayer {
    if (this.game) {
      throw new GameError("로비에서만 봇을 넣을 수 있습니다.");
    }
    if (this.connectedSeats().length >= MAX_PLAYERS) {
      throw new GameError("방이 가득 찼습니다.");
    }
    const used = new Set(this.players.map((p) => p.nickname));
    const nickname =
      BOT_NAMES.find((name) => !used.has(name)) ?? `봇${this.bots().length + 1}`;
    const bot: RoomPlayer = {
      id: crypto.randomUUID(),
      nickname,
      socketId: null,
      connected: true,
      isBot: true,
    };
    this.players.push(bot);
    return bot;
  }

  removeBot(playerId?: string): void {
    if (this.game) {
      throw new GameError("로비에서만 봇을 뺄 수 있습니다.");
    }
    const target = playerId
      ? this.players.find((p) => p.id === playerId && p.isBot)
      : [...this.players].reverse().find((p) => p.isBot);
    if (!target) throw new GameError("빼 수 있는 봇이 없습니다.");
    this.players = this.players.filter((p) => p.id !== target.id);
  }

  stopBots(): void {
    /* timers live in index.ts */
  }

  bots(): RoomPlayer[] {
    return this.players.filter((p) => p.isBot);
  }

  needsBotAction(): boolean {
    if (!this.game || this.game.phase === "gameOver") return false;
    if (this.bots().length === 0) return false;
    return botIdsNeedingAction(this.game, this.bots().map((p) => p.id)).length > 0;
  }

  playBotStep(): boolean {
    if (!this.game || this.bots().length === 0) return false;
    const game = this.game;
    const bots = this.bots();
    const waiting = botIdsNeedingAction(game, bots.map((p) => p.id));
    if (waiting.length === 0) return false;

    if (game.phase === "night" || game.phase === "vote") {
      for (const id of waiting) {
        const action = chooseBotAction(game, id, (pid) => Boolean(this.playerById(pid)?.isBot));
        if (action) applyAction(game, id, action);
      }
      return true;
    }

    const id = waiting[0];
    const action = chooseBotAction(game, id, (pid) => Boolean(this.playerById(pid)?.isBot));
    if (!action) return false;
    applyAction(game, id, action);
    return true;
  }

  handleAction(playerId: string, action: GameAction): void {
    const player = this.playerById(playerId);
    if (!player) throw new GameError("플레이어를 찾을 수 없습니다.");

    if (action.type === "addBot") {
      if (playerId !== this.hostId) throw new GameError("호스트만 봇을 넣을 수 있습니다.");
      this.addBot();
      return;
    }

    if (action.type === "removeBot") {
      if (playerId !== this.hostId) throw new GameError("호스트만 봇을 뺄 수 있습니다.");
      this.removeBot(action.playerId);
      return;
    }

    if (action.type === "startGame") {
      if (playerId !== this.hostId) throw new GameError("호스트만 게임을 시작할 수 있습니다.");
      if (this.game && this.game.phase !== "gameOver") {
        throw new GameError("이미 게임이 진행 중입니다.");
      }
      const seated = this.connectedSeats();
      if (seated.length < MIN_PLAYERS || seated.length > MAX_PLAYERS) {
        throw new GameError(`게임은 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 합니다.`);
      }
      this.players = seated;
      this.game = createGame(
        seated.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          connected: p.connected,
          isHost: p.id === this.hostId,
        })),
      );
      return;
    }

    if (action.type === "restart") {
      if (playerId !== this.hostId) throw new GameError("호스트만 재시작할 수 있습니다.");
      if (!this.game || this.game.phase !== "gameOver") {
        throw new GameError("종료된 게임만 재시작할 수 있습니다.");
      }
      this.game = null;
      return;
    }

    if (!this.game) throw new GameError("아직 게임이 시작되지 않았습니다.");
    applyAction(this.game, playerId, action);
  }

  connectedSeats(): RoomPlayer[] {
    return this.players.filter((p) => p.connected);
  }

  snapshot(playerId: string): ClientSnapshot {
    return {
      publicState: this.publicState(playerId),
      privateState: this.privateState(playerId),
    };
  }

  privateState(playerId: string): PrivateState {
    return getPrivateState(this.game, playerId);
  }

  publicState(playerId: string): PublicState {
    const players = this.players.map((p) => ({
      id: p.id,
      nickname: this.game?.nicknames[p.id] ?? p.nickname,
      connected: p.connected,
      alive: this.game ? Boolean(this.game.alive[p.id]) : true,
      investigated: this.game ? Boolean(this.game.investigated[p.id]) : false,
      isHost: p.id === this.hostId,
      isBot: p.isBot,
    }));

    if (!this.game) {
      return {
        roomCode: this.code,
        testMode: this.testMode,
        phase: "lobby",
        players,
        playerOrder: this.players.map((p) => p.id),
        liberalPolicies: 0,
        fascistPolicies: 0,
        electionTracker: 0,
        drawPileCount: 17,
        discardPileCount: 0,
        presidentialCandidateId: null,
        chancellorCandidateId: null,
        lastElectedPresidentId: null,
        lastElectedChancellorId: null,
        termLimitedIds: [],
        votedIds: [],
        lastVotes: null,
        vetoUnlocked: false,
        vetoRejectedThisSession: false,
        inSpecialElection: false,
        currentPower: null,
        pendingPowerReveal: null,
        log: [],
        winner: null,
        winReason: null,
        revealedRoles: null,
        fascistTrack: [],
        nightConfirmedIds: [],
        youAreUp: playerId === this.hostId,
      };
    }

    return {
      roomCode: this.code,
      testMode: this.testMode,
      players,
      ...getPublicGameFields(this.game, playerId),
    };
  }
}

export { GameError };
