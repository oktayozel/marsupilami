# Marsupilami Implementation Plan

## Overview

A privacy-preserving prediction market on Oasis Sapphire with:
- Encrypted bet choices (YES/NO hidden)
- Staked oracle system for resolution
- Pari-mutuel reward distribution
- Temporal batching for odds privacy

---

## Phase 1: Project Setup (Day 1-2)

### 1.1 Initialize Hardhat Project

```bash
mkdir contracts frontend
cd contracts
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init  # Select "Create a TypeScript project"
```

### 1.2 Install Oasis Sapphire Dependencies

```bash
npm install --save-dev @oasisprotocol/sapphire-hardhat
npm install @oasisprotocol/sapphire-paratime
```

### 1.3 Configure Hardhat for Sapphire

**hardhat.config.ts:**
```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@oasisprotocol/sapphire-hardhat";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    sapphire_testnet: {
      url: "https://testnet.sapphire.oasis.io",
      chainId: 0x5aff,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    sapphire_localnet: {
      url: "http://localhost:8545",
      chainId: 0x5afd,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    }
  }
};

export default config;
```

### 1.4 Project Structure

```
marsupilami/
├── contracts/
│   ├── contracts/
│   │   ├── MarketFactory.sol      # Creates new markets
│   │   ├── PredictionMarket.sol   # Core market logic
│   │   ├── OracleRegistry.sol     # Staked oracle management
│   │   └── interfaces/
│   │       └── IPredictionMarket.sol
│   ├── scripts/
│   │   ├── deploy.ts
│   │   └── createMarket.ts
│   ├── test/
│   │   └── PredictionMarket.test.ts
│   └── hardhat.config.ts
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── App.tsx
│   └── package.json
└── IMPLEMENTATION_PLAN.md
```

---

## Phase 2: Smart Contract Architecture (Day 3-5)

### 2.1 Contract Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      MarketFactory                          │
│  - Creates new PredictionMarket instances                   │
│  - Tracks all markets                                       │
│  - References OracleRegistry                                │
└─────────────────────┬───────────────────────────────────────┘
                      │ creates
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    PredictionMarket                         │
│  PRIVATE STATE (hidden by TEE):                             │
│  - mapping(address => Position) userPositions               │
│  - uint256 yesPool, noPool                                  │
│  - uint256 pendingYes, pendingNo (batch accumulator)        │
│                                                             │
│  PUBLIC STATE:                                              │
│  - string question                                          │
│  - uint256 bettingDeadline                                  │
│  - uint256 lastOddsUpdate                                   │
│  - uint256 publicYesPool, publicNoPool (batched)            │
│  - Outcome resolved outcome                                 │
└─────────────────────────────────────────────────────────────┘
                      │ queries
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    OracleRegistry                           │
│  - Oracles stake ROSE to register                           │
│  - Tracks oracle reputation                                 │
│  - Handles dispute resolution via majority vote             │
│  - Slashes dishonest oracles                                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Data Structures

```solidity
// Bet choice - this is what we keep private
enum Choice { YES, NO }

// Market outcome - set after resolution
enum Outcome { UNRESOLVED, YES, NO, INVALID }

// Market state machine
enum MarketState { OPEN, CLOSED, RESOLVED, CANCELLED }

// User's position (PRIVATE - stored encrypted in TEE)
struct Position {
    uint256 yesAmount;
    uint256 noAmount;
    bool hasClaimed;
}

// Oracle vote for resolution
struct OracleVote {
    Outcome vote;
    uint256 timestamp;
}
```

---

## Phase 3: Oracle Registry Contract (Day 6-8)

### 3.1 OracleRegistry.sol

