import { useEffect, useState } from "react";
import { PARTY_NAME, ROLE_NAME } from "@shared/rules";
import type {
  ExpansionMode,
  NightInfo,
  Party,
  Phase,
  PrivateState,
  PublicPlayer,
  Role,
} from "@shared/types";

type Guess = Role | "unknown";

interface NoteEntry {
  guess: Guess;
  text: string;
  confirmed?: boolean;
  knownParty?: Party;
}

type Notes = Record<string, NoteEntry>;

interface NotesPadProps {
  roomCode: string;
  selfId: string;
  players: PublicPlayer[];
  playerOrder: string[];
  expansion: ExpansionMode;
  phase: Phase;
  role: Role | null;
  nightInfo: NightInfo | null;
  investigationResult: PrivateState["investigationResult"];
}

const GUESSES: Guess[] = ["unknown", "liberal", "fascist", "hitler", "mastermind"];

function partyToUniqueRole(party: Party): Role | null {
  if (party === "liberal") return "liberal";
  if (party === "mastermind") return "mastermind";
  return null;
}

function knownRolesFromSecrets(
  selfId: string,
  role: Role | null,
  nightInfo: NightInfo | null,
  investigation: PrivateState["investigationResult"],
): Record<string, Role> {
  const known: Record<string, Role> = {};
  if (role) known[selfId] = role;

  if (nightInfo) {
    for (const teammate of nightInfo.teammates) {
      known[teammate.id] = teammate.role;
    }
    if (nightInfo.seesHitler && nightInfo.hitlerId) {
      known[nightInfo.hitlerId] = "hitler";
    }
  }

  if (investigation) {
    const unique = partyToUniqueRole(investigation.party);
    if (!known[investigation.playerId]) {
      if (unique) {
        known[investigation.playerId] = unique;
      } else if (investigation.party === "fascist") {
        // 조사 결과로 "파시스트 소속"을 확정적으로 알 수 있으므로, 메모에는 파시스트로 기입합니다.
        known[investigation.playerId] = "fascist";
      }
    }
  }

  return known;
}

function applyKnownFacts(
  prev: Notes,
  knownRoles: Record<string, Role>,
  knownParties: Record<string, Party>,
): Notes {
  let changed = false;
  const next: Notes = { ...prev };

  for (const [id, confirmedRole] of Object.entries(knownRoles)) {
    const entry = next[id] ?? { guess: "unknown" as Guess, text: "" };
    if (entry.guess !== confirmedRole || !entry.confirmed) {
      next[id] = { ...entry, guess: confirmedRole, confirmed: true };
      changed = true;
    }
  }

  for (const [id, party] of Object.entries(knownParties)) {
    if (knownRoles[id]) continue;
    const entry = next[id] ?? { guess: "unknown" as Guess, text: "" };
    if (entry.knownParty !== party) {
      next[id] = { ...entry, knownParty: party };
      changed = true;
    }
  }

  return changed ? next : prev;
}

export function NotesPad({
  roomCode,
  selfId,
  players,
  playerOrder,
  expansion,
  phase,
  role,
  nightInfo,
  investigationResult,
}: NotesPadProps) {
  const storageKey = `fh_notes_${roomCode}_${selfId}`;
  const [notes, setNotes] = useState<Notes>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    try {
      const raw = localStorage.getItem(storageKey);
      setNotes(raw ? (JSON.parse(raw) as Notes) : {});
    } catch {
      setNotes({});
    }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    if (phase === "gameOver") {
      setNotes({});
      localStorage.removeItem(storageKey);
      return;
    }
    const knownRoles = knownRolesFromSecrets(selfId, role, nightInfo, investigationResult);

    setNotes((prev) => {
      const next = applyKnownFacts(prev, knownRoles, {});
      if (next !== prev) localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [loaded, storageKey, selfId, role, nightInfo, investigationResult, phase]);

  const save = (next: Notes) => {
    setNotes(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const guessOptions = expansion === "mastermind" ? GUESSES : GUESSES.filter((g) => g !== "mastermind");

  return (
    <aside className="notepad">
      <h2>역할 메모</h2>
      <p className="hint">나만 보이는 메모입니다. 알게 된 역할은 자동으로 채워집니다.</p>
      {playerOrder.map((id) => {
        const player = players.find((p) => p.id === id);
        if (!player) return null;
        const entry = notes[id] ?? { guess: "unknown" as Guess, text: "" };
        return (
          <div key={id} className="note-row">
            <div className="note-name">
              {player.nickname}
              {id === selfId ? " (나)" : ""}
              {player.isBot ? " · 봇" : ""}
              {entry.confirmed ? <span className="note-confirmed">확정</span> : null}
            </div>
            <select
              value={entry.guess}
              disabled={entry.confirmed}
              onChange={(e) =>
                save({
                  ...notes,
                  [id]: { ...entry, guess: e.target.value as Guess },
                })
              }
            >
              {guessOptions.map((g) => (
                <option key={g} value={g}>
                  {g === "unknown" ? "미정" : ROLE_NAME[g]}
                </option>
              ))}
            </select>
            {entry.knownParty && !entry.confirmed ? (
              <div className="note-party">소속 확인: {PARTY_NAME[entry.knownParty]}</div>
            ) : null}
            <textarea
              rows={2}
              placeholder="메모"
              value={entry.text}
              onChange={(e) =>
                save({
                  ...notes,
                  [id]: { ...entry, text: e.target.value },
                })
              }
            />
          </div>
        );
      })}
    </aside>
  );
}
