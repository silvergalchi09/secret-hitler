import { useState } from "react";
import { MAX_PLAYERS, MIN_PLAYERS } from "@shared/rules";

interface HomeProps {
  nickname: string;
  setNickname: (value: string) => void;
  error: string;
  connecting: boolean;
  onCreate: () => void;
  onJoin: (roomCode: string) => void;
  onTest: (playerCount: number) => void;
}

export function Home({
  nickname,
  setNickname,
  error,
  connecting,
  onCreate,
  onJoin,
  onTest,
}: HomeProps) {
  const [code, setCode] = useState("");
  const [playerCount, setPlayerCount] = useState(5);

  return (
    <div className="page home">
      <div className="brand">FIND HITLER</div>
      <h1>시크릿 히틀러</h1>
      <p className="sub">
        규칙은 보드게임 그대로입니다. 웹에서는 보드와 비밀 카드만 보고, 목소리는 디스코드로 하세요.
      </p>
      <div className="card-panel">
        <label>
          닉네임
          <input
            maxLength={12}
            value={nickname}
            placeholder="1~12자"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={connecting || !nickname.trim()} onClick={onCreate}>
          방 만들기
        </button>
        <label>
          방 코드
          <input
            maxLength={6}
            value={code}
            placeholder="예: 7K2NPD"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <button
          className="btn"
          disabled={connecting || !nickname.trim() || code.trim().length < 6}
          onClick={() => onJoin(code)}
        >
          참가하기
        </button>
        {error ? <div className="error">{error}</div> : null}
        {connecting ? <div className="hint">연결 중…</div> : null}
      </div>

      <div className="card-panel test-panel">
        <h2>테스트 모드</h2>
        <p className="hint">
          혼자 규칙을 확인할 수 있습니다. 나머지 자리는 봇이 채우고, 당신 차례가 아니면 자동으로 둡니다.
        </p>
        <label>
          인원 (나 + 봇)
          <div className="count-pills">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map(
              (n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn${playerCount === n ? " primary" : ""}`}
                  onClick={() => setPlayerCount(n)}
                >
                  {n}인
                </button>
              ),
            )}
          </div>
        </label>
        <button
          className="btn liberal"
          disabled={connecting || !nickname.trim()}
          onClick={() => onTest(playerCount)}
        >
          봇 {playerCount - 1}명과 테스트 시작
        </button>
      </div>
    </div>
  );
}
