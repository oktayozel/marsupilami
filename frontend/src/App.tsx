import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "./components/Header";
import { Market } from "./components/Market";
import { CreateMarket } from "./components/CreateMarket";
import { useMarkets } from "./hooks/useMarket";
import { DemoPage } from "./pages/DemoPage";
import logo from "./assets/marsu/logo.jpeg";
import allMarketsIcon from "./assets/new_images/all_markets.png";
import sportsIcon from "./assets/new_images/sports.png";
import politicsIcon from "./assets/new_images/politics.png";
import bostonIcon from "./assets/new_images/boston.png";
import blockchainIcon from "./assets/new_images/blockchain.png";
import otherIcon from "./assets/new_images/other.png";
import openMarketsIcon from "./assets/new_images/open-markets.png";
import createMarketsIcon from "./assets/new_images/create_markets.png";
import "./App.css";

const queryClient = new QueryClient();

export const CATEGORIES = [
  { id: "all", label: "All Markets", icon: allMarketsIcon },
  { id: "sports", label: "Sports", icon: sportsIcon },
  { id: "politics", label: "Politics", icon: politicsIcon },
  { id: "boston", label: "Boston", icon: bostonIcon },
  { id: "blockchain", label: "Blockchain\nCourse", icon: blockchainIcon },
  { id: "other", label: "Other", icon: otherIcon },
] as const;

export type CategoryId = typeof CATEGORIES[number]["id"];

export type StatusFilter = "all" | "open" | "closed";

export const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
];

export function parseCategory(question: string): { category: CategoryId; cleanQuestion: string } {
  const match = question.match(/^\[(\w+)\]\s*/i);
  if (match) {
    const categoryTag = match[1].toLowerCase();
    const cleanQuestion = question.slice(match[0].length);
    const category = CATEGORIES.find(c => c.id === categoryTag);
    if (category) {
      return { category: category.id, cleanQuestion };
    }
  }
  return { category: "other", cleanQuestion: question };
}

interface MarketListProps {
  selectedCategory: CategoryId;
  selectedStatus: StatusFilter;
}

function MarketList({ selectedCategory, selectedStatus }: MarketListProps) {
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
        <p className="hint">Go to "Create Market" tab to create one!</p>
      </div>
    );
  }

  return (
    <div className="markets-grid">
      {markets.map((address) => (
        <Market key={address} address={address} categoryFilter={selectedCategory} statusFilter={selectedStatus} />
      ))}
    </div>
  );
}

function MarketsTab() {
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("all");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("all");

  return (
    <div className="markets-tab">
      <div className="filters-row">
        <div className="category-filters">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              className={`category-btn ${selectedCategory === category.id ? "active" : ""}`}
              onClick={() => setSelectedCategory(category.id)}
              style={{ backgroundImage: `url(${category.icon})` }}
            >
              <span className="category-label">{category.label}</span>
            </button>
          ))}
        </div>
        <div className="status-filters">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status.id}
              className={`status-btn ${selectedStatus === status.id ? "active" : ""}`}
              onClick={() => setSelectedStatus(status.id)}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>
      <MarketList selectedCategory={selectedCategory} selectedStatus={selectedStatus} />
    </div>
  );
}

type TabId = "markets" | "create";

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("markets");

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/demo" element={<DemoPage />} />
        <Route path="*" element={
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <Header />

        <nav className="tabs-nav">
          <button
            className={`tab-btn ${activeTab === "markets" ? "active" : ""}`}
            onClick={() => setActiveTab("markets")}
            style={{ backgroundImage: `url(${openMarketsIcon})` }}
          >
            <span className="tab-label">Open Markets</span>
          </button>
          <button
            className={`tab-btn ${activeTab === "create" ? "active" : ""}`}
            onClick={() => setActiveTab("create")}
            style={{ backgroundImage: `url(${createMarketsIcon})` }}
          >
            <span className="tab-label">Create Market</span>
          </button>
        </nav>

        <main>
          {activeTab === "markets" && <MarketsTab />}
          {activeTab === "create" && <CreateMarket onSuccess={() => setActiveTab("markets")} />}
        </main>
      </div>
    </QueryClientProvider>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
