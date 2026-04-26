import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "../components/Header";
import { LiveFeed } from "../components/LiveFeed";
import spottedPattern from "../assets/marsu/spotted-pattern.jpeg";

const queryClient = new QueryClient();

export function DemoPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <Header />
        <main style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem" }}>
          <LiveFeed />
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
