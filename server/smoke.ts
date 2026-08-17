import {
  applyAction,
  createGame,
  eligibleChancellorIds,
  getPrivateState,
  type InternalGame,
  type SeatPlayer,
} from "./game.ts";
import type { Policy } from "../shared/types.ts";

function seats(n: number): SeatPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    nickname: `플레이어${i + 1}`,
    connected: true,
    isHost: i === 0,
  }));
}

function confirmAll(game: InternalGame): void {
  for (const id of game.playerOrder) applyAction(game, id, { type: "confirmNight" });
}

function elect(game: InternalGame, chancellor: string, votes: "ja" | "nein" = "ja"): void {
  applyAction(game, game.presidentialCandidateId, { type: "nominate", playerId: chancellor });
  for (const id of game.playerOrder) {
    if (!game.alive[id]) continue;
    applyAction(game, id, { type: "vote", choice: votes });
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

{
  const game = createGame(seats(5));
  assert(game.phase === "night", "expected night");
  confirmAll(game);
  assert(game.phase === "nominate", "expected nominate");
  const president = game.presidentialCandidateId;
  const chancellor = eligibleChancellorIds(game)[0];
  elect(game, chancellor);
  assert(game.phase === "presidentDiscard", `expected discard, got ${game.phase}`);
  applyAction(game, president, { type: "discardPolicy", index: 0 });
  applyAction(game, chancellor, { type: "enactPolicy", index: 0 });
  assert(["nominate", "presidentialPower", "gameOver"].includes(game.phase), game.phase);
  console.log("basic round ok");
}

{
  const game = createGame(seats(5));
  confirmAll(game);
  for (let i = 0; i < 3; i++) {
    const chancellor = eligibleChancellorIds(game)[0];
    elect(game, chancellor, "nein");
  }
  assert(game.electionTracker === 0, `tracker should reset after chaos, got ${game.electionTracker}`);
  assert(game.liberalPolicies + game.fascistPolicies === 1, "chaos should enact one policy");
  assert(!game.lastElectedPresidentId && !game.lastElectedChancellorId, "chaos clears term limits");
  console.log("chaos ok");
}

{
  const game = createGame(seats(7));
  confirmAll(game);
  const hitler = game.playerOrder.find((id) => game.roles[id] === "hitler")!;
  game.fascistPolicies = 3;
  const president = game.presidentialCandidateId;
  if (hitler === president) {
    game.presidentialCandidateId = game.playerOrder.find((id) => id !== hitler)!;
  }
  elect(game, hitler, "ja");
  assert(game.phase === "gameOver", "hitler chancellor should end game");
  assert(game.winner === "fascist", "fascists win");
  console.log("hitler chancellor ok");
}

{
  const game = createGame(seats(5));
  confirmAll(game);
  const president = game.presidentialCandidateId;
  game.phase = "presidentialPower";
  game.lastElectedPresidentId = president;
  game.currentPower = "execution";
  const hitler = game.playerOrder.find((id) => game.roles[id] === "hitler" && id !== president) ??
    game.playerOrder.find((id) => id !== president)!;
  if (game.roles[hitler] !== "hitler") {
    game.roles[hitler] = "hitler";
  }
  applyAction(game, president, { type: "usePower", targetId: hitler });
  assert(game.winner === "liberal", "killing hitler should win liberals");
  console.log("execute hitler ok");
}

{
  const game = createGame(seats(5));
  confirmAll(game);
  const president = game.presidentialCandidateId;
  const chancellor = eligibleChancellorIds(game)[0];
  elect(game, chancellor);
  game.vetoUnlocked = true;
  game.policyHand = ["fascist", "fascist", "liberal"] as Policy[];
  applyAction(game, president, { type: "discardPolicy", index: 2 });
  applyAction(game, chancellor, { type: "requestVeto" });
  applyAction(game, president, { type: "vetoResponse", agree: true });
  assert(game.electionTracker === 1, "veto advances tracker");
  assert(game.phase === "nominate", `expected nominate after veto, got ${game.phase}`);
  console.log("veto ok");
}

{
  const game = createGame(seats(8));
  const hitler = game.playerOrder.find((id) => game.roles[id] === "hitler")!;
  const fascist = game.playerOrder.find((id) => game.roles[id] === "fascist")!;
  const infoF = getPrivateState(game, fascist).nightInfo;
  const infoH = getPrivateState(game, hitler).nightInfo;
  assert(infoH === null, "hitler should not see fascists in 8p");
  assert(infoF && infoF.hitlerId === hitler, "fascists should see hitler in 8p");
  console.log("night info ok");
}

function withMastermind(n: number): InternalGame {
  const game = createGame(seats(n), "mastermind");
  if (!game.playerOrder.some((id) => game.roles[id] === "mastermind")) {
    const liberal = game.playerOrder.find((id) => game.roles[id] === "liberal")!;
    game.roles[liberal] = "mastermind";
  }
  return game;
}

{
  const game = withMastermind(5);
  const mm = game.playerOrder.find((id) => game.roles[id] === "mastermind")!;
  const fascist = game.playerOrder.find((id) => game.roles[id] === "fascist")!;
  const infoMm = getPrivateState(game, mm).nightInfo;
  const infoF = getPrivateState(game, fascist).nightInfo;
  assert(infoMm?.seesEveryone, "mastermind should see everyone");
  assert(infoMm?.teammates.length === 4, "mastermind should see the other four roles");
  assert(
    infoF?.teammates.every((t) => t.role !== "mastermind"),
    "fascists should not treat mastermind as a teammate",
  );
  console.log("mastermind night ok");
}

{
  const game = withMastermind(5);
  confirmAll(game);
  const president = game.presidentialCandidateId;
  const chancellor = eligibleChancellorIds(game).find((id) => game.roles[id] !== "hitler")!;
  elect(game, chancellor);
  game.liberalPolicies = 4;
  game.fascistPolicies = 4;
  game.fascistFiveBeforeLiberalFour = false;
  game.policyHand = ["fascist", "fascist", "fascist"];
  applyAction(game, president, { type: "discardPolicy", index: 0 });
  applyAction(game, chancellor, { type: "enactPolicy", index: 0 });
  assert(game.winner === "mastermind", "4 liberal then 5 fascist should win mastermind");
  console.log("mastermind path A ok");
}

{
  const game = withMastermind(5);
  confirmAll(game);
  const mm = game.playerOrder.find((id) => game.roles[id] === "mastermind")!;
  if (game.presidentialCandidateId === mm) {
    game.presidentialCandidateId = game.playerOrder.find((id) => id !== mm)!;
  }
  const president = game.presidentialCandidateId;
  elect(game, mm);
  game.liberalPolicies = 3;
  game.fascistPolicies = 5;
  game.fascistFiveBeforeLiberalFour = true;
  game.policyHand = ["liberal", "liberal", "liberal"];
  applyAction(game, president, { type: "discardPolicy", index: 0 });
  applyAction(game, mm, { type: "enactPolicy", index: 0 });
  assert(game.winner === "mastermind", "mastermind chancellor 4th liberal should win");
  console.log("mastermind path B ok");
}

{
  const game = withMastermind(5);
  confirmAll(game);
  const mm = game.playerOrder.find((id) => game.roles[id] === "mastermind")!;
  const president = game.presidentialCandidateId === mm
    ? game.playerOrder.find((id) => id !== mm)!
    : game.presidentialCandidateId;
  game.presidentialCandidateId = president;
  game.phase = "presidentialPower";
  game.lastElectedPresidentId = president;
  game.currentPower = "execution";
  applyAction(game, president, { type: "usePower", targetId: mm });
  assert(!game.alive[mm], "mastermind can be executed");
  assert(game.winner === null, "killing mastermind should not end the game");
  console.log("execute mastermind ok");
}

console.log("all smoke tests passed");
