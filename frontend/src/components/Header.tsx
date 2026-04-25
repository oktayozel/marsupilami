import { useState, useEffect } from "react";
import { connectWallet, getProvider, switchToNetwork, HARDHAT_LOCAL, SAPPHIRE_TESTNET } from "../utils/sapphire";

export function Header() {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkConnection();

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", () => window.location.reload());
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      }
    };
  }, []);

  const handleAccountsChanged = (accounts: unknown) => {
    const accs = accounts as string[];
    if (accs.length === 0) {
      setAccount(null);
    } else {
      setAccount(accs[0]);
    }
  };

  const checkConnection = async () => {
    try {
      if (window.ethereum) {
        const provider = await getProvider();
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          setAccount(accounts[0].address);
        }
        const network = await provider.getNetwork();
        setChainId(network.chainId.toString());
      }
    } catch {
      // Not connected
    }
  };

  const handleConnect = async () => {
    try {
      setError(null);
      const addr = await connectWallet();
      setAccount(addr);
      await checkConnection();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSwitchToLocal = async () => {
    try {
      await switchToNetwork(HARDHAT_LOCAL);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSwitchToTestnet = async () => {
    try {
      await switchToNetwork(SAPPHIRE_TESTNET);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const getNetworkName = () => {
    if (!chainId) return "Unknown";
    if (chainId === "31337") return "Hardhat Local";
    if (chainId === "23295") return "Sapphire Testnet";
    return `Chain ${chainId}`;
  };

  return (
    <header>
      <div className="header-content">
        <h1>Marsupilami</h1>
        <p className="tagline">Privacy-Preserving Prediction Markets</p>
      </div>

      <div className="header-actions">
        {account ? (
          <>
            <div className="network-switcher">
              <button onClick={handleSwitchToLocal} className="btn btn-small">
                Local
              </button>
              <button onClick={handleSwitchToTestnet} className="btn btn-small">
                Testnet
              </button>
            </div>
            <div className="account-info">
              <span className="network">{getNetworkName()}</span>
              <span className="address">
                {account.slice(0, 6)}...{account.slice(-4)}
              </span>
            </div>
          </>
        ) : (
          <button onClick={handleConnect} className="btn btn-primary">
            Connect Wallet
          </button>
        )}
      </div>

      {error && <p className="header-error">{error}</p>}
    </header>
  );
}
