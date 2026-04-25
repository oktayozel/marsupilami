// Contract addresses - update these after deployment
export const CONTRACTS = {
  // Local Hardhat (default addresses)
  local: {
    oracleRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    marketFactory: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  },
  // Sapphire Testnet - update after deployment
  testnet: {
    oracleRegistry: "",
    marketFactory: "",
  },
};

export function getContracts(chainId: bigint) {
  if (chainId === BigInt(31337)) {
    return CONTRACTS.local;
  }
  if (chainId === BigInt(0x5aff)) {
    return CONTRACTS.testnet;
  }
  return CONTRACTS.local;
}
