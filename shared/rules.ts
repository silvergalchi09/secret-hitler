import type { PresidentialPower, Role } from "./types.ts";

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

export const ROLE_COUNTS: Record<number, { liberals: number; fascists: number; hitler: number }> = {
  5: { liberals: 3, fascists: 1, hitler: 1 },
  6: { liberals: 4, fascists: 1, hitler: 1 },
  7: { liberals: 4, fascists: 2, hitler: 1 },
  8: { liberals: 5, fascists: 2, hitler: 1 },
  9: { liberals: 5, fascists: 3, hitler: 1 },
  10: { liberals: 6, fascists: 3, hitler: 1 },
};

export function fascistTrack(playerCount: number): (PresidentialPower | null)[] {
  if (playerCount <= 6) {
    return [null, null, "policyPeek", "execution", "execution", null];
  }
  if (playerCount <= 8) {
    return [null, "investigate", "specialElection", "execution", "execution", null];
  }
  return ["investigate", "investigate", "specialElection", "execution", "execution", null];
}

export function powerForFascistSlot(
  playerCount: number,
  fascistPolicies: number,
): PresidentialPower | null {
  if (fascistPolicies < 1 || fascistPolicies > 6) return null;
  return fascistTrack(playerCount)[fascistPolicies - 1] ?? null;
}

export function buildRoleList(playerCount: number): Role[] {
  const counts = ROLE_COUNTS[playerCount];
  if (!counts) {
    throw new Error("인원은 5~10명이어야 합니다.");
  }
  return [
    ...Array<Role>(counts.liberals).fill("liberal"),
    ...Array<Role>(counts.fascists).fill("fascist"),
    ...Array<Role>(counts.hitler).fill("hitler"),
  ];
}

export function partyOf(role: Role): "liberal" | "fascist" {
  return role === "liberal" ? "liberal" : "fascist";
}

export const ROLE_NAME: Record<Role, string> = {
  liberal: "자유당원",
  fascist: "파시스트",
  hitler: "히틀러",
};

export const PARTY_NAME = {
  liberal: "자유당",
  fascist: "파시스트",
} as const;

export const POLICY_NAME = {
  liberal: "자유주의 정책",
  fascist: "파시스트 정책",
} as const;

export const POWER_NAME: Record<PresidentialPower, string> = {
  investigate: "소속 확인",
  specialElection: "특별 선거",
  policyPeek: "정책 훔쳐보기",
  execution: "처형",
};

export const PHASE_TITLE: Record<string, string> = {
  lobby: "로비",
  night: "역할 확인",
  nominate: "수상 지명",
  vote: "내각 투표",
  presidentDiscard: "대통령 입법",
  chancellorEnact: "수상 입법",
  vetoConfirm: "거부권",
  presidentialPower: "대통령 권한",
  gameOver: "게임 종료",
};
