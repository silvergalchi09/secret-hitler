import { useEffect, useState } from "react";
import { ROLE_NAME } from "@shared/rules";
import type { ExpansionMode, PublicPlayer, Role } from "@shared/types";

type Guess = Role | "unknown";

interface NotesPadProps {
  roomCode: string;
  selfId: string;
  players: PublicPlayer[];
  playerOrder: string[];
  expansion: ExpansionMode;
}

const GUESSES: Guess[] = ["unknown", "liberal", "fascist", "hitler", "mastermind"];

export function NotesPad({
  roomCode,
  selfId,
  players,
  playerOrder,
  expansion,
}: NotesPadProps) {
  const storageKey = `fh_notes_${roomCode}_${selfId}`;
  const [notes, setNotes] = useState<Record<string, { guess: Guess; text: string }>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setNotes(JSON.parse(raw) as Record<string, { guess: Guess; text: string }>);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const save = (next: Record<string, { guess: Guess; text: string }>) => {
    setNotes(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const guessOptions = expansion === "mastermind" ? GUESSES : GUESSES.filter((g) => g !== "mastermind");

  return (
    <aside className="notepad">
      <h2>역할 메모</h2>
      <p className="hint">나만 보이는 메모입니다. 예상 역할을 적어 두세요.</p>
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
            </div>
            <select
              value={entry.guess}
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
