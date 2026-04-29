import { ethers } from "hardhat";
import * as fs from "fs";

// Market questions by category
const MARKETS = [
  { category: "sports", question: "Will the Celtics win the NBA Championship this season?" },
  { category: "politics", question: "Will the current administration pass the infrastructure bill by Q3?" },
  { category: "boston", question: "Will the MBTA Green Line extension open before September?" },
  { category: "blockchain", question: "Will Ethereum gas fees stay below 20 gwei for a full week?" },
  { category: "other", question: "Will the new iPhone be announced before October?" },
];

// Bet configurations (amount in ROSE, choice: 0=YES, 1=NO)
const BETS_PER_MARKET = [
  { amount: "2.5", choice: 0 },
  { amount: "1.8", choice: 1 },
  { amount: "3.2", choice: 0 },
  { amount: "0.9", choice: 1 },
  { amount: "1.5", choice: 0 },
  { amount: "2.1", choice: 1 },
  { amount: "1.2", choice: 0 },
  { amount: "0.7", choice: 0 },
  { amount: "1.9", choice: 1 },
  { amount: "2.8", choice: 0 },
];

async function main() {
  // Load deployed addresses
  const addressesFile = "deployed-addresses.json";
  if (!fs.existsSync(addressesFile)) {
    console.error("Error: deployed-addresses.json not found. Run deploy script first.");
    process.exit(1);
  }

  const addresses = JSON.parse(fs.readFileSync(addressesFile, "utf-8"));
  console.log("Using deployed contracts:");
  console.log("  MarketFactory:", addresses.marketFactory);
  console.log("  OracleRegistry:", addresses.oracleRegistry);
  console.log("  Oracles:", addresses.oracles);

  const [deployer] = await ethers.getSigners();
  console.log("\nPopulating with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ROSE");

  // Get contract instances
  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const factory = MarketFactory.attach(addresses.marketFactory).connect(deployer);

  const PredictionMarket = await ethers.getContractFactory("PredictionMarket");

  // Duration: 7 days in seconds
  const DURATION = 7 * 24 * 60 * 60;

  const createdMarkets: string[] = [];
  let totalSpent = BigInt(0);

  console.log("\n========================================");
  console.log("Creating Markets...");
  console.log("========================================");

  for (const market of MARKETS) {
    const fullQuestion = `[${market.category}] ${market.question}`;
    console.log(`\nCreating: ${fullQuestion}`);

    try {
      const tx = await factory.createMarket(fullQuestion, DURATION, addresses.oracles);
      const receipt = await tx.wait();

      // Get market address from event
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = factory.interface.parseLog({ topics: log.topics as string[], data: log.data });
          return parsed?.name === "MarketCreated";
        } catch {
          return false;
        }
      });

      if (event) {
        const parsed = factory.interface.parseLog({
          topics: event.topics as string[],
          data: event.data
        });
        const marketAddress = parsed?.args.market;
        createdMarkets.push(marketAddress);
        console.log(`  ✓ Created at: ${marketAddress}`);

        const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
        totalSpent += gasUsed;
      }
    } catch (error: any) {
      console.log(`  ✗ Failed: ${error.message}`);
    }
  }

  console.log("\n========================================");
  console.log("Placing Bets...");
  console.log("========================================");

  for (const marketAddress of createdMarkets) {
    const market = PredictionMarket.attach(marketAddress).connect(deployer);
    const info = await market.getMarketInfo();
    console.log(`\nMarket: ${info._question.slice(0, 50)}...`);

    for (let i = 0; i < BETS_PER_MARKET.length; i++) {
      const bet = BETS_PER_MARKET[i];
      const amount = ethers.parseEther(bet.amount);

      try {
        const tx = await market.placeBet(bet.choice, { value: amount });
        const receipt = await tx.wait();

        const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
        totalSpent += amount + gasUsed;

        console.log(`  ✓ Bet ${i + 1}: ${bet.amount} ROSE on ${bet.choice === 0 ? "YES" : "NO"}`);
      } catch (error: any) {
        console.log(`  ✗ Bet ${i + 1} failed: ${error.message}`);
      }
    }
  }

  console.log("\n========================================");
  console.log("Population Complete!");
  console.log("========================================");
  console.log("Markets created:", createdMarkets.length);
  console.log("Bets placed:", createdMarkets.length * BETS_PER_MARKET.length);
  console.log("Total spent:", ethers.formatEther(totalSpent), "ROSE");

  const newBalance = await ethers.provider.getBalance(deployer.address);
  console.log("Remaining balance:", ethers.formatEther(newBalance), "ROSE");

  // Save market addresses
  const populateData = {
    markets: createdMarkets,
    populatedAt: new Date().toISOString(),
  };
  fs.writeFileSync("populated-markets.json", JSON.stringify(populateData, null, 2));
  console.log("\nMarket addresses saved to populated-markets.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
