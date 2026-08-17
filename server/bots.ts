import { randomInt } from "node:crypto";
import { partyOf } from "../shared/rules.ts";
import type { GameAction } from "../shared/types.ts";
import {
  actorIsUp,
  eligibleChancellorIds,
  type InternalGame,
} from "./game.ts";

function pick<T>(items: T[]): T {
  return items[randomInt(items.length)];
}

function discardPrefer(
  game: InternalGame,
  role: string,
  party: string,
): "liberal" | "fascist" {
  if (role === "mastermind") {
    if (game.fascistFiveBeforeLiberalFour || game.liberalPolicies < 4) return "fascist";
    return "liberal";
  }
  return party === "liberal" ? "fascist" : "liberal";
}

function enactPrefer(
  game: InternalGame,
  role: string,
  party: string,
): "liberal" | "fascist" {
  if (role === "mastermind") {
    if (game.fascistFiveBeforeLiberalFour || game.liberalPolicies < 4) return "liberal";
    return "fascist";
  }
  return party === "liberal" ? "liberal" : "fascist";
}

export function chooseBotAction(
  game: InternalGame,
  botId: string,
  isBot: (id: string) => boolean,
): GameAction | null {
  if (!actorIsUp(game, botId)) return null;
  const role = game.roles[botId];
  const party = partyOf(role);

  switch (game.phase) {
    case "night":
      return { type: "confirmNight" };
    case "nominate": {
      const ids = eligibleChancellorIds(game);
      if (ids.length === 0) return null;
      return { type: "nominate", playerId: pick(ids) };
    }
    case "vote":
      return { type: "vote", choice: randomInt(100) < 80 ? "ja" : "nein" };
    case "presidentDiscard": {
      const hand = game.policyHand;
      const prefer = discardPrefer(game, role, party);
      const index = Math.max(0, hand.findIndex((card) => card === prefer));
      return { type: "discardPolicy", index };
    }
    case "chancellorEnact": {
      const hand = game.policyHand;
      if (game.vetoUnlocked && !game.vetoRejectedThisSession) {
        const allFascist = hand.every((card) => card === "fascist");
        const allLiberal = hand.every((card) => card === "liberal");
        if (party === "liberal" && allFascist) return { type: "requestVeto" };
        if (party === "fascist" && allLiberal) return { type: "requestVeto" };
      }
      const prefer = enactPrefer(game, role, party);
      const index = Math.max(0, hand.findIndex((card) => card === prefer));
      return { type: "enactPolicy", index };
    }
    case "vetoConfirm":
      return { type: "vetoResponse", agree: party === "liberal" };
    case "presidentialPower": {
      if (game.pendingPowerReveal) return { type: "acknowledgePower" };
      if (game.currentPower === "policyPeek") return { type: "usePower" };
      const others = game.playerOrder.filter((id) => id !== botId && game.alive[id]);
      let targets = others;
      if (game.currentPower === "investigate") {
        targets = others.filter((id) => !game.investigated[id]);
      }
      if (targets.length === 0) targets = others;
      if (targets.length === 0) return null;
      if (game.currentPower === "execution") {
        const botTargets = targets.filter((id) => isBot(id));
        if (botTargets.length > 0 && randomInt(100) < 85) {
          return { type: "usePower", targetId: pick(botTargets) };
        }
      }
      return { type: "usePower", targetId: pick(targets) };
    }
    default:
      return null;
  }
}

export function botIdsNeedingAction(game: InternalGame, botIds: string[]): string[] {
  return botIds.filter((id) => actorIsUp(game, id));
}
