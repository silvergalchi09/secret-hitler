import { MIN_PLAYERS, MAX_PLAYERS } from "@shared/rules";
import type { ClientSnapshot } from "@shared/types";

interface LobbyProps {
  snapshot: ClientSnapshot;
  error: string;
  onStart: () => void;
  onLeave: () => void;
}

export function Lobby({ snapshot, error, onStart, onLeave }: LobbyProps) {
  const { publicState, privateState } = snapshot;
  const me = publicState.players.find((p) => p.id === privateState.playerId);
  const connected = publicState.players.filter((p) => p.connected).length;
  const canStart = Boolean(me?.isHost) && connected >= MIN_PLAYERS && connected <= MAX_PLAYERS;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicState.roomCode);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="brand">시크릿 히틀러</div>
          <div className="pill">
            방 코드 <b>{publicState.roomCode}</b>
            <button className="btn ghost" onClick={copy}>
              복사
            </button>
          </div>
        </div>
        <button className="btn ghost" onClick={onLeave}>
          나가기
        </button>
      </div>
      <p className="hint">
        {MIN_PLAYERS}~{MAX_PLAYERS}명이 모이면 호스트가 시작할 수 있습니다. 자리 순서가 시계 방향입니다.
        지금은 {connected}명 접속 중.
        {publicState.testMode ? " 테스트 모드입니다. 봇은 자동으로 둡니다." : ""}
      </p>
      <ul className="lobby-list">
        {publicState.players.map((p, i) => (
          <li key={p.id}>
            <span>
              {i + 1}. {p.nickname}
              {p.id === privateState.playerId ? " (나)" : ""}
              {p.isHost ? " · 호스트" : ""}
              {p.isBot ? " · 봇" : ""}
            </span>
            <span>{p.connected ? "접속" : "끊김"}</span>
          </li>
        ))}
      </ul>
      {error ? <p className="error">{error}</p> : null}
      {me?.isHost ? (
        <p>
          <button className="btn primary" disabled={!canStart} onClick={onStart}>
            게임 시작
          </button>
        </p>
      ) : (
        <p className="hint">호스트가 시작하기를 기다리는 중입니다.</p>
      )}
    </div>
  );
}
