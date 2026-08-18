import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ROLE_NAME } from "@shared/rules";
import type { ClientSnapshot, PresidentialPower, PublicPlayer, Role } from "@shared/types";

const POWER_ICON: Record<PresidentialPower, string> = {
  investigate: "소속 확인",
  specialElection: "특별 선거",
  policyPeek: "훔쳐보기",
  execution: "처형",
};

interface SeatPos {
  left: number;
  top: number;
  scale: number;
}

interface Flight {
  key: number;
  kind: "president" | "chancellor";
  from: SeatPos;
  to: SeatPos;
}

const TABLE_CENTER: SeatPos = { left: 50, top: 48, scale: 1 };

interface TableSceneProps {
  snapshot: ClientSnapshot;
  selectableIds: string[];
  selectedId: string | null;
  onSelect: (playerId: string) => void;
}

function seatPosition(index: number, count: number): SeatPos {
  const angle = (index / count) * Math.PI * 2;
  const x = Math.sin(angle);
  const z = Math.cos(angle);
  return {
    left: 50 + x * 44,
    top: 54 + z * 34,
    scale: 0.78 + ((z + 1) / 2) * 0.32,
  };
}

export function TableScene({ snapshot, selectableIds, selectedId, onSelect }: TableSceneProps) {
  const { publicState: pub, privateState: priv } = snapshot;
  const selfId = priv.playerId;
  const order = pub.playerOrder;
  const myIndex = Math.max(0, order.indexOf(selfId));
  const seated = order.map((_, i) => order[(myIndex + i) % order.length]);
  const selectable = new Set(selectableIds);
  const layouts: Record<string, SeatPos> = {};
  seated.forEach((id, i) => {
    layouts[id] = seatPosition(i, seated.length);
  });

  const [flights, setFlights] = useState<Flight[]>([]);
  const prevPres = useRef<string | null>(null);
  const prevChan = useRef<string | null>(null);
  const firstSync = useRef(true);

  useLayoutEffect(() => {
    const pres = pub.presidentialCandidateId;
    const chan = pub.chancellorCandidateId;
    if (firstSync.current) {
      prevPres.current = pres;
      prevChan.current = chan;
      firstSync.current = false;
      return;
    }

    const next: Flight[] = [];
    if (pres !== prevPres.current) {
      next.push({
        key: Date.now(),
        kind: "president",
        from: (prevPres.current && layouts[prevPres.current]) || TABLE_CENTER,
        to: (pres && layouts[pres]) || TABLE_CENTER,
      });
    }
    if (chan !== prevChan.current) {
      next.push({
        key: Date.now() + 1,
        kind: "chancellor",
        from:
          (prevChan.current && layouts[prevChan.current]) ||
          (pres && layouts[pres]) ||
          TABLE_CENTER,
        to: (chan && layouts[chan]) || (pres && layouts[pres]) || TABLE_CENTER,
      });
    }
    prevPres.current = pres;
    prevChan.current = chan;
    if (next.length) setFlights((cur) => [...cur, ...next]);
  }, [pub.presidentialCandidateId, pub.chancellorCandidateId, seated.join("|")]);

  const flyingKinds = new Set(flights.map((f) => f.kind));

  return (
    <div className="scene">
      <div className="scene-wall" />
      <div className="table-oval">
        <div className="table-rim" />
        <div className="table-felt">
          <div className="table-boards">
            <PolicyBoard
              kind="liberal"
              filled={pub.liberalPolicies}
              total={5}
              labels={["1", "2", "3", "4", "자유 승리"]}
            />
            <PolicyBoard
              kind="fascist"
              filled={pub.fascistPolicies}
              total={6}
              labels={pub.fascistTrack.map((power, i) => {
                if (i === 5) return "파시 승리";
                if (i === 4) return power ? `${POWER_ICON[power]} · 거부권` : "거부권";
                return power ? POWER_ICON[power] : `${i + 1}`;
              })}
            />
          </div>
          <div className="table-meta">
            <div className="election-tokens" title="선거 추적">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`token${pub.electionTracker > i ? " on" : ""}`} />
              ))}
            </div>
            <div className="deck-piles">
              <span>덱 {pub.drawPileCount}</span>
              <span>버림 {pub.discardPileCount}</span>
            </div>
          </div>
        </div>
      </div>

      {seated.map((id, i) => {
        const player = pub.players.find((p) => p.id === id);
        if (!player) return null;
        const pos = layouts[id];
        const depth = (pos.top - 20) / 70;
        const canClick = selectable.has(id);
        return (
          <PlayerSeat
            key={id}
            player={player}
            pub={pub}
            selfId={selfId}
            revealed={pub.revealedRoles?.[id]}
            selected={selectedId === id}
            selectable={canClick}
            hidePresident={flyingKinds.has("president")}
            hideChancellor={flyingKinds.has("chancellor")}
            style={{
              left: `${pos.left}%`,
              top: `${pos.top}%`,
              zIndex: 4 + Math.round(depth * 40),
              transform: `translate(-50%, -50%) scale(${pos.scale})`,
            }}
            onClick={() => {
              if (canClick) onSelect(id);
            }}
          />
        );
      })}

      {flights.map((flight) => (
        <FlyingPlaque
          key={flight.key}
          flight={flight}
          onDone={() => setFlights((cur) => cur.filter((f) => f.key !== flight.key))}
        />
      ))}
    </div>
  );
}

