export type Role = "liberal" | "fascist" | "hitler";
export type Party = "liberal" | "fascist";
export type Policy = "liberal" | "fascist";
export type VoteChoice = "ja" | "nein";
export type Winner = "liberal" | "fascist";

export type Phase =
  | "lobby"
  | "night"
  | "nominate"
  | "vote"
  | "presidentDiscard"
  | "chancellorEnact"
  | "vetoConfirm"
  | "presidentialPower"
  | "gameOver";

export type PresidentialPower =
  | "investigate"
  | "specialElection"
  | "policyPeek"
  | "execution";

export interface PublicPlayer {
  id: string;
  nickname: string;
  connected: boolean;
  alive: boolean;
  investigated: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface LogEntry {
  id: number;
  text: string;
}

export interface PublicState {
  roomCode: string;
  testMode: boolean;
  phase: Phase;
  players: PublicPlayer[];
  playerOrder: string[];
  liberalPolicies: number;
  fascistPolicies: number;
  electionTracker: number;
  drawPileCount: number;
  discardPileCount: number;
  presidentialCandidateId: string | null;
  chancellorCandidateId: string | null;
  lastElectedPresidentId: string | null;
  lastElectedChancellorId: string | null;
  termLimitedIds: string[];
  votedIds: string[];
  lastVotes: Record<string, VoteChoice> | null;
  vetoUnlocked: boolean;
  vetoRejectedThisSession: boolean;
  inSpecialElection: boolean;
  currentPower: PresidentialPower | null;
  pendingPowerReveal: "peek" | "investigate" | null;
  log: LogEntry[];
  winner: Winner | null;
  winReason: string | null;
  revealedRoles: Record<string, Role> | null;
  fascistTrack: (PresidentialPower | null)[];
  nightConfirmedIds: string[];
  youAreUp: boolean;
}

export interface NightInfo {
  teammates: { id: string; role: Role }[];
  hitlerId: string | null;
  seesHitler: boolean;
}

export interface PrivateState {
  playerId: string;
  role: Role | null;
  party: Party | null;
  nightInfo: NightInfo | null;
  policyHand: Policy[] | null;
  investigationResult: { playerId: string; party: Party } | null;
  peekedPolicies: Policy[] | null;
}

export interface ClientSnapshot {
  publicState: PublicState;
  privateState: PrivateState;
}

export type GameAction =
  | { type: "startGame" }
  | { type: "addBot" }
  | { type: "removeBot"; playerId?: string }
  | { type: "confirmNight" }
  | { type: "nominate"; playerId: string }
  | { type: "vote"; choice: VoteChoice }
  | { type: "discardPolicy"; index: number }
  | { type: "enactPolicy"; index: number }
  | { type: "requestVeto" }
  | { type: "vetoResponse"; agree: boolean }
  | { type: "usePower"; targetId?: string }
  | { type: "acknowledgePower" }
  | { type: "restart" };
