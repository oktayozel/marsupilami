import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@oasisprotocol/sapphire-hardhat";
import "dotenv/config";

// Normalize private key (remove 0x prefix if present)
const privateKey = process.env.PRIVATE_KEY?.startsWith("0x")
  ? process.env.PRIVATE_KEY.slice(2)
  : process.env.PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    sapphire_testnet: {
      url: "https://testnet.sapphire.oasis.io",
      chainId: 0x5aff,
      accounts: privateKey ? [privateKey] : [],
    },
    sapphire_localnet: {
      url: "http://localhost:8545",
      chainId: 0x5afd,
      accounts: privateKey ? [privateKey] : [],
    },
  },
};

export default config;