This is the **simplest viable oracle system** using stake + majority consensus.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OracleRegistry {

    // ============ Constants ============
    uint256 public constant MIN_STAKE = 100 ether;        // 100 ROSE minimum
    uint256 public constant SLASH_PERCENT = 50;           // 50% slash for wrong vote
    uint256 public constant MIN_ORACLES_FOR_RESOLUTION = 3;

    // ============ State ============
    struct Oracle {
        uint256 stake;
        uint256 successfulResolutions;
        uint256 failedResolutions;
        bool isActive;
    }

    mapping(address => Oracle) public oracles;
    address[] public oracleList;

    // ============ Events ============
    event OracleRegistered(address indexed oracle, uint256 stake);
    event OracleUnregistered(address indexed oracle, uint256 returned);
    event OracleSlashed(address indexed oracle, uint256 amount);

    // ============ Modifiers ============
    modifier onlyOracle() {
        require(oracles[msg.sender].isActive, "Not an active oracle");
        _;
    }

    // ============ External Functions ============

    /// @notice Register as an oracle by staking ROSE
    function register() external payable {
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(!oracles[msg.sender].isActive, "Already registered");

        oracles[msg.sender] = Oracle({
            stake: msg.value,
            successfulResolutions: 0,
            failedResolutions: 0,
            isActive: true
        });
        oracleList.push(msg.sender);

        emit OracleRegistered(msg.sender, msg.value);
    }

    /// @notice Unregister and withdraw stake (if not in active dispute)
    function unregister() external onlyOracle {
        Oracle storage oracle = oracles[msg.sender];
        uint256 toReturn = oracle.stake;

        oracle.isActive = false;
        oracle.stake = 0;

        // Remove from list (swap and pop)
        for (uint i = 0; i < oracleList.length; i++) {
            if (oracleList[i] == msg.sender) {
                oracleList[i] = oracleList[oracleList.length - 1];
                oracleList.pop();
                break;
            }
        }

        payable(msg.sender).transfer(toReturn);
        emit OracleUnregistered(msg.sender, toReturn);
    }

    /// @notice Check if address is an active oracle
    function isOracle(address addr) external view returns (bool) {
        return oracles[addr].isActive;
    }

    /// @notice Get number of active oracles
    function getOracleCount() external view returns (uint256) {
        return oracleList.length;
    }

    /// @notice Slash an oracle's stake (called by PredictionMarket)
    function slash(address oracle, uint256 percent) external {
        // In production, add access control here
        Oracle storage o = oracles[oracle];
        uint256 slashAmount = (o.stake * percent) / 100;
        o.stake -= slashAmount;
        o.failedResolutions++;

        emit OracleSlashed(oracle, slashAmount);
    }

    /// @notice Reward oracle for correct resolution
    function recordSuccess(address oracle) external {
        oracles[oracle].successfulResolutions++;
    }
}
```

---

## Phase 4: Prediction Market Contract (Day 9-15)

### 4.1 PredictionMarket.sol - Core Implementation

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./OracleRegistry.sol";

contract PredictionMarket {

    // ============ Enums ============
    enum Choice { YES, NO }
    enum Outcome { UNRESOLVED, YES, NO, INVALID }
    enum MarketState { OPEN, CLOSED, RESOLVED, CANCELLED }

    // ============ Structs ============
    struct Position {
        uint256 yesAmount;
        uint256 noAmount;
        bool hasClaimed;
    }

    struct OracleVote {
        Outcome vote;
        bool hasVoted;
    }

    // ============ Constants ============
    uint256 public constant ODDS_UPDATE_INTERVAL = 5 minutes;
    uint256 public constant RESOLUTION_WINDOW = 24 hours;
    uint256 public constant MIN_BET = 0.01 ether;

    // ============ Immutables ============
    OracleRegistry public immutable oracleRegistry;
    address public immutable creator;
    string public question;
    uint256 public immutable bettingDeadline;
    uint256 public immutable resolutionDeadline;

    // ============ Public State (visible on-chain) ============
    MarketState public state;
    Outcome public outcome;
    uint256 public lastOddsUpdate;
    uint256 public publicYesPool;    // Updated only at intervals
    uint256 public publicNoPool;     // Updated only at intervals
    uint256 public totalDeposits;

    // ============ PRIVATE State (hidden by TEE) ============
    // These are confidential - only accessible inside the enclave
    uint256 private yesPool;
    uint256 private noPool;
    uint256 private pendingYesPool;  // Accumulates between updates
    uint256 private pendingNoPool;
    mapping(address => Position) private positions;
    address[] private bettors;

    // Oracle resolution
    mapping(address => OracleVote) public oracleVotes;
    address[] public votedOracles;
    uint256 public yesVotes;
    uint256 public noVotes;
    uint256 public invalidVotes;

    // ============ Events ============
    event BetPlaced(address indexed user, uint256 amount);  // Note: choice NOT emitted
    event OddsUpdated(uint256 yesPool, uint256 noPool, uint256 timestamp);
    event MarketClosed(uint256 timestamp);
    event MarketResolved(Outcome outcome);
    event RewardClaimed(address indexed user, uint256 amount);
    event OracleVoted(address indexed oracle, uint256 timestamp);  // vote NOT emitted

    // ============ Modifiers ============
    modifier onlyOpen() {
        require(state == MarketState.OPEN, "Market not open");
        require(block.timestamp < bettingDeadline, "Betting period ended");
        _;
    }

    modifier onlyClosed() {
        require(state == MarketState.CLOSED, "Market not closed");
        _;
    }

    modifier onlyResolved() {
        require(state == MarketState.RESOLVED, "Market not resolved");
        _;
    }

    // ============ Constructor ============
    constructor(
        address _oracleRegistry,
        string memory _question,
        uint256 _bettingDuration
    ) {
        oracleRegistry = OracleRegistry(_oracleRegistry);
        creator = msg.sender;
        question = _question;
        bettingDeadline = block.timestamp + _bettingDuration;
        resolutionDeadline = bettingDeadline + RESOLUTION_WINDOW;
        state = MarketState.OPEN;
        lastOddsUpdate = block.timestamp;
    }

    // ============ Core Betting Functions ============

    /// @notice Place a private bet
    /// @param choice The bet choice (YES=0, NO=1) - this parameter is encrypted by Sapphire
    function placeBet(Choice choice) external payable onlyOpen {
        require(msg.value >= MIN_BET, "Bet too small");

        // Update user's position (PRIVATE)
        Position storage pos = positions[msg.sender];
        if (pos.yesAmount == 0 && pos.noAmount == 0) {
            bettors.push(msg.sender);
        }

        // Add to pending pools (will be revealed at next interval)
        if (choice == Choice.YES) {
            pos.yesAmount += msg.value;
            pendingYesPool += msg.value;
            yesPool += msg.value;
        } else {
            pos.noAmount += msg.value;
            pendingNoPool += msg.value;
            noPool += msg.value;
        }

        totalDeposits += msg.value;

        // Check if we should update public odds
        _maybeUpdateOdds();

        // Emit event WITHOUT the choice
        emit BetPlaced(msg.sender, msg.value);
    }

    /// @notice Update public odds if interval has passed
    function _maybeUpdateOdds() internal {
        if (block.timestamp >= lastOddsUpdate + ODDS_UPDATE_INTERVAL) {
            // Move pending pools to public pools
            publicYesPool += pendingYesPool;
            publicNoPool += pendingNoPool;
            pendingYesPool = 0;
            pendingNoPool = 0;
            lastOddsUpdate = block.timestamp;

            emit OddsUpdated(publicYesPool, publicNoPool, block.timestamp);
        }
    }

    /// @notice Force odds update (anyone can call after interval)
    function updateOdds() external {
        require(
            block.timestamp >= lastOddsUpdate + ODDS_UPDATE_INTERVAL,
            "Too soon"
        );
        _maybeUpdateOdds();
    }

    // ============ Market Lifecycle ============

    /// @notice Close the market for betting (anyone can call after deadline)
    function closeMarket() external {
        require(state == MarketState.OPEN, "Not open");
        require(block.timestamp >= bettingDeadline, "Betting period not ended");

        state = MarketState.CLOSED;

        // Final odds update
        publicYesPool = yesPool;
        publicNoPool = noPool;

        emit MarketClosed(block.timestamp);
    }

    // ============ Oracle Resolution ============

    /// @notice Oracle submits their resolution vote
    /// @param _outcome The oracle's vote (YES=1, NO=2, INVALID=3)
    function submitResolution(Outcome _outcome) external onlyClosed {
        require(oracleRegistry.isOracle(msg.sender), "Not an oracle");
        require(!oracleVotes[msg.sender].hasVoted, "Already voted");
        require(_outcome != Outcome.UNRESOLVED, "Invalid vote");
        require(block.timestamp < resolutionDeadline, "Resolution window closed");

        oracleVotes[msg.sender] = OracleVote({
            vote: _outcome,
            hasVoted: true
        });
        votedOracles.push(msg.sender);

        if (_outcome == Outcome.YES) yesVotes++;
        else if (_outcome == Outcome.NO) noVotes++;
        else invalidVotes++;

        emit OracleVoted(msg.sender, block.timestamp);

        // Check if we have enough votes to resolve
        _maybeResolve();
    }

    /// @notice Check if consensus reached and resolve
    function _maybeResolve() internal {
        uint256 totalVotes = votedOracles.length;
        uint256 required = oracleRegistry.getOracleCount();

        // Need at least 3 oracles or all registered oracles
        if (totalVotes < 3 && totalVotes < required) {
            return;
        }

        // Check for 2/3 majority
        uint256 majorityThreshold = (totalVotes * 2) / 3;

        if (yesVotes > majorityThreshold) {
            _resolve(Outcome.YES);
        } else if (noVotes > majorityThreshold) {
            _resolve(Outcome.NO);
        } else if (invalidVotes > majorityThreshold) {
            _resolve(Outcome.INVALID);
        }
        // Otherwise, wait for more votes
    }

    /// @notice Finalize resolution and handle slashing
    function _resolve(Outcome _outcome) internal {
        outcome = _outcome;
        state = MarketState.RESOLVED;

        // Slash oracles who voted against consensus
        for (uint i = 0; i < votedOracles.length; i++) {
            address oracle = votedOracles[i];
            if (oracleVotes[oracle].vote != _outcome) {
                oracleRegistry.slash(oracle, 10);  // 10% slash for minority vote
            } else {
                oracleRegistry.recordSuccess(oracle);
            }
        }

        emit MarketResolved(_outcome);
    }

    /// @notice Emergency resolution if oracles don't respond
    function forceResolve() external {
        require(state == MarketState.CLOSED, "Not closed");
        require(block.timestamp > resolutionDeadline, "Resolution window not over");
        require(votedOracles.length > 0, "No votes submitted");

        // Resolve with plurality (not majority)
        if (yesVotes >= noVotes && yesVotes >= invalidVotes) {
            _resolve(Outcome.YES);
        } else if (noVotes >= invalidVotes) {
            _resolve(Outcome.NO);
        } else {
            _resolve(Outcome.INVALID);
        }
    }

    // ============ Claiming ============

    /// @notice Claim winnings after resolution
    function claim() external onlyResolved {
        Position storage pos = positions[msg.sender];
        require(!pos.hasClaimed, "Already claimed");
        require(pos.yesAmount > 0 || pos.noAmount > 0, "No position");

        uint256 payout = 0;

        if (outcome == Outcome.INVALID) {
            // Refund all bets
            payout = pos.yesAmount + pos.noAmount;
        } else if (outcome == Outcome.YES) {
            // Pari-mutuel: winner gets proportional share of total pool
            // payout = userYesBet * (totalPool / yesPool)
            if (pos.yesAmount > 0) {
                uint256 totalPool = yesPool + noPool;
                payout = (pos.yesAmount * totalPool) / yesPool;
            }
        } else if (outcome == Outcome.NO) {
            if (pos.noAmount > 0) {
                uint256 totalPool = yesPool + noPool;
                payout = (pos.noAmount * totalPool) / noPool;
            }
        }

        pos.hasClaimed = true;

        if (payout > 0) {
            payable(msg.sender).transfer(payout);
            emit RewardClaimed(msg.sender, payout);
        }
    }

    // ============ View Functions ============

    /// @notice Get current public odds (YES probability in basis points)
    function getOdds() external view returns (uint256 yesBps, uint256 noBps) {
        uint256 total = publicYesPool + publicNoPool;
        if (total == 0) {
            return (5000, 5000);  // 50-50 default
        }
        yesBps = (publicYesPool * 10000) / total;
        noBps = 10000 - yesBps;
    }

    /// @notice Get user's position (only callable by the user themselves)
    /// This is a PRIVATE view - Sapphire will only return data to the caller
    function getMyPosition() external view returns (
        uint256 yesAmount,
        uint256 noAmount,
        bool hasClaimed
    ) {
        Position storage pos = positions[msg.sender];
        return (pos.yesAmount, pos.noAmount, pos.hasClaimed);
    }

    /// @notice Get market info
    function getMarketInfo() external view returns (
        string memory _question,
        uint256 _bettingDeadline,
        uint256 _resolutionDeadline,
        MarketState _state,
        Outcome _outcome,
        uint256 _publicYesPool,
        uint256 _publicNoPool,
        uint256 _totalDeposits
    ) {
        return (
            question,
            bettingDeadline,
            resolutionDeadline,
            state,
            outcome,
            publicYesPool,
            publicNoPool,
            totalDeposits
        );
    }
}
```

