import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "./components/Header";
import { Market } from "./components/Market";
import { CreateMarket } from "./components/CreateMarket";
import { useMarkets } from "./hooks/useMarket";
import spottedPattern from "./assets/marsu/spotted-pattern.jpeg";
import logo from "./assets/marsu/logo.jpeg";
import "./App.css";

const queryClient = new QueryClient();

function MarketList() {
  const { data: markets, isLoading, error } = useMarkets();

  if (isLoading) {
    return (
      <div className="loading">
        <img src={logo} alt="" className="loading-icon" />
        <span>Loading markets...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <p>Error loading markets.</p>
        <p className="error-hint">Make sure you're connected to the right network and contracts are deployed.</p>
      </div>
    );
  }

  if (!markets || markets.length === 0) {
    return (
      <div className="no-markets">
        <img src={logo} alt="" className="empty-icon" />
        <p>No markets yet.</p>
        <p className="hint">Create one to get started!</p>
      </div>
    );
  }

  return (
    <div className="markets-grid">
      {markets.map((address) => (
        <Market key={address} address={address} />
      ))}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <Header />
        <main>
          <div className="actions">
            <CreateMarket />
          </div>
          <MarketList />
        </main>
        <footer>
          <div
            className="footer-pattern"
            style={{ backgroundImage: `url(${spottedPattern})` }}
          />
          <div className="footer-content">
            <p>
              Built on{" "}
              <a href="https://oasisprotocol.org/sapphire" target="_blank" rel="noopener noreferrer">
                Oasis Sapphire
              </a>
            </p>
            <p className="footer-tagline">Your bets are private. Your wins are yours.</p>
          </div>
        </footer>
      </div>
    </QueryClientProvider>
  );
}

export default App;