function FlyingPlaque({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [pos, setPos] = useState(flight.from);

  useEffect(() => {
    const start = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPos(flight.to));
    });
    const done = window.setTimeout(() => doneRef.current(), 700);
    return () => {
      cancelAnimationFrame(start);
      window.clearTimeout(done);
    };
  }, [flight]);

  return (
    <div
      className={`plaque flying ${flight.kind}`}
      style={{
        left: `${pos.left}%`,
        top: `${pos.top}%`,
        transform: `translate(-50%, -130%) scale(${pos.scale})`,
      }}
    >
      {flight.kind === "president" ? "대통령" : "수상"}
    </div>
  );
}

function PolicyBoard({
  kind,
  filled,
  total,
  labels,
}: {
  kind: "liberal" | "fascist";
  filled: number;
  total: number;
  labels: string[];
}) {
  const prev = useRef(filled);
  const [placing, setPlacing] = useState<number | null>(null);

  useEffect(() => {
    if (filled > prev.current) {
      setPlacing(filled - 1);
      const timer = window.setTimeout(() => setPlacing(null), 850);
      prev.current = filled;
      return () => window.clearTimeout(timer);
    }
    prev.current = filled;
    setPlacing(null);
  }, [filled]);

  return (
    <div className={`policy-board ${kind}`}>
      <div className="board-title">{kind === "liberal" ? "자유당 정책" : "파시스트 정책"}</div>
      <div className={`board-slots count-${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`board-slot${i < filled ? ` filled ${kind}` : ""}${
              placing === i ? " placing" : ""
            }`}
          >
            {labels[i]}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerSeat({
  player,
  pub,
  selfId,
  revealed,
  selected,
  selectable,
  hidePresident,
  hideChancellor,
  style,
  onClick,
}: {
  player: PublicPlayer;
  pub: ClientSnapshot["publicState"];
  selfId: string;
  revealed?: Role;
  selected: boolean;
  selectable: boolean;
  hidePresident: boolean;
  hideChancellor: boolean;
  style: CSSProperties;
  onClick: () => void;
}) {
  const isPres = player.id === pub.presidentialCandidateId && !hidePresident;
  const isChan = player.id === pub.chancellorCandidateId && !hideChancellor;
  const limited = pub.termLimitedIds.includes(player.id);
  const voted = pub.votedIds.includes(player.id);
  const lastVote = pub.lastVotes?.[player.id];
  const isSelf = player.id === selfId;

  return (
    <button
      type="button"
      className={[
        "player-seat",
        isSelf ? "self" : "",
        player.alive ? "" : "dead",
        player.connected ? "" : "offline",
        limited ? "term-limited" : "",
        selectable ? "selectable" : "",
        selected ? "selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      disabled={!selectable}
      onClick={onClick}
    >
      <div className="plaque-row">
        {isPres ? <div className="plaque president">대통령</div> : null}
        {isChan ? <div className="plaque chancellor">수상</div> : null}
      </div>
      <div className="figure">
        <div className="head" />
        <div className="torso" />
      </div>
      <div className="seat-cushion" />
      <div className="seat-name">
        {player.nickname}
        {isSelf ? " (나)" : ""}
      </div>
      <div className="seat-tags">
        {!player.alive ? <span>처형됨</span> : null}
        {player.alive && !player.connected ? <span>끊김</span> : null}
        {revealed ? <span>{ROLE_NAME[revealed]}</span> : null}
        {pub.phase === "vote" && voted ? <span>투표함</span> : null}
        {lastVote === "ja" ? <span className="ja">Ja</span> : null}
        {lastVote === "nein" ? <span className="nein">Nein</span> : null}
        {player.isBot ? <span>봇</span> : null}
      </div>
    </button>
  );
}
