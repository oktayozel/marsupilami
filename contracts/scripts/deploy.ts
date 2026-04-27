import { ethers } from "hardhat";
import * as fs from "fs";

const MIN_STAKE = ethers.parseEther("100"); // 100 ROSE minimum stake
const NUM_ORACLES = 5;

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // 1. Deploy OracleRegistry
  console.log("\nDeploying OracleRegistry...");
  const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
  const oracleRegistry = await OracleRegistry.deploy();
  await oracleRegistry.waitForDeployment();
  const oracleRegistryAddress = await oracleRegistry.getAddress();
  console.log("OracleRegistry deployed to:", oracleRegistryAddress);

  // 2. Deploy MarketFactory
  console.log("\nDeploying MarketFactory...");
  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const marketFactory = await MarketFactory.deploy(oracleRegistryAddress);
  await marketFactory.waitForDeployment();
  const marketFactoryAddress = await marketFactory.getAddress();
  console.log("MarketFactory deployed to:", marketFactoryAddress);

  // 3. Register default oracles
  console.log("\n========================================");
  console.log("Registering", NUM_ORACLES, "default oracles...");
  console.log("========================================");

  const oracleAddresses: string[] = [];
  const network = await ethers.provider.getNetwork();
  const isLocal = network.chainId === BigInt(31337);

  if (isLocal) {
    // Local network: use different signers for each oracle
    for (let i = 1; i <= NUM_ORACLES; i++) {
      if (i >= signers.length) {
        console.log(`Warning: Not enough signers for oracle ${i}`);
        break;
      }
      const oracleSigner = signers[i];
      const registryWithSigner = oracleRegistry.connect(oracleSigner);

      console.log(`Registering oracle ${i}: ${oracleSigner.address}`);
      const tx = await registryWithSigner.register({ value: MIN_STAKE });
      await tx.wait();
      oracleAddresses.push(oracleSigner.address);
      console.log(`  ✓ Oracle ${i} registered with ${ethers.formatEther(MIN_STAKE)} ROSE stake`);
    }
  } else {
    // Testnet: use deployer to fund and register oracle wallets
    // Generate deterministic wallets for oracles
    console.log("Testnet detected - creating and funding oracle wallets...");

    for (let i = 1; i <= NUM_ORACLES; i++) {
      // Create deterministic wallet from seed phrase + index
      const wallet = ethers.Wallet.createRandom().connect(ethers.provider);

      // Fund the wallet from deployer (need MIN_STAKE + gas)
      const fundAmount = MIN_STAKE + ethers.parseEther("1"); // Extra for gas
      console.log(`Funding oracle ${i}: ${wallet.address}`);
      const fundTx = await deployer.sendTransaction({
        to: wallet.address,
        value: fundAmount,
      });
      await fundTx.wait();

      // Register as oracle
      const registryWithWallet = oracleRegistry.connect(wallet);
      console.log(`Registering oracle ${i}: ${wallet.address}`);
      const regTx = await registryWithWallet.register({ value: MIN_STAKE });
      await regTx.wait();
      oracleAddresses.push(wallet.address);
      console.log(`  ✓ Oracle ${i} registered with ${ethers.formatEther(MIN_STAKE)} ROSE stake`);
    }
  }

  // Output deployment info
  console.log("\n========================================");
  console.log("Deployment Complete!");
  console.log("========================================");
  console.log("OracleRegistry:", oracleRegistryAddress);
  console.log("MarketFactory:", marketFactoryAddress);
  console.log("Oracles:", oracleAddresses.join(", "));
  console.log("========================================");

  // Save addresses to file
  const addresses = {
    network: network.name,
    chainId: Number(network.chainId),
    oracleRegistry: oracleRegistryAddress,
    marketFactory: marketFactoryAddress,
    oracles: oracleAddresses,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    "deployed-addresses.json",
    JSON.stringify(addresses, null, 2)
  );
  console.log("\nAddresses saved to deployed-addresses.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
