import { useState, type ReactNode } from "react";
import {
  PARTY_NAME,
  PHASE_TITLE,
  POLICY_NAME,
  POWER_NAME,
  ROLE_NAME,
} from "@shared/rules";
import type {
  ClientSnapshot,
  GameAction,
  Policy,
  PresidentialPower,
  PublicPlayer,
  Role,
} from "@shared/types";

import { NotesPad } from "./NotesPad";

interface GameTableProps {
  snapshot: ClientSnapshot;
  error: string;
  onAction: (action: GameAction) => void;
  onLeave?: () => void;
}

const POWER_ICON: Record<PresidentialPower, string> = {
  investigate: "🔍 소속 확인",
  specialElection: "🎖 특별 선거",
  policyPeek: "📚 훔쳐보기",
  execution: "🔫 처형",
};

export function GameTable({ snapshot, error, onAction, onLeave }: GameTableProps) {
  const { publicState: pub, privateState: priv } = snapshot;
  const me = pub.players.find((p) => p.id === priv.playerId);
  const nameOfPlayer = (id: string | null) =>
    pub.players.find((p) => p.id === id)?.nickname ?? "—";

  return (
    <div className="page table-page">
      <div className="table-layout">
        <div className="table-main">
      <div className="topbar">
        <div>
          <div className="brand">시크릿 히틀러</div>
          <div className="pill">방 {pub.roomCode}</div>
          {pub.testMode ? <div className="pill">테스트 모드</div> : null}
          {pub.expansion === "mastermind" ? <div className="pill">마스터 마인드</div> : null}
        </div>
        <div className="pill">
          덱 {pub.drawPileCount} · 버림 {pub.discardPileCount}
          {pub.vetoUnlocked ? " · 거부권 해금" : ""}
        </div>
      </div>

      <div className={`phase-banner${pub.youAreUp ? " alert" : ""}`}>
        <b>{PHASE_TITLE[pub.phase] ?? pub.phase}</b>
        {pub.youAreUp
          ? " · 당신 차례입니다"
          : pub.players.some((p) => p.isBot)
            ? " · 봇이 수를 두는 중…"
            : " · 디스코드에서 토론하세요"}
        {pub.inSpecialElection ? " · 특별 선거" : ""}
        {pub.presidentialCandidateId ? ` · 대통령 ${nameOfPlayer(pub.presidentialCandidateId)}` : ""}
        {pub.chancellorCandidateId ? ` / 수상 ${nameOfPlayer(pub.chancellorCandidateId)}` : ""}
      </div>

      <Tracks pub={pub} />

      <div className="tracker">
        선거 추적
        {[0, 1, 2].map((i) => (
          <span key={i} className={`dot${pub.electionTracker > i ? " on" : ""}`} />
        ))}
        {pub.electionTracker}/3
      </div>

      <div className="seats">
        {pub.playerOrder.map((id) => {
          const p = pub.players.find((x) => x.id === id);
          if (!p) return null;
          return <Seat key={id} player={p} pub={pub} selfId={priv.playerId} revealed={pub.revealedRoles?.[id]} />;
        })}
      </div>

      {priv.role && pub.phase !== "night" ? (
        <div className="secret">
          내 역할: {ROLE_NAME[priv.role]} ({PARTY_NAME[priv.party ?? "liberal"]})
        </div>
      ) : null}

      <ul className="log">
        {[...pub.log].reverse().map((entry) => (
          <li key={entry.id}>{entry.text}</li>
        ))}
      </ul>

      {error ? <p className="error">{error}</p> : null}

      <ActionOverlay snapshot={snapshot} onAction={onAction} onLeave={onLeave} me={me} />
        </div>
        <NotesPad
          roomCode={pub.roomCode}
          selfId={priv.playerId}
          players={pub.players}
          playerOrder={pub.playerOrder}
          expansion={pub.expansion}
          role={priv.role}
          nightInfo={priv.nightInfo}
          investigationResult={priv.investigationResult}
        />
      </div>
    </div>
  );
}

