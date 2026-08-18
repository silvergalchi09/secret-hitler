import { useEffect, useState, type ReactNode } from "react";
import {
  PARTY_NAME,
  PHASE_TITLE,
  POLICY_NAME,
  ROLE_NAME,
} from "@shared/rules";
import type {
  ClientSnapshot,
  GameAction,
  Policy,
  PublicPlayer,
  Role,
} from "@shared/types";

import { NotesPad } from "./NotesPad";
import { TableScene } from "./TableScene";

interface GameTableProps {
  snapshot: ClientSnapshot;
  error: string;
  onAction: (action: GameAction) => void;
  onLeave?: () => void;
}

export function GameTable({ snapshot, error, onAction, onLeave }: GameTableProps) {
  const { publicState: pub, privateState: priv } = snapshot;
  const me = pub.players.find((p) => p.id === priv.playerId);
  const nameOfPlayer = (id: string | null) =>
    pub.players.find((p) => p.id === id)?.nickname ?? "—";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectableIds = selectablePlayerIds(snapshot);

  useEffect(() => {
    setSelectedId(null);
  }, [pub.phase, pub.discussionHold, pub.currentPower, pub.chancellorCandidateId]);

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
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <div className="pill">
                {pub.vetoUnlocked ? "거부권 해금" : `덱 ${pub.drawPileCount}`}
              </div>
              {onLeave ? (
                <button
                  className="btn ghost"
                  onClick={() => {
                    if (window.confirm("게임을 나가 홈으로 돌아갈까요?")) onLeave();
                  }}
                >
                  나가기
                </button>
              ) : null}
            </div>
          </div>

          <div className={`phase-banner${pub.youAreUp ? " alert" : ""}`}>
            <b>{PHASE_TITLE[pub.phase] ?? pub.phase}</b>
            {pub.discussionHold
              ? " · 디스코드에서 논의하세요"
              : pub.youAreUp
                ? " · 당신 차례입니다"
                : pub.players.some((p) => p.isBot)
                  ? " · 봇이 수를 두는 중…"
                  : " · 테이블을 보며 대기하세요"}
            {pub.inSpecialElection ? " · 특별 선거" : ""}
            {pub.presidentialCandidateId
              ? ` · 대통령 ${nameOfPlayer(pub.presidentialCandidateId)}`
              : ""}
            {pub.chancellorCandidateId
              ? ` / 수상 ${nameOfPlayer(pub.chancellorCandidateId)}`
              : ""}
          </div>

          <TableScene
            snapshot={snapshot}
            selectableIds={selectableIds}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <ActionDock
            snapshot={snapshot}
            me={me}
            selectedId={selectedId}
            selectableIds={selectableIds}
            onAction={onAction}
          />

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

          <SecretOverlay snapshot={snapshot} onAction={onAction} onLeave={onLeave} me={me} />
        </div>
        <NotesPad
          roomCode={pub.roomCode}
          selfId={priv.playerId}
          players={pub.players}
          playerOrder={pub.playerOrder}
          expansion={pub.expansion}
          phase={pub.phase}
          role={priv.role}
          nightInfo={priv.nightInfo}
          investigationResult={priv.investigationResult}
        />
      </div>
    </div>
  );
}

function selectablePlayerIds(snapshot: ClientSnapshot): string[] {
  const { publicState: pub, privateState: priv } = snapshot;
  if (pub.discussionHold || !pub.youAreUp) return [];
  if (pub.phase === "nominate") {
    return pub.players
      .filter(
        (p) =>
          p.alive &&
          p.id !== pub.presidentialCandidateId &&
          !pub.termLimitedIds.includes(p.id),
      )
      .map((p) => p.id);
  }
  if (pub.phase === "presidentialPower" && !pub.pendingPowerReveal) {
    const others = pub.players.filter((p) => p.alive && p.id !== priv.playerId);
    if (pub.currentPower === "investigate") {
      return others.filter((p) => !p.investigated).map((p) => p.id);
    }
    if (pub.currentPower === "specialElection" || pub.currentPower === "execution") {
      return others.map((p) => p.id);
    }
  }
  return [];
}

