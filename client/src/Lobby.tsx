import { MIN_PLAYERS, MAX_PLAYERS } from "@shared/rules";
import type { ClientSnapshot, GameAction } from "@shared/types";

interface LobbyProps {
  snapshot: ClientSnapshot;
  error: string;
  onStart: () => void;
  onLeave: () => void;
  onAction: (action: GameAction) => void;
}

export function Lobby({ snapshot, error, onStart, onLeave, onAction }: LobbyProps) {
  const { publicState, privateState } = snapshot;
  const me = publicState.players.find((p) => p.id === privateState.playerId);
  const connected = publicState.players.filter((p) => p.connected).length;
  const botCount = publicState.players.filter((p) => p.isBot).length;
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
        {MIN_PLAYERS}~{MAX_PLAYERS}명이 모이면 시작할 수 있습니다. 자리 순서가 시계 방향입니다.
        지금은 {connected}명 접속 중 (사람 {connected - botCount} · 봇 {botCount}).
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
            <span>
              {p.connected ? "접속" : "끊김"}
              {p.isBot ? (
                <>
                  {" "}
                  <button
                    className="btn ghost"
                    onClick={() => onAction({ type: "removeBot", playerId: p.id })}
                  >
                    빼기
                  </button>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="card-panel" style={{ width: "100%", marginTop: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>게임 규칙</h2>
        <p className="hint">
          {publicState.expansion === "mastermind"
            ? "마스터 마인드: 자유당원 한 장과 마스터 마인드를 섞어 한 장만 넣습니다. 제3세력은 모두의 정체를 알고, 자유 4장 이후 파시 5장(암살되지 않은 채)이거나, 파시 5장이 먼저면 본인이 수상으로 자유 4장을 통과시켜야 이깁니다."
            : "기본판: 자유 정책 5장 또는 히틀러 처형이면 자유당, 파시스트 정책 6장 또는 파시 3장 이후 히틀러 수상이면 파시스트 승리입니다."}
        </p>
        <div className="row">
          <button
            className={`btn${publicState.expansion === "base" ? " primary" : ""}`}
            disabled={!me?.isHost}
            onClick={() => onAction({ type: "setExpansion", expansion: "base" })}
          >
            기본판
          </button>
          <button
            className={`btn${publicState.expansion === "mastermind" ? " primary" : ""}`}
            disabled={!me?.isHost}
            onClick={() => onAction({ type: "setExpansion", expansion: "mastermind" })}
          >
            마스터 마인드
          </button>
        </div>
        {me?.isHost ? null : <p className="hint">호스트가 기본판/확장판을 고릅니다.</p>}
      </div>

      <div className="card-panel" style={{ width: "100%", marginTop: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>봇으로 자리 채우기</h2>
        <p className="hint">인원이 부족하면 봇을 넣으세요. 봇은 자동으로 둡니다. 친구가 들어오면 봇 한 명이 빠질 수 있습니다.</p>
        <div className="row">
          <button
            className="btn liberal"
            disabled={connected >= MAX_PLAYERS}
            onClick={() => onAction({ type: "addBot" })}
          >
            봇 추가
          </button>
          <button
            className="btn ghost"
            disabled={botCount === 0}
            onClick={() => onAction({ type: "removeBot" })}
          >
            봇 빼기
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {me?.isHost ? (
        <p>
          <button className="btn primary" disabled={!canStart} onClick={onStart}>
            게임 시작
          </button>
        </p>
      ) : (
        <p className="hint">호스트가 시작하기를 기다리는 중입니다. 봇은 누구나 넣고 뺄 수 있습니다.</p>
      )}
    </div>
  );
}
