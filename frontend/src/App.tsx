import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "./components/Header";
import { Market } from "./components/Market";
import { CreateMarket } from "./components/CreateMarket";
import { useMarkets } from "./hooks/useMarket";
import "./App.css";

const queryClient = new QueryClient();

function MarketList() {
  const { data: markets, isLoading, error } = useMarkets();

  if (isLoading) {
    return <div className="loading">Loading markets...</div>;
  }

  if (error) {
    return (
      <div className="error-message">
        Error loading markets. Make sure you're connected to the right network
        and contracts are deployed.
      </div>
    );
  }

  if (!markets || markets.length === 0) {
    return (
      <div className="no-markets">
        <p>No markets yet. Create one to get started!</p>
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
          <p>
            Built on{" "}
            <a href="https://oasisprotocol.org/sapphire" target="_blank">
              Oasis Sapphire
            </a>{" "}
            - Your bets are private
          </p>
        </footer>
      </div>
    </QueryClientProvider>
  );
}

export default App;
