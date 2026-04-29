/**
 * Demo: Simulate 100-200 accounts betting on a freshly created market
 * over a 10-minute window, then resolve and pay out winners.
 *
 * Run:
 *   cd contracts
 *   npx hardhat run demo/simulate.ts --network localhost
 *
 * Prerequisites:
 *   - `npx hardhat node` running in another terminal
 *   - `npx hardhat run scripts/deploy.ts --network localhost` already done
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Config ────────────────────────────────────────────────────────────────

const NUM_ACCOUNTS     = randInt(100, 200);   // resolved at runtime
const DURATION_MIN     = 3;                  // minutes to spread bets over
const ODDS_UPDATE_MIN  = 1;                   // must match PredictionMarket.sol
const FUND_ETH         = "0.08";              // ETH given to each bettor wallet
const MIN_BET_ETH      = 0.01;
const MAX_BET_ETH      = 0.05;
const FUND_BATCH_SIZE  = 25;                  // wallets funded per tx batch
const ORACLE_STAKE     = "100";               // ROSE required for oracle registration

// ─── Helpers ───────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function bar(yes: number, no: number, width = 30): string {
  const total = yes + no || 1;
  const yBlocks = Math.round((yes / total) * width);
  const nBlocks = width - yBlocks;
  return `[${"Y".repeat(yBlocks)}${"N".repeat(nBlocks)}] ${Math.round((yes / total) * 100)}% YES`;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load deployed addresses
  const addrFile = path.join(__dirname, "../deployed-addresses.json");
  if (!fs.existsSync(addrFile)) {
    throw new Error(
      "deployed-addresses.json not found.\n" +
      "Run: npx hardhat run scripts/deploy.ts --network localhost"
    );
  }
  const addresses = JSON.parse(fs.readFileSync(addrFile, "utf8"));

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("=".repeat(56));
  console.log("  MARSUPILAMI — Market Simulation Demo");
  console.log("=".repeat(56));
  console.log(`Deployer   : ${deployer.address}`);
  console.log(`Balance    : ${ethers.formatEther(balance)} ETH`);
  console.log(`Bettors    : ${NUM_ACCOUNTS}`);
  console.log(`Duration   : ${DURATION_MIN} minutes`);
  console.log("=".repeat(56));

  // ─── Phase 0: Register 3 Oracles ─────────────────────────────────────────
  console.log(`\n[0/7] Registering 3 oracles...`);
  const oracleRegistry = await ethers.getContractAt("OracleRegistry", addresses.oracleRegistry);
  const stakeAmount = ethers.parseEther(ORACLE_STAKE);

  // Create 3 oracle wallets
  const oracleWallets = Array.from({ length: 3 }, () =>
    ethers.Wallet.createRandom().connect(ethers.provider)
  );

  // Fund and register each oracle
  for (let i = 0; i < 3; i++) {
    // Fund oracle wallet (needs stake + gas)
    const fundTx = await deployer.sendTransaction({
      to: oracleWallets[i].address,
      value: ethers.parseEther("101")  // 100 for stake + 1 for gas
    });
    await fundTx.wait();

    // Register as oracle
    const regTx = await oracleRegistry.connect(oracleWallets[i]).register({ value: stakeAmount });
    await regTx.wait();

    console.log(`      Oracle ${i + 1}: ${oracleWallets[i].address}`);
  }

  const oracleAddresses = oracleWallets.map(w => w.address);
  console.log(`      All 3 oracles registered with ${ORACLE_STAKE} ETH stake each`);

  // ─── Phase 1: Create Market ──────────────────────────────────────────────
  const factory = await ethers.getContractAt("MarketFactory", addresses.marketFactory);
  const question = "Will Bitcoin surpass $150,000 before the end of 2026?";
  const durationSec = 2 * 60 * 60; // 2 hours — well above the 1-hour minimum

  console.log(`\n[1/7] Creating market with designated oracles...`);
  console.log(`      "${question}"`);

  const countBefore = await factory.getMarketCount();
  const createTx = await factory.createMarket(question, durationSec, oracleAddresses);
  await createTx.wait();
  const countAfter = await factory.getMarketCount();
  if (countAfter <= countBefore) throw new Error("Market creation failed — count did not increase");

  // getMarkets(start, count) — fetch the one we just created
  const newMarkets = await factory.getMarkets(countBefore, 1n);
  const marketAddress: string = newMarkets[0];

  const market = await ethers.getContractAt("PredictionMarket", marketAddress);
  const deadline = await market.bettingDeadline();
  console.log(`      Market  : ${marketAddress}`);
  console.log(`      Deadline: ${new Date(Number(deadline) * 1000).toLocaleString()}`);

  // Write demo state so the frontend can pick it up
  const demoStatePath = path.join(__dirname, "../../frontend/public/demo-state.json");
  fs.writeFileSync(demoStatePath, JSON.stringify({
    marketAddress,
    question,
    startedAt: new Date().toISOString(),
    totalBettors: NUM_ACCOUNTS,
    durationMin: DURATION_MIN,
    oddsUpdateMin: ODDS_UPDATE_MIN,
    marketFactory: addresses.marketFactory,
    oracleRegistry: addresses.oracleRegistry,
    oracles: oracleAddresses,
  }, null, 2));
  console.log(`      Demo state written → frontend/public/demo-state.json`);

  // ─── Phase 2: Generate Wallets ───────────────────────────────────────────
  console.log(`\n[2/7] Generating ${NUM_ACCOUNTS} wallets...`);
  const provider = ethers.provider;
  const wallets  = Array.from({ length: NUM_ACCOUNTS }, () =>
    ethers.Wallet.createRandom().connect(provider)
  );

  // ─── Phase 3: Fund Wallets ───────────────────────────────────────────────
  console.log(`\n[3/7] Funding wallets (${FUND_ETH} ETH each)...`);
  const fundValue = ethers.parseEther(FUND_ETH);

  for (let i = 0; i < wallets.length; i += FUND_BATCH_SIZE) {
    const batch = wallets.slice(i, i + FUND_BATCH_SIZE);
    const txs   = await Promise.all(
      batch.map(w => deployer.sendTransaction({ to: w.address, value: fundValue }))
    );
    await Promise.all(txs.map(t => t.wait()));
    const done = Math.min(i + FUND_BATCH_SIZE, wallets.length);
    process.stdout.write(`      ${done}/${wallets.length} funded...\r`);
  }
  console.log(`      All ${NUM_ACCOUNTS} wallets funded.        `);

  // ─── Phase 4: Place Bets ─────────────────────────────────────────────────
  console.log(`\n[4/7] Placing ${NUM_ACCOUNTS} bets over ${DURATION_MIN} minutes...\n`);

  const totalMs   = DURATION_MIN * 60 * 1000;
  const schedule  = wallets
    .map((w, i) => ({ wallet: w, delayMs: randInt(0, totalMs), index: i }))
    .sort((a, b) => a.delayMs - b.delayMs);

  let yesCount  = 0;
  let noCount   = 0;
  let failCount = 0;
  const startTs = Date.now();

  // Track which wallets bet on which side for claiming later
  const yesBettors: typeof wallets = [];
  const noBettors: typeof wallets = [];
  const betAmounts = new Map<string, bigint>(); // address → amount bet

  // ── Parallel odds clock ──────────────────────────────────────────────────
  async function printOdds(tick: number) {
    const pubYes = await market.publicYesPool();
    const pubNo  = await market.publicNoPool();
    const tot    = pubYes + pubNo;
    const yesPct = tot > 0n ? Math.round(Number((pubYes * 100n) / tot)) : 50;
    const noPct  = 100 - yesPct;
    const yesMult = pubYes > 0n ? (Number(tot) / Number(pubYes)).toFixed(2) : "N/A";
    const noMult  = pubNo  > 0n ? (Number(tot) / Number(pubNo)).toFixed(2)  : "N/A";
    const elapsedS = Math.round((Date.now() - startTs) / 1000);
    console.log(`\n  ── Odds Reveal #${tick} (${elapsedS}s elapsed) ────────────────`);
    console.log(`     YES  ${String(yesPct).padStart(3)}%  |  Pool: ${ethers.formatEther(pubYes).padEnd(8)} ETH  |  Payout: ${yesMult}x`);
    console.log(`     NO   ${String(noPct).padStart(3)}%  |  Pool: ${ethers.formatEther(pubNo).padEnd(8)} ETH  |  Payout: ${noMult}x`);
    console.log();
  }

  const oddsClock = (async () => {
    let tick = 1;
    while (Date.now() - startTs < totalMs + 10_000) {
      await sleep(ODDS_UPDATE_MIN * 60 * 1000);
      // Advance Hardhat chain time past the contract interval, then mine a block
      await ethers.provider.send("evm_increaseTime", [ODDS_UPDATE_MIN * 60 + 5]);
      await ethers.provider.send("evm_mine", []);
      try {
        const tx = await (market.connect(deployer) as any).updateOdds();
        await tx.wait();
      } catch {
        // Silently skip if no new bets moved pending pools
      }
      await printOdds(tick);
      tick++;
    }
  })();

  const betPromises: Promise<void>[] = schedule.map(({ wallet, delayMs }) =>
    sleep(delayMs).then(async () => {
      const choice    = Math.random() < 0.5 ? 0 : 1;
      const betEth    = randFloat(MIN_BET_ETH, MAX_BET_ETH);
      const betWei    = ethers.parseEther(betEth.toFixed(4));
      const label     = choice === 0 ? "YES" : "NO ";
      const elapsedS  = Math.floor((Date.now() - startTs) / 1000);

      try {
        const tx = await (market.connect(wallet) as any).placeBet(choice, { value: betWei });
        await tx.wait();

        if (choice === 0) {
          yesCount++;
          yesBettors.push(wallet);
        } else {
          noCount++;
          noBettors.push(wallet);
        }
        betAmounts.set(wallet.address, betWei);

        const betNum = yesCount + noCount;
        console.log(
          `  [${String(elapsedS).padStart(4)}s] #${String(betNum).padStart(3)} ` +
          `${label}  ${betEth.toFixed(4)} ETH  ` +
          `...${wallet.address.slice(-6)}  ` +
          `${bar(yesCount, noCount)}`
        );
      } catch {
        failCount++;
      }
    })
  );

  await Promise.all([...betPromises, oddsClock]);

  // Betting summary
  const marketTotalDeposits = await market.totalDeposits();
  const elapsed             = Math.round((Date.now() - startTs) / 1000);

  console.log("\n" + "=".repeat(56));
  console.log("  Betting Phase Complete");
  console.log("=".repeat(56));
  console.log(`Duration        : ${elapsed}s`);
  console.log(`Bets placed     : ${yesCount + noCount} / ${NUM_ACCOUNTS}`);
  console.log(`  YES           : ${yesCount}`);
  console.log(`  NO            : ${noCount}`);
  console.log(`  Failed        : ${failCount}`);
  console.log(`ETH deposited   : ${ethers.formatEther(marketTotalDeposits)} ETH (on-chain)`);
  console.log("=".repeat(56));

  // ─── Contract Balances After Betting ─────────────────────────────────────
  {
    const pmBal = await ethers.provider.getBalance(marketAddress);
    const orBal = await ethers.provider.getBalance(addresses.oracleRegistry);
    const mfBal = await ethers.provider.getBalance(addresses.marketFactory);
    console.log("\n" + "─".repeat(56));
    console.log("  Contract Balances (bets in escrow)");
    console.log("─".repeat(56));
    console.log(`  PredictionMarket : ${ethers.formatEther(pmBal).padEnd(14)} ETH  ← all bets locked`);
    console.log(`  OracleRegistry   : ${ethers.formatEther(orBal).padEnd(14)} ETH  ← ${oracleWallets.length} oracle stakes (${ORACLE_STAKE} ETH each)`);
    console.log(`  MarketFactory    : ${ethers.formatEther(mfBal).padEnd(14)} ETH`);
    console.log("─".repeat(56));
  }

  // ─── Phase 5: Close Market ───────────────────────────────────────────────
  console.log(`\n[5/7] Closing market...`);
  // Advance time past the betting deadline
  await ethers.provider.send("evm_increaseTime", [durationSec + 60]);
  await ethers.provider.send("evm_mine", []);

  const closeTx = await market.closeMarket();
  await closeTx.wait();
  console.log(`      Market closed. Final pools revealed.`);

  const finalYesPool = await market.publicYesPool();
  const finalNoPool = await market.publicNoPool();
  console.log(`      Final YES Pool: ${ethers.formatEther(finalYesPool)} ETH`);
  console.log(`      Final NO Pool:  ${ethers.formatEther(finalNoPool)} ETH`);

  // ─── Phase 6: Oracle Resolution ──────────────────────────────────────────
  console.log(`\n[6/7] Oracles voting to resolve market...`);

  // Determine outcome based on which pool is larger (simulating real-world result)
  // For demo purposes, we'll vote YES if more people bet YES, NO otherwise
  const OUTCOME_YES = 1;
  const OUTCOME_NO = 2;
  const outcome = yesCount >= noCount ? OUTCOME_YES : OUTCOME_NO;
  const outcomeLabel = outcome === OUTCOME_YES ? "YES" : "NO";

  // All oracles vote for the same outcome (2 votes needed for majority)
  for (let i = 0; i < 2; i++) {
    const voteTx = await market.connect(oracleWallets[i]).submitResolution(outcome);
    await voteTx.wait();
    console.log(`      Oracle ${i + 1} voted ${outcomeLabel}`);
  }

  const finalOutcome = await market.outcome();
  const finalState = await market.state();
  const outcomeNames = ["UNRESOLVED", "YES", "NO", "INVALID"];
  console.log(`      Market resolved: ${outcomeNames[Number(finalOutcome)]}`);
  console.log(`      Market state: ${finalState === 2n ? "RESOLVED" : "ERROR"}`);

  // ─── Phase 7: Process Claims ─────────────────────────────────────────────
  console.log(`\n[7/7] Processing claims for winners...`);

  const winners = outcome === OUTCOME_YES ? yesBettors : noBettors;
  const losers = outcome === OUTCOME_YES ? noBettors : yesBettors;

  console.log(`      Winners (${outcomeLabel} bettors): ${winners.length}`);
  console.log(`      Losers: ${losers.length}`);

  let totalClaimed = 0n;
  let claimCount = 0;
  let claimErrors = 0;
  const payouts = new Map<string, bigint>(); // address → ETH received

  // Process claims for winners
  for (const wallet of winners) {
    try {
      const balBefore = await ethers.provider.getBalance(wallet.address);
      const claimTx = await market.connect(wallet).claim();
      const receipt = await claimTx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(wallet.address);

      const claimed = balAfter - balBefore + gasUsed;
      payouts.set(wallet.address, claimed);
      totalClaimed += claimed;
      claimCount++;
    } catch (err: any) {
      claimErrors++;
    }
  }

  console.log(`      Claims processed: ${claimCount}`);
  console.log(`      Claim errors: ${claimErrors}`);
  console.log(`      Total paid out: ${ethers.formatEther(totalClaimed)} ETH`);

  // ─── Payout Breakdown ────────────────────────────────────────────────────
  const SHOW_EACH = 8;
  const loserLabel = outcomeLabel === "YES" ? "NO" : "YES";

  // Sort winners by payout descending
  const sortedWinners = [...winners].sort((a, b) => {
    const pa = payouts.get(a.address) ?? 0n;
    const pb = payouts.get(b.address) ?? 0n;
    return pa > pb ? -1 : pa < pb ? 1 : 0;
  });

  console.log("\n" + "─".repeat(56));
  console.log("  Payout Breakdown");
  console.log("─".repeat(56));

  console.log(`\n  WINNERS  (bet ${outcomeLabel} — ${winners.length} accounts):`);
  for (const w of sortedWinners.slice(0, SHOW_EACH)) {
    const staked = betAmounts.get(w.address) ?? 0n;
    const paid   = payouts.get(w.address) ?? 0n;
    const profitPct = staked > 0n
      ? (((paid - staked) * 10000n) / staked) / 100n
      : 0n;
    const sign = profitPct >= 0n ? "+" : "";
    console.log(
      `    ...${w.address.slice(-6)}  staked ${ethers.formatEther(staked).padEnd(8)} ETH` +
      `  →  paid out ${ethers.formatEther(paid).padEnd(8)} ETH  (${sign}${profitPct}%)`
    );
  }
  if (winners.length > SHOW_EACH)
    console.log(`    ... and ${winners.length - SHOW_EACH} more winner${winners.length - SHOW_EACH > 1 ? "s" : ""}`);

  console.log(`\n  LOSERS   (bet ${loserLabel} — ${losers.length} accounts):`);
  for (const w of losers.slice(0, SHOW_EACH)) {
    const staked = betAmounts.get(w.address) ?? 0n;
    console.log(
      `    ...${w.address.slice(-6)}  staked ${ethers.formatEther(staked).padEnd(8)} ETH` +
      `  →  paid out 0.0000    ETH  ✗`
    );
  }
  if (losers.length > SHOW_EACH)
    console.log(`    ... and ${losers.length - SHOW_EACH} more loser${losers.length - SHOW_EACH > 1 ? "s" : ""}`);

  const pmBalFinal = await ethers.provider.getBalance(marketAddress);
  console.log(`\n  Contract Balances (post-payout):`);
  console.log(`    PredictionMarket : ${ethers.formatEther(pmBalFinal).padEnd(14)} ETH  ← emptied out`);
  console.log("─".repeat(56));

  // Write payout results to demo-state.json so the frontend can display them
  const demoStateRaw = fs.readFileSync(demoStatePath, "utf8");
  const demoStateObj = JSON.parse(demoStateRaw);
  demoStateObj.payout = {
    outcome: outcomeLabel,
    totalDeposited: ethers.formatEther(marketTotalDeposits),
    totalPaidOut: ethers.formatEther(totalClaimed),
    winners: sortedWinners.map(w => ({
      address: w.address,
      staked: ethers.formatEther(betAmounts.get(w.address) ?? 0n),
      paidOut: ethers.formatEther(payouts.get(w.address) ?? 0n),
    })),
    losers: losers.map(w => ({
      address: w.address,
      staked: ethers.formatEther(betAmounts.get(w.address) ?? 0n),
    })),
  };
  fs.writeFileSync(demoStatePath, JSON.stringify(demoStateObj, null, 2));
  console.log(`\n  Payout results written → frontend/public/demo-state.json`);

  // ─── Final Summary ───────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(56));
  console.log("  DEMO COMPLETE");
  console.log("=".repeat(56));
  console.log(`Market         : ${marketAddress}`);
  console.log(`Question       : ${question}`);
  console.log(`Total bets     : ${yesCount + noCount}`);
  console.log(`  YES bettors  : ${yesCount}`);
  console.log(`  NO bettors   : ${noCount}`);
  console.log(`Total deposited: ${ethers.formatEther(marketTotalDeposits)} ETH`);
  console.log(`Outcome        : ${outcomeNames[Number(finalOutcome)]}`);
  console.log(`Winners paid   : ${claimCount}`);
  console.log(`Total paid out : ${ethers.formatEther(totalClaimed)} ETH`);
  console.log("=".repeat(56));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