function Tracks({ pub }: { pub: ClientSnapshot["publicState"] }) {
  return (
    <div className="tracks">
      <div className="track liberal">
        <h3>자유주의 정책 {pub.liberalPolicies}/5</h3>
        <div className="slots">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`slot${i < pub.liberalPolicies ? " filled liberal" : ""}`}>
              {i === 4 ? "자유 승리" : `${i + 1}`}
            </div>
          ))}
        </div>
      </div>
      <div className="track fascist">
        <h3>파시스트 정책 {pub.fascistPolicies}/6</h3>
        <div className="slots">
          {Array.from({ length: 6 }, (_, i) => {
            const power = pub.fascistTrack[i];
            const filled = i < pub.fascistPolicies;
            let label = `${i + 1}`;
            if (i === 5) label = "파시 승리";
            else if (power) label = POWER_ICON[power];
            if (i === 4) label = `${power ? POWER_ICON[power] : ""} · 거부권`;
            return (
              <div key={i} className={`slot${filled ? " filled fascist" : ""}`}>
                {label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Seat({
  player,
  pub,
  selfId,
  revealed,
}: {
  player: PublicPlayer;
  pub: ClientSnapshot["publicState"];
  selfId: string;
  revealed?: Role;
}) {
  const isPresNow = player.id === pub.presidentialCandidateId;
  const isChan = player.id === pub.chancellorCandidateId;
  const limited = pub.termLimitedIds.includes(player.id);
  const voted = pub.votedIds.includes(player.id);
  const lastVote = pub.lastVotes?.[player.id];

  return (
    <article
      className={`seat${player.id === selfId ? " self" : ""}${player.alive ? "" : " dead"}${
        player.connected ? "" : " offline"
      }`}
    >
      <div className="name">{player.nickname}</div>
      <div className="hint">
        {!player.alive ? "처형됨" : player.connected ? "" : "연결 끊김"}
        {revealed ? ` · ${ROLE_NAME[revealed]}` : ""}
      </div>
      <div className="badges">
        {isPresNow ? <span className="badge pres">대통령</span> : null}
        {isChan ? <span className="badge chan">수상</span> : null}
        {limited ? <span className="badge">연임 제한</span> : null}
        {player.investigated ? <span className="badge">조사됨</span> : null}
        {pub.phase === "vote" && voted ? <span className="badge">투표함</span> : null}
        {lastVote === "ja" ? <span className="badge ja">Ja</span> : null}
        {lastVote === "nein" ? <span className="badge nein">Nein</span> : null}
        {player.isHost ? <span className="badge">호스트</span> : null}
        {player.isBot ? <span className="badge">봇</span> : null}
      </div>
    </article>
  );
}

function ActionOverlay({
  snapshot,
  onAction,
  onLeave,
  me,
}: {
  snapshot: ClientSnapshot;
  onAction: (action: GameAction) => void;
  onLeave?: () => void;
  me?: PublicPlayer;
}) {
  const { publicState: pub, privateState: priv } = snapshot;
  const aliveOthers = pub.players.filter((p) => p.alive && p.id !== priv.playerId);

  if (pub.phase === "night") {
    const confirmed = pub.nightConfirmedIds.includes(priv.playerId);
    return (
      <div className="overlay">
        <div className="overlay-card">
          <h2>역할 확인</h2>
          <p className="hint">이 화면은 본인만 봅니다. 확인한 뒤 폰을 내려놓고 디스코드에서 이야기하세요.</p>
          {priv.role ? <RoleCard role={priv.role} /> : null}
          {priv.nightInfo ? (
            <div className="secret">
              {priv.nightInfo.teammates.length ? (
                <div>
                  {priv.nightInfo.seesEveryone ? "전원 역할: " : "동료: "}
                  {priv.nightInfo.teammates
                    .map((t) => `${nameOf(pub, t.id)} (${ROLE_NAME[t.role]})`)
                    .join(", ")}
                </div>
              ) : null}
              {priv.nightInfo.seesHitler && priv.nightInfo.hitlerId && !priv.nightInfo.seesEveryone ? (
                <div>히틀러: {nameOf(pub, priv.nightInfo.hitlerId)}</div>
              ) : null}
              {priv.nightInfo.seesEveryone ? <div>당신은 모든 플레이어의 정체를 압니다.</div> : null}
            </div>
          ) : priv.role === "hitler" && pub.players.filter((p) => p.alive).length >= 7 ? (
            <div className="secret">당신은 히틀러입니다. 동료 파시스트는 표시되지 않습니다.</div>
          ) : null}
          {confirmed ? (
            <p className="hint">확인했습니다. 다른 플레이어를 기다리는 중…</p>
          ) : (
            <button className="btn primary" onClick={() => onAction({ type: "confirmNight" })}>
              확인
            </button>
          )}
        </div>
      </div>
    );
  }

  if (pub.phase === "nominate" && pub.youAreUp) {
    const eligible = pub.players.filter(
      (p) =>
        p.alive &&
        p.id !== pub.presidentialCandidateId &&
        !pub.termLimitedIds.includes(p.id),
    );
    return (
      <PickPlayer
        title="수상 지명"
        hint="연임 제한에 걸린 사람은 수상이 될 수 없습니다. 디스코드에서 의견을 들은 뒤 지명하세요."
        players={eligible}
        confirmLabel="지명"
        onPick={(playerId) => onAction({ type: "nominate", playerId })}
      />
    );
  }

  if (pub.phase === "vote" && pub.youAreUp) {
    return (
      <div className="overlay">
        <div className="overlay-card">
          <h2>내각 투표</h2>
          <p className="hint">
            대통령 {nameOf(pub, pub.presidentialCandidateId)} / 수상 {nameOf(pub, pub.chancellorCandidateId)}.
            전원 제출 후 동시에 공개됩니다.
          </p>
          <div className="row">
            <button className="btn liberal" onClick={() => onAction({ type: "vote", choice: "ja" })}>
              Ja!
            </button>
            <button className="btn fascist" onClick={() => onAction({ type: "vote", choice: "nein" })}>
              Nein!
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pub.phase === "presidentDiscard" && pub.youAreUp && priv.policyHand) {
    return (
      <PolicyPicker
        title="정책 1장 버리기"
        hint="대통령은 3장 중 1장을 버리고 나머지 2장을 수상에게 넘깁니다. 버린 카드는 공개되지 않습니다. (원작에선 입법 중 침묵)"
        cards={priv.policyHand}
        confirmLabel="이 카드 버리기"
        onConfirm={(index) => onAction({ type: "discardPolicy", index })}
      />
    );
  }

  if (pub.phase === "chancellorEnact" && pub.youAreUp && priv.policyHand) {
    return (
      <PolicyPicker
        title="정책 발효"
        hint="수상은 2장 중 1장을 발효합니다. 나머지 1장은 공개되지 않고 버려집니다."
        cards={priv.policyHand}
        confirmLabel="이 정책 발효"
        extra={
          pub.vetoUnlocked && !pub.vetoRejectedThisSession ? (
            <button className="btn ghost" onClick={() => onAction({ type: "requestVeto" })}>
              거부권 제안
            </button>
          ) : null
        }
        onConfirm={(index) => onAction({ type: "enactPolicy", index })}
      />
    );
  }

  if (pub.phase === "vetoConfirm" && pub.youAreUp) {
    return (
      <div className="overlay">
        <div className="overlay-card">
          <h2>거부권</h2>
          <p className="hint">수상이 이번 안건을 거부하자고 합니다. 동의하면 두 장 모두 버려지고 선거 추적이 1 증가합니다.</p>
          <div className="row">
            <button className="btn primary" onClick={() => onAction({ type: "vetoResponse", agree: true })}>
              거부 동의
            </button>
            <button className="btn fascist" onClick={() => onAction({ type: "vetoResponse", agree: false })}>
              거절 (발효 강제)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pub.phase === "presidentialPower" && pub.youAreUp) {
    if (pub.pendingPowerReveal === "peek" && priv.peekedPolicies) {
      return (
        <div className="overlay">
          <div className="overlay-card">
            <h2>정책 훔쳐보기</h2>
            <p className="hint">덱 맨 위 3장입니다. 순서는 바뀌지 않습니다. 이 정보는 당신만 봅니다.</p>
            <div className="policy-row">
              {priv.peekedPolicies.map((card, i) => (
                <div key={i} className={`policy ${card}`}>
                  {POLICY_NAME[card]}
                </div>
              ))}
            </div>
            <button className="btn primary" onClick={() => onAction({ type: "acknowledgePower" })}>
              확인
            </button>
          </div>
        </div>
      );
    }
    if (pub.pendingPowerReveal === "investigate" && priv.investigationResult) {
      return (
        <div className="overlay">
          <div className="overlay-card">
            <h2>소속 확인 결과</h2>
            <p>
              {nameOf(pub, priv.investigationResult.playerId)}의 당적은{" "}
              <b>{PARTY_NAME[priv.investigationResult.party]}</b>입니다.
            </p>
            <p className="hint">히틀러인지 여부는 알 수 없습니다. 이 결과는 당신만 봅니다.</p>
            <button className="btn primary" onClick={() => onAction({ type: "acknowledgePower" })}>
              확인
            </button>
          </div>
        </div>
      );
    }

    const power = pub.currentPower;
    if (power === "policyPeek") {
      return (
        <div className="overlay">
          <div className="overlay-card">
            <h2>정책 훔쳐보기</h2>
            <p className="hint">대통령 권한은 반드시 사용해야 합니다.</p>
            <button className="btn primary" onClick={() => onAction({ type: "usePower" })}>
              윗장 3장 보기
            </button>
          </div>
        </div>
      );
    }
    if (power === "investigate") {
      const targets = aliveOthers.filter((p) => !p.investigated);
      return (
        <PickPlayer
          title="소속 확인"
          hint="한 명의 당적(자유당/파시스트)만 봅니다. 이미 조사한 사람은 다시 조사할 수 없습니다."
          players={targets}
          confirmLabel="조사"
          onPick={(playerId) => onAction({ type: "usePower", targetId: playerId })}
        />
      );
    }
    if (power === "specialElection") {
      return (
        <PickPlayer
          title="특별 선거"
          hint="다음 대통령 후보를 지정합니다. 이 한 턴이 끝나면 대통령직은 특별 선거를 발동한 당신 다음 순서로 돌아갑니다."
          players={aliveOthers}
          confirmLabel="지정"
          onPick={(playerId) => onAction({ type: "usePower", targetId: playerId })}
        />
      );
    }
    if (power === "execution") {
      return (
        <PickPlayer
          title="처형"
          hint="처형된 사람이 히틀러가 아니면 소속은 공개되지 않습니다. 히틀러면 자유당이 즉시 승리합니다."
          players={aliveOthers}
          confirmLabel="처형"
          danger
          onPick={(playerId) => onAction({ type: "usePower", targetId: playerId })}
        />
      );
    }
  }

  if (pub.phase === "gameOver") {
    return (
      <div className="overlay">
        <div className="overlay-card">
          <h2>
            {pub.winner === "liberal"
              ? "자유당 승리"
              : pub.winner === "fascist"
                ? "파시스트 승리"
                : "마스터 마인드 승리"}
          </h2>
          <p>{pub.winReason}</p>
          <ul className="lobby-list">
            {pub.playerOrder.map((id) => {
              const p = pub.players.find((x) => x.id === id);
              const role = pub.revealedRoles?.[id];
              return (
                <li key={id}>
                  <span>{p?.nickname}</span>
                  <span>{role ? ROLE_NAME[role] : ""}</span>
                </li>
              );
            })}
          </ul>
          <div className="row">
            {me?.isHost ? (
              <button className="btn primary" onClick={() => onAction({ type: "restart" })}>
                로비로
              </button>
            ) : (
              <p className="hint">호스트가 로비로 돌아가기를 기다리는 중…</p>
            )}
            {onLeave ? (
              <button className="btn ghost" onClick={onLeave}>
                나가기
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function nameOf(pub: ClientSnapshot["publicState"], id: string | null): string {
  return pub.players.find((p) => p.id === id)?.nickname ?? "—";
}

function RoleCard({ role }: { role: Role }) {
  return (
    <div className={`role-card ${role}`}>
      <div className="hint">
        {role === "liberal" ? "자유당" : role === "mastermind" ? "제3세력" : "파시스트"}
      </div>
      <h3>{ROLE_NAME[role]}</h3>
    </div>
  );
}

function PickPlayer({
  title,
  hint,
  players,
  confirmLabel,
  onPick,
  danger,
}: {
  title: string;
  hint: string;
  players: PublicPlayer[];
  confirmLabel: string;
  onPick: (playerId: string) => void;
  danger?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="overlay">
      <div className="overlay-card">
        <h2>{title}</h2>
        <p className="hint">{hint}</p>
        <div className="row">
          {players.map((p) => (
            <button
              key={p.id}
              className={`btn${selected === p.id ? " primary" : ""}`}
              onClick={() => setSelected(p.id)}
            >
              {p.nickname}
            </button>
          ))}
        </div>
        <p>
          <button
            className={`btn ${danger ? "fascist" : "primary"}`}
            disabled={!selected}
            onClick={() => selected && onPick(selected)}
          >
            {confirmLabel}
          </button>
        </p>
        {players.length === 0 ? <p className="error">선택할 수 있는 사람이 없습니다.</p> : null}
      </div>
    </div>
  );
}

function PolicyPicker({
  title,
  hint,
  cards,
  confirmLabel,
  onConfirm,
  extra,
}: {
  title: string;
  hint: string;
  cards: Policy[];
  confirmLabel: string;
  onConfirm: (index: number) => void;
  extra?: ReactNode;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className="overlay">
      <div className="overlay-card">
        <h2>{title}</h2>
        <p className="hint">{hint}</p>
        <div className="policy-row">
          {cards.map((card, i) => (
            <button
              key={`${card}-${i}`}
              className={`policy ${card}${selected === i ? " selected" : ""}`}
              onClick={() => setSelected(i)}
            >
              {POLICY_NAME[card]}
            </button>
          ))}
        </div>
        <div className="row">
          <button
            className="btn primary"
            disabled={selected === null}
            onClick={() => selected !== null && onConfirm(selected)}
          >
            {confirmLabel}
          </button>
          {extra}
        </div>
      </div>
    </div>
  );
}