function advanceLabel(pub: ClientSnapshot["publicState"]): string {
  if (pub.phase === "nominate") {
    return pub.inSpecialElection ? "특별 선거 · 수상 지명 시작" : "수상 지명 시작";
  }
  if (pub.phase === "vote") return "내각 투표 시작";
  if (pub.currentPower === "execution") return "처형 대상 선택 시작";
  if (pub.currentPower === "investigate") return "소속 확인 시작";
  if (pub.currentPower === "specialElection") return "다음 대통령 지정 시작";
  return "다음 단계로";
}

function ActionDock({
  snapshot,
  me,
  selectedId,
  selectableIds,
  onAction,
}: {
  snapshot: ClientSnapshot;
  me?: PublicPlayer;
  selectedId: string | null;
  selectableIds: string[];
  onAction: (action: GameAction) => void;
}) {
  const { publicState: pub } = snapshot;
  const selected = pub.players.find((p) => p.id === selectedId);

  if (pub.phase === "gameOver" || pub.phase === "night") return null;

  if (pub.discussionHold) {
    return (
      <div className="action-dock">
        <p className="hint">
          바로 선택·투표하지 않습니다. 디스코드에서 논의한 뒤, 호스트만 다음 단계로 넘길 수 있습니다.
        </p>
        {me?.isHost ? (
          <button className="btn primary" onClick={() => onAction({ type: "advanceDiscussion" })}>
            {advanceLabel(pub)}
          </button>
        ) : (
          <p className="hint">호스트가 진행하기를 기다리는 중…</p>
        )}
      </div>
    );
  }

  if (pub.phase === "vote" && pub.youAreUp) {
    return (
      <div className="action-dock">
        <p className="hint">테이블을 보며 Ja / Nein을 선택하세요. 전원 제출 후 동시에 공개됩니다.</p>
        <div className="row">
          <button className="btn liberal" onClick={() => onAction({ type: "vote", choice: "ja" })}>
            Ja!
          </button>
          <button className="btn fascist" onClick={() => onAction({ type: "vote", choice: "nein" })}>
            Nein!
          </button>
        </div>
      </div>
    );
  }

  if (pub.phase === "nominate" && pub.youAreUp) {
    return (
      <div className="action-dock">
        <p className="hint">연임 제한(빨간 윤곽선)인 사람은 수상이 될 수 없습니다. 플레이어를 클릭해 지명하세요.</p>
        <button
          className="btn primary"
          disabled={!selectedId || !selectableIds.includes(selectedId)}
          onClick={() => selectedId && onAction({ type: "nominate", playerId: selectedId })}
        >
          {selected ? `${selected.nickname} 수상 지명` : "플레이어를 선택하세요"}
        </button>
      </div>
    );
  }

  if (pub.phase === "presidentialPower" && pub.youAreUp && !pub.pendingPowerReveal) {
    const power = pub.currentPower;
    if (power === "investigate" || power === "specialElection" || power === "execution") {
      const label =
        power === "investigate" ? "소속 확인" : power === "specialElection" ? "다음 대통령 지정" : "처형";
      return (
        <div className="action-dock">
          <p className="hint">원형 테이블에 앉은 플레이어를 클릭해 대상을 고르세요.</p>
          <button
            className={`btn ${power === "execution" ? "fascist" : "primary"}`}
            disabled={!selectedId || !selectableIds.includes(selectedId)}
            onClick={() => selectedId && onAction({ type: "usePower", targetId: selectedId })}
          >
            {selected ? `${selected.nickname} ${label}` : "플레이어를 선택하세요"}
          </button>
        </div>
      );
    }
  }

  if (pub.youAreUp) return null;

  return (
    <div className="action-dock wait">
      <p className="hint">다른 플레이어의 행동을 기다리며 테이블을 보세요.</p>
    </div>
  );
}

function SecretOverlay({
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

  if (pub.phase === "presidentDiscard" && pub.youAreUp && priv.policyHand) {
    return (
      <PolicyPicker
        title="정책 1장 버리기"
        hint="대통령은 3장 중 1장을 버리고 나머지 2장을 수상에게 넘깁니다. 버린 카드는 공개되지 않습니다."
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
    if (pub.currentPower === "policyPeek" && !pub.pendingPowerReveal && !pub.discussionHold) {
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
