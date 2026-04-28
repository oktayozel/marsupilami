// Contract addresses from environment variables
// In Vite, env vars must be prefixed with VITE_

export const NETWORKS = {
  // Local Hardhat
  local: {
    chainId: BigInt(31337),
    rpcUrl: "http://localhost:8545",
    oracleRegistry: import.meta.env.VITE_LOCAL_ORACLE_REGISTRY || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    marketFactory: import.meta.env.VITE_LOCAL_MARKET_FACTORY || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  },
  // Sapphire Testnet
  testnet: {
    chainId: BigInt(0x5aff),
    rpcUrl: "https://testnet.sapphire.oasis.io",
    oracleRegistry: import.meta.env.VITE_TESTNET_ORACLE_REGISTRY || "0x1146513b90fACB2583a7D2317edBFAffdd885EF0",
    marketFactory: import.meta.env.VITE_TESTNET_MARKET_FACTORY || "0x20C62c1e24c450A26278a0790CdD12dcD95E57b5",
  },
};

// For backwards compatibility
export const CONTRACTS = {
  local: {
    oracleRegistry: NETWORKS.local.oracleRegistry,
    marketFactory: NETWORKS.local.marketFactory,
  },
  testnet: {
    oracleRegistry: NETWORKS.testnet.oracleRegistry,
    marketFactory: NETWORKS.testnet.marketFactory,
  },
};

// Default network: 'local' or 'testnet'
export const DEFAULT_NETWORK = import.meta.env.VITE_DEFAULT_NETWORK || "testnet";

export function getContracts(chainId: bigint) {
  if (chainId === NETWORKS.local.chainId) {
    return CONTRACTS.local;
  }
  if (chainId === NETWORKS.testnet.chainId) {
    return CONTRACTS.testnet;
  }
  // Fallback based on default network setting
  return DEFAULT_NETWORK === "testnet" ? CONTRACTS.testnet : CONTRACTS.local;
}

export function getRpcUrl(chainId: bigint): string {
  if (chainId === NETWORKS.local.chainId) {
    return NETWORKS.local.rpcUrl;
  }
  if (chainId === NETWORKS.testnet.chainId) {
    return NETWORKS.testnet.rpcUrl;
  }
  // Fallback based on default network setting
  return DEFAULT_NETWORK === "testnet" ? NETWORKS.testnet.rpcUrl : NETWORKS.local.rpcUrl;
}

export function getDefaultRpcUrl(): string {
  return DEFAULT_NETWORK === "testnet" ? NETWORKS.testnet.rpcUrl : NETWORKS.local.rpcUrl;
}

export function getDefaultChainId(): bigint {
  return DEFAULT_NETWORK === "testnet" ? NETWORKS.testnet.chainId : NETWORKS.local.chainId;
}
