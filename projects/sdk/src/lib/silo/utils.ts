import { BigNumber } from "ethers";
import { Token } from "src/classes/Token";
import { EventProcessorData } from "src/lib/events/processor";
import { EIP712PermitMessage } from "src/lib/permit";
import { Crate, DepositCrate, Silo, TokenSiloBalance, WithdrawalCrate } from "../silo";
import { TokenValue } from "src/classes/TokenValue";

export type MapValueType<A> = A extends Map<any, infer V> ? V : never;

// FIXME: resolve with EIP712PermitMessage
export type DepositTokenPermitMessage = EIP712PermitMessage<{
  token: string;
  value: number | string;
}>;

export type DepositTokensPermitMessage = EIP712PermitMessage<{
  tokens: string[];
  values: (number | string)[];
}>;

export type CrateSortFn = <T extends Crate<TokenValue>>(crates: T[]) => T[];

/**
 * Beanstalk doesn't automatically re-categorize withdrawals as "claimable".
 * "Claimable" just means that the `season` parameter stored in the withdrawal
 * event is less than or equal to the current `season()`.
 *
 * This function serves two purposes:
 * 1. Break generic withdrawals into
 *    "withdrawn" (aka transit), which cannot yet be claimed
 *    "claimable" (aka receivable), which are eligible to be claimed
 * 2. Convert each crate amount to the appropriate number of decimals.
 */
export const _parseWithdrawalCrates = (
  token: Token,
  withdrawals: MapValueType<EventProcessorData["withdrawals"]>,
  currentSeason: BigNumber
): {
  withdrawn: TokenSiloBalance["withdrawn"];
  claimable: TokenSiloBalance["claimable"];
} => {
  let withdrawnBalance = TokenValue.ZERO; // aka "transit"
  let claimableBalance = TokenValue.ZERO; // aka "receivable"
  const withdrawn: WithdrawalCrate[] = []; // aka "transit"
  const claimable: WithdrawalCrate[] = []; // aka "receivable"

  // Split each withdrawal between `receivable` and `transit`.
  Object.keys(withdrawals).forEach((season) => {
    const amt = TokenValue.fromBlockchain(withdrawals[season].amount, token.decimals);
    const szn = BigNumber.from(season);
    if (szn.lte(currentSeason)) {
      claimableBalance = claimableBalance.add(amt);
      claimable.push({
        amount: amt,
        season: szn
      });
    } else {
      withdrawnBalance = withdrawnBalance.add(amt);
      withdrawn.push({
        amount: amt,
        season: szn
      });
    }
  });

  return {
    withdrawn: {
      amount: withdrawnBalance,
      crates: withdrawn
    },
    claimable: {
      amount: claimableBalance,
      crates: claimable
    }
  };
};

/**
 * Order crates by Season.
 */
export function sortCratesBySeason<T extends Crate<TokenValue>>(crates: T[], direction: "asc" | "desc" = "desc") {
  const m = direction === "asc" ? -1 : 1;
  return [...crates].sort((a, b) => m * b.season.sub(a.season).toNumber());
}

/**
 * Order crates by BDV.
 */
export function sortCratesByBDVRatio<T extends DepositCrate<TokenValue>>(crates: T[], direction: "asc" | "desc" = "asc") {
  const m = direction === "asc" ? -1 : 1;
  return [...crates].sort((a, b) => {
    // FIXME
    const _a = a.bdv.div(a.amount);
    const _b = b.bdv.div(b.amount);
    return m * _b.sub(_a).toBigNumber().toNumber();
  });
}

/**
 * Selects the number of crates needed to add up to the desired `amount`.
 */
export function pickCrates(crates: DepositCrate[], amount: TokenValue, token: Token, currentSeason: number) {
  let totalAmount = TokenValue.ZERO;
  let totalBDV = TokenValue.ZERO;
  let totalStalk = TokenValue.ZERO;
  const cratesToWithdrawFrom: DepositCrate[] = [];

  crates.some((crate) => {
    const amountToRemoveFromCrate = totalAmount.add(crate.amount).lte(amount) ? crate.amount : amount.sub(totalAmount);
    const elapsedSeasons = currentSeason - crate.season.toNumber();
    const cratePct = amountToRemoveFromCrate.div(crate.amount);
    const crateBDV = cratePct.mul(crate.bdv);
    const crateSeeds = cratePct.mul(crate.seeds);
    const baseStalk = token.getStalk(crateBDV);
    const grownStalk = crateSeeds.mul(elapsedSeasons).mul(Silo.STALK_PER_SEED_PER_SEASON);
    const crateStalk = baseStalk.add(grownStalk);

    totalAmount = totalAmount.add(amountToRemoveFromCrate);
    totalBDV = totalBDV.add(crateBDV);
    totalStalk = totalStalk.add(crateStalk);

    cratesToWithdrawFrom.push({
      season: crate.season,
      amount: amountToRemoveFromCrate,
      bdv: crateBDV,
      stalk: crateStalk,
      baseStalk: baseStalk,
      grownStalk: grownStalk,
      seeds: crateSeeds
    });

    return totalAmount.eq(amount);
  });

  if (totalAmount.lt(amount)) {
    throw new Error("Not enough deposits");
  }

  return {
    totalAmount,
    totalBDV,
    totalStalk,
    crates: cratesToWithdrawFrom
  };
}