### 4.2 MarketFactory.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PredictionMarket.sol";
import "./OracleRegistry.sol";

contract MarketFactory {

    OracleRegistry public immutable oracleRegistry;
    address[] public allMarkets;

    event MarketCreated(
        address indexed market,
        address indexed creator,
        string question,
        uint256 bettingDeadline
    );

    constructor(address _oracleRegistry) {
        oracleRegistry = OracleRegistry(_oracleRegistry);
    }

    /// @notice Create a new prediction market
    /// @param question The question to predict
    /// @param bettingDuration How long betting is open (in seconds)
    function createMarket(
        string calldata question,
        uint256 bettingDuration
    ) external returns (address) {
        require(bettingDuration >= 1 hours, "Duration too short");
        require(bettingDuration <= 30 days, "Duration too long");
        require(bytes(question).length > 0, "Empty question");
        require(bytes(question).length <= 500, "Question too long");

        PredictionMarket market = new PredictionMarket(
            address(oracleRegistry),
            question,
            bettingDuration
        );

        allMarkets.push(address(market));

        emit MarketCreated(
            address(market),
            msg.sender,
            question,
            block.timestamp + bettingDuration
        );

        return address(market);
    }

    /// @notice Get total number of markets
    function getMarketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    /// @notice Get markets with pagination
    function getMarkets(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory)
    {
        uint256 total = allMarkets.length;
        if (offset >= total) {
            return new address[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = allMarkets[i];
        }
        return result;
    }
}
```

---

## Phase 5: Deployment Scripts (Day 16-17)

### 5.1 Deploy Script

**scripts/deploy.ts:**
```typescript
import { ethers } from "hardhat";
import * as sapphire from "@oasisprotocol/sapphire-paratime";

async function main() {
  // Wrap provider for Sapphire encryption
  const baseProvider = ethers.provider;
  const wrappedProvider = sapphire.wrap(baseProvider);

  // Get signer and wrap it
  const [deployer] = await ethers.getSigners();
  const wrappedSigner = sapphire.wrap(deployer);

  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await baseProvider.getBalance(deployer.address)));

  // 1. Deploy OracleRegistry
  console.log("\nDeploying OracleRegistry...");
  const OracleRegistry = await ethers.getContractFactory("OracleRegistry", wrappedSigner);
  const oracleRegistry = await OracleRegistry.deploy();
  await oracleRegistry.waitForDeployment();
  const oracleRegistryAddress = await oracleRegistry.getAddress();
  console.log("OracleRegistry deployed to:", oracleRegistryAddress);

  // 2. Deploy MarketFactory
  console.log("\nDeploying MarketFactory...");
  const MarketFactory = await ethers.getContractFactory("MarketFactory", wrappedSigner);
  const marketFactory = await MarketFactory.deploy(oracleRegistryAddress);
  await marketFactory.waitForDeployment();
  const marketFactoryAddress = await marketFactory.getAddress();
  console.log("MarketFactory deployed to:", marketFactoryAddress);

  // Output deployment info
  console.log("\n========================================");
  console.log("Deployment Complete!");
  console.log("========================================");
  console.log("OracleRegistry:", oracleRegistryAddress);
  console.log("MarketFactory:", marketFactoryAddress);
  console.log("========================================");

  // Save addresses to file
  const fs = require("fs");
  const addresses = {
    network: "sapphire_testnet",
    oracleRegistry: oracleRegistryAddress,
    marketFactory: marketFactoryAddress,
    deployedAt: new Date().toISOString()
  };
  fs.writeFileSync(
    "deployed-addresses.json",
    JSON.stringify(addresses, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

### 5.2 Create Market Script

**scripts/createMarket.ts:**
```typescript
import { ethers } from "hardhat";
import * as sapphire from "@oasisprotocol/sapphire-paratime";
import addresses from "../deployed-addresses.json";

async function main() {
  const [signer] = await ethers.getSigners();
  const wrappedSigner = sapphire.wrap(signer);

  const factory = await ethers.getContractAt(
    "MarketFactory",
    addresses.marketFactory,
    wrappedSigner
  );

  // Create a test market (7 days duration)
  const question = "Will ETH be above $5000 on May 1, 2026?";
  const duration = 7 * 24 * 60 * 60; // 7 days in seconds

  console.log("Creating market:", question);
  const tx = await factory.createMarket(question, duration);
  const receipt = await tx.wait();

  // Get market address from event
  const event = receipt?.logs.find(
    (log: any) => log.fragment?.name === "MarketCreated"
  );

  console.log("Market created at:", event?.args?.market);
}

main().catch(console.error);
```

---

## Phase 6: Frontend Implementation (Day 18-25)

### 6.1 Initialize React Project

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install ethers@6 @oasisprotocol/sapphire-paratime
npm install @tanstack/react-query
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 6.2 Sapphire Provider Wrapper

**src/utils/sapphire.ts:**
```typescript
import { BrowserProvider, JsonRpcSigner } from "ethers";
import * as sapphire from "@oasisprotocol/sapphire-paratime";

export const SAPPHIRE_TESTNET = {
  chainId: "0x5aff",
  chainName: "Oasis Sapphire Testnet",
  nativeCurrency: { name: "TEST", symbol: "TEST", decimals: 18 },
  rpcUrls: ["https://testnet.sapphire.oasis.io"],
  blockExplorerUrls: ["https://explorer.oasis.io/testnet/sapphire"],
};

export async function getSapphireProvider(): Promise<BrowserProvider> {
  if (!window.ethereum) {
    throw new Error("Please install MetaMask");
  }

  // Request account access
  await window.ethereum.request({ method: "eth_requestAccounts" });

  // Check/switch network
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId !== SAPPHIRE_TESTNET.chainId) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SAPPHIRE_TESTNET.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [SAPPHIRE_TESTNET],
        });
      }
    }
  }

  // Create and wrap provider
  const provider = new BrowserProvider(window.ethereum);
  return sapphire.wrap(provider) as unknown as BrowserProvider;
}

export async function getSapphireSigner(): Promise<JsonRpcSigner> {
  const provider = await getSapphireProvider();
  const signer = await provider.getSigner();
  return sapphire.wrap(signer) as unknown as JsonRpcSigner;
}
```

### 6.3 Contract Hooks

**src/hooks/useMarket.ts:**
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ethers } from "ethers";
import { getSapphireSigner, getSapphireProvider } from "../utils/sapphire";
import PredictionMarketABI from "../abi/PredictionMarket.json";

export function useMarketInfo(marketAddress: string) {
  return useQuery({
    queryKey: ["market", marketAddress],
    queryFn: async () => {
      const provider = await getSapphireProvider();
      const market = new ethers.Contract(
        marketAddress,
        PredictionMarketABI,
        provider
      );
      const info = await market.getMarketInfo();
      const odds = await market.getOdds();

      return {
        question: info._question,
        bettingDeadline: Number(info._bettingDeadline),
        state: Number(info._state),
        outcome: Number(info._outcome),
        yesPool: ethers.formatEther(info._publicYesPool),
        noPool: ethers.formatEther(info._publicNoPool),
        totalDeposits: ethers.formatEther(info._totalDeposits),
        yesOdds: Number(odds.yesBps) / 100,
        noOdds: Number(odds.noBps) / 100,
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useMyPosition(marketAddress: string) {
  return useQuery({
    queryKey: ["position", marketAddress],
    queryFn: async () => {
      const signer = await getSapphireSigner();
      const market = new ethers.Contract(
        marketAddress,
        PredictionMarketABI,
        signer
      );

      // This call is encrypted - only the caller can see their position
      const position = await market.getMyPosition();

      return {
        yesAmount: ethers.formatEther(position.yesAmount),
        noAmount: ethers.formatEther(position.noAmount),
        hasClaimed: position.hasClaimed,
      };
    },
  });
}

export function usePlaceBet(marketAddress: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ choice, amount }: { choice: 0 | 1; amount: string }) => {
      const signer = await getSapphireSigner();
      const market = new ethers.Contract(
        marketAddress,
        PredictionMarketABI,
        signer
      );

      // The 'choice' parameter is automatically encrypted by Sapphire
      const tx = await market.placeBet(choice, {
        value: ethers.parseEther(amount),
      });

      return tx.wait();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market", marketAddress] });
      queryClient.invalidateQueries({ queryKey: ["position", marketAddress] });
    },
  });
}

export function useClaim(marketAddress: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const signer = await getSapphireSigner();
      const market = new ethers.Contract(
        marketAddress,
        PredictionMarketABI,
        signer
      );

      const tx = await market.claim();
      return tx.wait();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position", marketAddress] });
    },
  });
}
```

### 6.4 Market Component

**src/components/Market.tsx:**
```tsx
import React, { useState } from "react";
import { useMarketInfo, useMyPosition, usePlaceBet, useClaim } from "../hooks/useMarket";

