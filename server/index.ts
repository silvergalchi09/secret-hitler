import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createRoom, deleteRoomIfEmpty, GameError, getRoom } from "./room.ts";
import type { GameAction } from "../shared/types.ts";
import { MAX_PLAYERS, MIN_PLAYERS } from "../shared/rules.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === "production";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: isProd ? false : ["http://localhost:5173"] },
});

if (isProd) {
  const clientDir = path.join(__dirname, "../dist/client");
  app.use(express.static(clientDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });
} else {
  app.get("/health", (_req, res) => res.json({ ok: true }));
}

function broadcastRoom(code: string): void {
  const room = getRoom(code);
  if (!room) return;
  for (const player of room.players) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit("state", room.snapshot(player.id));
  }
}

const botTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleBots(code: string): void {
  const prev = botTimers.get(code);
  if (prev) clearTimeout(prev);
  const room = getRoom(code);
  if (!room?.needsBotAction()) return;
  const timer = setTimeout(() => {
    botTimers.delete(code);
    const current = getRoom(code);
    if (!current) return;
    try {
      if (current.playBotStep()) {
        broadcastRoom(code);
        scheduleBots(code);
      }
    } catch (err) {
      console.error(err);
    }
  }, 850);
  botTimers.set(code, timer);
}

io.on("connection", (socket) => {
  let roomCode: string | null = null;
  let playerId: string | null = null;

  socket.on("create", ({ nickname }: { nickname: string }) => {
    try {
      const name = (nickname ?? "").trim();
      if (name.length < 1 || name.length > 12) {
        throw new GameError("닉네임은 1~12자여야 합니다.");
      }
      const room = createRoom(name, socket.id);
      roomCode = room.code;
      playerId = room.players[0].id;
      socket.join(room.code);
      socket.emit("joined", { playerId, roomCode: room.code, host: true });
      broadcastRoom(room.code);
    } catch (err) {
      socket.emit("errorMessage", messageOf(err));
    }
  });

  socket.on(
    "createTest",
    ({ nickname, playerCount }: { nickname: string; playerCount?: number }) => {
      try {
        const name = (nickname ?? "").trim();
        if (name.length < 1 || name.length > 12) {
          throw new GameError("닉네임은 1~12자여야 합니다.");
        }
        const total = Math.min(
          MAX_PLAYERS,
          Math.max(MIN_PLAYERS, Math.floor(Number(playerCount) || MIN_PLAYERS)),
        );
        const room = createRoom(name, socket.id);
        room.testMode = true;
        room.addBots(total - 1);
        roomCode = room.code;
        playerId = room.players[0].id;
        socket.join(room.code);
        room.handleAction(playerId, { type: "startGame" });
        socket.emit("joined", { playerId, roomCode: room.code, host: true });
        broadcastRoom(room.code);
        scheduleBots(room.code);
      } catch (err) {
        socket.emit("errorMessage", messageOf(err));
      }
    },
  );

  socket.on(
    "join",
    ({
      roomCode: code,
      nickname,
      playerId: existingId,
    }: {
      roomCode: string;
      nickname: string;
      playerId?: string;
    }) => {
      try {
        const name = (nickname ?? "").trim();
        if (name.length < 1 || name.length > 12) {
          throw new GameError("닉네임은 1~12자여야 합니다.");
        }
        const room = getRoom((code ?? "").trim());
        if (!room) throw new GameError("방을 찾을 수 없습니다.");
        const player =
          existingId && room.playerById(existingId)
            ? room.reconnect(existingId, socket.id, name)
            : room.join(name, socket.id);
        roomCode = room.code;
        playerId = player.id;
        socket.join(room.code);
        socket.emit("joined", {
          playerId: player.id,
          roomCode: room.code,
          host: player.id === room.hostId,
        });
        broadcastRoom(room.code);
        scheduleBots(room.code);
      } catch (err) {
        socket.emit("errorMessage", messageOf(err));
      }
    },
  );

  socket.on("action", (action: GameAction) => {
    try {
      if (!roomCode || !playerId) throw new GameError("방에 입장하지 않았습니다.");
      const room = getRoom(roomCode);
      if (!room) throw new GameError("방이 사라졌습니다.");
      room.handleAction(playerId, action);
      broadcastRoom(room.code);
      scheduleBots(room.code);
    } catch (err) {
      socket.emit("errorMessage", messageOf(err));
    }
  });

  socket.on("disconnect", () => {
    if (!roomCode) return;
    const room = getRoom(roomCode);
    if (!room) return;
    room.disconnect(socket.id);
    if (!room.players.some((p) => p.connected && !p.isBot)) {
      setTimeout(() => deleteRoomIfEmpty(room.code), 60_000);
    } else {
      broadcastRoom(room.code);
    }
  });
});

function messageOf(err: unknown): string {
  if (err instanceof GameError) return err.message;
  console.error(err);
  return "알 수 없는 오류가 발생했습니다.";
}

httpServer.listen(PORT, () => {
  console.log(`Secret Hitler server listening on :${PORT}`);
});
