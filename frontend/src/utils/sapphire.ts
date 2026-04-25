import { BrowserProvider, JsonRpcSigner } from "ethers";
import { wrapEthereumProvider } from "@oasisprotocol/sapphire-paratime";

export const SAPPHIRE_TESTNET = {
  chainId: "0x5aff",
  chainName: "Oasis Sapphire Testnet",
  nativeCurrency: { name: "TEST", symbol: "TEST", decimals: 18 },
  rpcUrls: ["https://testnet.sapphire.oasis.io"],
  blockExplorerUrls: ["https://explorer.oasis.io/testnet/sapphire"],
};

export const HARDHAT_LOCAL = {
  chainId: "0x7a69", // 31337
  chainName: "Hardhat Local",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["http://localhost:8545"],
  blockExplorerUrls: [],
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

export async function connectWallet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error("Please install MetaMask");
  }

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  }) as string[];

  return accounts[0];
}

export async function getProvider(): Promise<BrowserProvider> {
  if (!window.ethereum) {
    throw new Error("Please install MetaMask");
  }

  // Check current network
  const chainId = await window.ethereum.request({ method: "eth_chainId" }) as string;

  // If on Sapphire, wrap the provider for encryption
  if (chainId === "0x5aff") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrappedEthereum = wrapEthereumProvider(window.ethereum as any);
    return new BrowserProvider(wrappedEthereum);
  }

  // For local development, use unwrapped provider
  return new BrowserProvider(window.ethereum);
}

export async function getSigner(): Promise<JsonRpcSigner> {
  const provider = await getProvider();
  return provider.getSigner();
}

export async function switchToNetwork(network: typeof SAPPHIRE_TESTNET | typeof HARDHAT_LOCAL): Promise<void> {
  if (!window.ethereum) {
    throw new Error("Please install MetaMask");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainId }],
    });
  } catch (switchError: unknown) {
    const error = switchError as { code?: number };
    if (error.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [network],
      });
    } else {
      throw switchError;
    }
  }
}
