import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  // Load deployed addresses
  if (!fs.existsSync("deployed-addresses.json")) {
    console.error("No deployed-addresses.json found. Run deploy.ts first.");
    process.exit(1);
  }

  const addresses = JSON.parse(fs.readFileSync("deployed-addresses.json", "utf8"));
  console.log("Using MarketFactory at:", addresses.marketFactory);

  const [signer] = await ethers.getSigners();
  console.log("Creating market with account:", signer.address);

  // Get MarketFactory contract
  const factory = await ethers.getContractAt("MarketFactory", addresses.marketFactory, signer);

  // Market parameters
  const question = process.env.QUESTION || "Will ETH be above $5000 by end of 2026?";
  const durationDays = parseInt(process.env.DURATION_DAYS || "7");
  const durationSeconds = durationDays * 24 * 60 * 60;

  console.log("\nCreating market:");
  console.log("  Question:", question);
  console.log("  Duration:", durationDays, "days");

  // Create the market
  const tx = await factory.createMarket(question, durationSeconds);
  console.log("\nTransaction hash:", tx.hash);

  const receipt = await tx.wait();

  // Get market address from event
  const marketCreatedEvent = receipt?.logs.find((log: any) => {
    try {
      const parsed = factory.interface.parseLog({ topics: log.topics as string[], data: log.data });
      return parsed?.name === "MarketCreated";
    } catch {
      return false;
    }
  });

  if (marketCreatedEvent) {
    const parsed = factory.interface.parseLog({
      topics: marketCreatedEvent.topics as string[],
      data: marketCreatedEvent.data
    });
    console.log("\n========================================");
    console.log("Market Created!");
    console.log("========================================");
    console.log("Market address:", parsed?.args.market);
    console.log("Creator:", parsed?.args.creator);
    console.log("Betting deadline:", new Date(Number(parsed?.args.bettingDeadline) * 1000).toISOString());
    console.log("========================================");
  }

  // Show total markets
  const marketCount = await factory.getMarketCount();
  console.log("\nTotal markets:", marketCount.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
