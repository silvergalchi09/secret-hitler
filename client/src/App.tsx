import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientSnapshot, GameAction } from "@shared/types";
import { playTurnAlert } from "./audio";
import { Home } from "./Home";
import { Lobby } from "./Lobby";
import { GameTable } from "./GameTable";

const NICK_KEY = "fh_nickname";
const PLAYER_KEY = "fh_playerId";
const ROOM_KEY = "fh_roomCode";

function loadSaved() {
  return {
    nickname: localStorage.getItem(NICK_KEY) ?? "",
    playerId: localStorage.getItem(PLAYER_KEY) ?? "",
    roomCode: localStorage.getItem(ROOM_KEY) ?? "",
  };
}

export function App() {
  const socketRef = useRef<Socket | null>(null);
  const [nickname, setNickname] = useState(loadSaved().nickname);
  const [snapshot, setSnapshot] = useState<ClientSnapshot | null>(null);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const wasUp = useRef(false);

  const bindSocket = (socket: Socket) => {
    socket.on("state", (next: ClientSnapshot) => {
      setSnapshot(next);
      setConnecting(false);
      setError("");
      localStorage.setItem(PLAYER_KEY, next.privateState.playerId);
      localStorage.setItem(ROOM_KEY, next.publicState.roomCode);
    });
    socket.on("joined", ({ playerId: id, roomCode }: { playerId: string; roomCode: string }) => {
      localStorage.setItem(PLAYER_KEY, id);
      localStorage.setItem(ROOM_KEY, roomCode);
    });
    socket.on("errorMessage", (message: string) => {
      setError(message);
      setConnecting(false);
      if (message.includes("방을 찾을 수 없습니다")) {
        localStorage.removeItem(PLAYER_KEY);
        localStorage.removeItem(ROOM_KEY);
      }
    });
  };

  useEffect(() => {
    const socket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;
    bindSocket(socket);

    const saved = loadSaved();
    if (saved.roomCode && saved.playerId && saved.nickname) {
      setConnecting(true);
      socket.emit("join", {
        roomCode: saved.roomCode,
        nickname: saved.nickname,
        playerId: saved.playerId,
      });
    }

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const up = snapshot?.publicState.youAreUp;
    if (up && !wasUp.current) {
      playTurnAlert();
    }
    wasUp.current = Boolean(up);
  }, [snapshot?.publicState.youAreUp, snapshot?.publicState.phase]);

  const send = (action: GameAction) => {
    socketRef.current?.emit("action", action);
  };

  const createRoom = () => {
    const name = nickname.trim();
    if (name.length < 1) return;
    localStorage.setItem(NICK_KEY, name);
    setError("");
    setConnecting(true);
    socketRef.current?.emit("create", { nickname: name });
  };

  const joinRoom = (roomCode: string) => {
    const name = nickname.trim();
    if (name.length < 1) return;
    localStorage.setItem(NICK_KEY, name);
    setError("");
    setConnecting(true);
    socketRef.current?.emit("join", { roomCode: roomCode.trim().toUpperCase(), nickname: name });
  };

  const startTest = (playerCount: number) => {
    const name = nickname.trim();
    if (name.length < 1) return;
    localStorage.setItem(NICK_KEY, name);
    setError("");
    setConnecting(true);
    socketRef.current?.emit("createTest", { nickname: name, playerCount });
  };

  const leave = () => {
    localStorage.removeItem(PLAYER_KEY);
    localStorage.removeItem(ROOM_KEY);
    setSnapshot(null);
    socketRef.current?.disconnect();
    const socket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;
    bindSocket(socket);
  };

  const inGame = snapshot && snapshot.publicState.phase !== "lobby";
  const title = useMemo(() => {
    if (!snapshot) return "시크릿 히틀러";
    return `시크릿 히틀러 · ${snapshot.publicState.roomCode}`;
  }, [snapshot]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <>
      {!snapshot ? (
        <Home
          nickname={nickname}
          setNickname={setNickname}
          error={error}
          connecting={connecting}
          onCreate={createRoom}
          onJoin={joinRoom}
          onTest={startTest}
        />
      ) : snapshot.publicState.phase === "lobby" ? (
        <Lobby
          snapshot={snapshot}
          error={error}
          onStart={() => send({ type: "startGame" })}
          onLeave={leave}
        />
      ) : (
        <GameTable
          snapshot={snapshot}
          error={error}
          onAction={send}
          onLeave={inGame && snapshot.publicState.phase === "gameOver" ? leave : undefined}
        />
      )}
      <footer className="credits">
        Secret Hitler by Mike Boxleiter, Tommy Maranges, and Mac Schubert. Licensed under{" "}
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">
          CC BY-NC-SA 4.0
        </a>
        .{" "}
        <a href="https://www.secrethitler.com/" target="_blank" rel="noreferrer">
          secrethitler.com
        </a>
        <br />
        이 웹판은 친구들과 비영리로 플레이하기 위한 디지털 적응입니다. 토론은 디스코드에서 하세요.
      </footer>
    </>
  );
}