const STATES = ["Open", "Closed", "Resolved", "Cancelled"];
const OUTCOMES = ["Unresolved", "YES", "NO", "Invalid"];

export function Market({ address }: { address: string }) {
  const { data: market, isLoading } = useMarketInfo(address);
  const { data: position } = useMyPosition(address);
  const placeBet = usePlaceBet(address);
  const claim = useClaim(address);

  const [amount, setAmount] = useState("0.1");

  if (isLoading || !market) return <div>Loading...</div>;

  const deadline = new Date(market.bettingDeadline * 1000);
  const isOpen = market.state === 0 && Date.now() < deadline.getTime();
  const isResolved = market.state === 2;

  return (
    <div className="p-6 border rounded-lg max-w-xl">
      <h2 className="text-xl font-bold mb-4">{market.question}</h2>

      {/* Status */}
      <div className="mb-4 text-sm text-gray-600">
        <p>Status: {STATES[market.state]}</p>
        <p>Deadline: {deadline.toLocaleString()}</p>
        {isResolved && <p>Outcome: {OUTCOMES[market.outcome]}</p>}
      </div>

      {/* Odds Display */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 p-4 bg-green-100 rounded">
          <div className="text-lg font-bold text-green-700">YES</div>
          <div className="text-2xl">{market.yesOdds.toFixed(1)}%</div>
          <div className="text-sm text-gray-500">{market.yesPool} ROSE</div>
        </div>
        <div className="flex-1 p-4 bg-red-100 rounded">
          <div className="text-lg font-bold text-red-700">NO</div>
          <div className="text-2xl">{market.noOdds.toFixed(1)}%</div>
          <div className="text-sm text-gray-500">{market.noPool} ROSE</div>
        </div>
      </div>

      {/* Betting UI */}
      {isOpen && (
        <div className="mb-6">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border p-2 rounded w-full mb-2"
            placeholder="Amount in ROSE"
            step="0.01"
            min="0.01"
          />
          <div className="flex gap-2">
            <button
              onClick={() => placeBet.mutate({ choice: 0, amount })}
              disabled={placeBet.isPending}
              className="flex-1 bg-green-500 text-white p-3 rounded hover:bg-green-600 disabled:opacity-50"
            >
              {placeBet.isPending ? "Placing..." : "Bet YES"}
            </button>
            <button
              onClick={() => placeBet.mutate({ choice: 1, amount })}
              disabled={placeBet.isPending}
              className="flex-1 bg-red-500 text-white p-3 rounded hover:bg-red-600 disabled:opacity-50"
            >
              {placeBet.isPending ? "Placing..." : "Bet NO"}
            </button>
          </div>
        </div>
      )}

      {/* User Position */}
      {position && (position.yesAmount !== "0.0" || position.noAmount !== "0.0") && (
        <div className="p-4 bg-gray-100 rounded mb-4">
          <h3 className="font-bold mb-2">Your Position (Private)</h3>
          <p>YES: {position.yesAmount} ROSE</p>
          <p>NO: {position.noAmount} ROSE</p>

          {isResolved && !position.hasClaimed && (
            <button
              onClick={() => claim.mutate()}
              disabled={claim.isPending}
              className="mt-2 bg-blue-500 text-white p-2 rounded w-full"
            >
              {claim.isPending ? "Claiming..." : "Claim Winnings"}
            </button>
          )}
          {position.hasClaimed && (
            <p className="mt-2 text-green-600">✓ Claimed</p>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Phase 7: Testing (Day 26-28)

### 7.1 Unit Tests

**test/PredictionMarket.test.ts:**
```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("PredictionMarket", function () {
  let oracleRegistry: any;
  let marketFactory: any;
  let market: any;
  let owner: any, oracle1: any, oracle2: any, oracle3: any;
  let user1: any, user2: any;

  beforeEach(async function () {
    [owner, oracle1, oracle2, oracle3, user1, user2] = await ethers.getSigners();

    // Deploy OracleRegistry
    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    oracleRegistry = await OracleRegistry.deploy();

    // Deploy MarketFactory
    const MarketFactory = await ethers.getContractFactory("MarketFactory");
    marketFactory = await MarketFactory.deploy(await oracleRegistry.getAddress());

    // Register oracles
    await oracleRegistry.connect(oracle1).register({ value: ethers.parseEther("100") });
    await oracleRegistry.connect(oracle2).register({ value: ethers.parseEther("100") });
    await oracleRegistry.connect(oracle3).register({ value: ethers.parseEther("100") });

    // Create a market
    const tx = await marketFactory.createMarket(
      "Will it rain tomorrow?",
      24 * 60 * 60 // 1 day
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find((l: any) => l.fragment?.name === "MarketCreated");
    const marketAddress = event.args.market;

    market = await ethers.getContractAt("PredictionMarket", marketAddress);
  });

  describe("Betting", function () {
    it("should accept bets", async function () {
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("1") }); // YES
      await market.connect(user2).placeBet(1, { value: ethers.parseEther("2") }); // NO

      const info = await market.getMarketInfo();
      expect(info._totalDeposits).to.equal(ethers.parseEther("3"));
    });

    it("should reject bets after deadline", async function () {
      await time.increase(25 * 60 * 60); // 25 hours

      await expect(
        market.connect(user1).placeBet(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Betting period ended");
    });

    it("should allow user to see their own position", async function () {
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("1") });

      const position = await market.connect(user1).getMyPosition();
      expect(position.yesAmount).to.equal(ethers.parseEther("1"));
      expect(position.noAmount).to.equal(0);
    });
  });

  describe("Resolution", function () {
    beforeEach(async function () {
      // Place bets
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("10") }); // YES
      await market.connect(user2).placeBet(1, { value: ethers.parseEther("5") });  // NO

      // Close market
      await time.increase(25 * 60 * 60);
      await market.closeMarket();
    });

    it("should resolve with majority YES", async function () {
      await market.connect(oracle1).submitResolution(1); // YES
      await market.connect(oracle2).submitResolution(1); // YES
      await market.connect(oracle3).submitResolution(1); // YES

      expect(await market.outcome()).to.equal(1); // YES
      expect(await market.state()).to.equal(2);   // RESOLVED
    });

    it("should allow winner to claim", async function () {
      await market.connect(oracle1).submitResolution(1); // YES
      await market.connect(oracle2).submitResolution(1); // YES
      await market.connect(oracle3).submitResolution(1); // YES

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      await market.connect(user1).claim();
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      // user1 should receive ~15 ROSE (total pool) minus gas
      expect(balanceAfter - balanceBefore).to.be.closeTo(
        ethers.parseEther("15"),
        ethers.parseEther("0.01")
      );
    });

    it("should refund on INVALID outcome", async function () {
      await market.connect(oracle1).submitResolution(3); // INVALID
      await market.connect(oracle2).submitResolution(3); // INVALID
      await market.connect(oracle3).submitResolution(3); // INVALID

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      await market.connect(user1).claim();
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      // user1 should get their 10 ROSE back minus gas
      expect(balanceAfter - balanceBefore).to.be.closeTo(
        ethers.parseEther("10"),
        ethers.parseEther("0.01")
      );
    });
  });

  describe("Oracle Staking", function () {
    it("should slash minority voters", async function () {
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("1") });
      await time.increase(25 * 60 * 60);
      await market.closeMarket();

      // oracle3 votes differently
      await market.connect(oracle1).submitResolution(1); // YES
      await market.connect(oracle2).submitResolution(1); // YES
      await market.connect(oracle3).submitResolution(2); // NO (minority)

      const oracle3Info = await oracleRegistry.oracles(oracle3.address);
      expect(oracle3Info.stake).to.be.lessThan(ethers.parseEther("100"));
      expect(oracle3Info.failedResolutions).to.equal(1);
    });
  });
});
```

### 7.2 Run Tests

```bash
cd contracts
npx hardhat test
npx hardhat coverage
```

---

## Phase 8: Testnet Deployment & Demo (Day 29-30)

### 8.1 Get Testnet ROSE

1. Go to https://faucet.testnet.oasis.io/
2. Connect wallet and request TEST tokens

### 8.2 Deploy to Sapphire Testnet

```bash
# Set private key
export PRIVATE_KEY="your-private-key-here"

# Deploy
npx hardhat run scripts/deploy.ts --network sapphire_testnet
```

### 8.3 Register Test Oracles

```bash
npx hardhat run scripts/registerOracles.ts --network sapphire_testnet
```

### 8.4 Deploy Frontend

```bash
cd frontend
npm run build
# Deploy to Vercel/Netlify
npx vercel --prod
```

---

## Timeline Summary

| Phase | Days | Tasks |
|-------|------|-------|
| 1. Setup | 1-2 | Initialize Hardhat, configure Sapphire |
| 2. Architecture | 3-5 | Design contracts, data structures |
| 3. Oracle Registry | 6-8 | Implement staking, registration, slashing |
| 4. Prediction Market | 9-15 | Core betting, privacy, resolution logic |
| 5. Deployment Scripts | 16-17 | Deploy scripts, create market scripts |
| 6. Frontend | 18-25 | React app with Sapphire SDK integration |
| 7. Testing | 26-28 | Unit tests, integration tests |
| 8. Testnet Demo | 29-30 | Deploy, demo, documentation |

**Total: ~30 days**

---

## Key Design Decisions (Simplest Approaches)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Privacy mechanism | TEE (Oasis Sapphire) | Much simpler than ZKP, provides adequate privacy |
| Oracle system | Stake + majority vote | Simple 2/3 majority, no complex dispute resolution |
| Odds model | Pari-mutuel | No order book needed, just pool ratios |
| Batch interval | Fixed 5 minutes | Simple time-based, no complex threshold logic |
| Market type | Binary only | YES/NO simplifies all logic |
| Frontend | React + ethers.js | Standard stack, Sapphire SDK wraps easily |

---

## Files to Create

```
contracts/
├── contracts/
│   ├── OracleRegistry.sol     ← Phase 3
│   ├── PredictionMarket.sol   ← Phase 4
│   └── MarketFactory.sol      ← Phase 4
├── scripts/
│   ├── deploy.ts              ← Phase 5
│   └── createMarket.ts        ← Phase 5
├── test/
│   └── PredictionMarket.test.ts ← Phase 7
├── hardhat.config.ts          ← Phase 1
└── package.json

frontend/
├── src/
│   ├── utils/
│   │   └── sapphire.ts        ← Phase 6
│   ├── hooks/
│   │   └── useMarket.ts       ← Phase 6
│   ├── components/
│   │   └── Market.tsx         ← Phase 6
│   └── App.tsx
└── package.json
```
