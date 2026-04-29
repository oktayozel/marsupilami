import { useState, useEffect } from "react";
import { useDemoState, useLiveFeed, useMarketInfo, type PayoutEntry } from "../hooks/useMarket";

function PayoutTable({ outcome, winners, losers, totalDeposited, totalPaidOut }: {
  outcome: string;
  winners: PayoutEntry[];
  losers: PayoutEntry[];
  totalDeposited: string;
  totalPaidOut: string;
}) {
  const loserLabel = outcome === "YES" ? "NO" : "YES";

  return (
    <div className="payout-section">
      <div className="payout-header">
        <span className="payout-title">Payout Results</span>
        <span className="payout-outcome" data-outcome={outcome}>Outcome: {outcome}</span>
      </div>

      <div className="payout-summary-row">
        <span>Total deposited: <strong>{parseFloat(totalDeposited).toFixed(4)} ETH</strong></span>
        <span>Total paid out: <strong>{parseFloat(totalPaidOut).toFixed(4)} ETH</strong></span>
      </div>

      <div className="payout-cols">
        <div className="payout-col">
          <div className="payout-col-header payout-col-winners">
            ✓ Winners — bet {outcome} ({winners.length})
          </div>
          <div className="payout-list">
            {winners.map((w) => {
              const staked = parseFloat(w.staked);
              const paid = parseFloat(w.paidOut ?? "0");
              const pct = staked > 0 ? Math.round(((paid - staked) / staked) * 100) : 0;
              return (
                <div key={w.address} className="payout-row payout-row-win">
                  <span className="payout-addr">…{w.address.slice(-6)}</span>
                  <span className="payout-staked">{staked.toFixed(4)}</span>
                  <span className="payout-arrow">→</span>
                  <span className="payout-paid">{paid.toFixed(4)} ETH</span>
                  <span className="payout-pct">+{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="payout-col">
          <div className="payout-col-header payout-col-losers">
            ✗ Losers — bet {loserLabel} ({losers.length})
          </div>
          <div className="payout-list">
            {losers.map((w) => {
              const staked = parseFloat(w.staked);
              return (
                <div key={w.address} className="payout-row payout-row-loss">
                  <span className="payout-addr">…{w.address.slice(-6)}</span>
                  <span className="payout-staked">{staked.toFixed(4)}</span>
                  <span className="payout-arrow">→</span>
                  <span className="payout-paid">0.0000 ETH</span>
                  <span className="payout-pct payout-x">✗</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LiveFeed() {
  const { data: demo } = useDemoState();
  const { data: bets } = useLiveFeed(demo?.marketAddress);
  const { data: market } = useMarketInfo(demo?.marketAddress ?? "");

  // Tick every second so the progress bar updates smoothly
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!demo) return null;

  const totalBets    = bets?.length ?? 0;
  const totalDeposits = market?.totalDeposits ?? "0";
  const yesPool      = parseFloat(market?.yesPool ?? "0");
  const noPool       = parseFloat(market?.noPool ?? "0");
  const totalPool    = yesPool + noPool || 1;
  const yesPct       = Math.round((yesPool / totalPool) * 100);
  const noPct        = 100 - yesPct;
  const yesMult      = yesPool > 0 ? (totalPool / yesPool).toFixed(2) : "—";
  const noMult       = noPool  > 0 ? (totalPool / noPool).toFixed(2)  : "—";

  const elapsed  = Math.round((Date.now() - new Date(demo.startedAt).getTime()) / 1000);
  const totalSec = demo.durationMin * 60;
  const progress = Math.min(100, Math.round((elapsed / totalSec) * 100));
  const isActive = elapsed < totalSec;
  const oddsUpdateSec = (demo.oddsUpdateMin ?? 2) * 60;
  const oddsUnknown = elapsed < oddsUpdateSec;

  return (
    <div className="live-feed">
      <div className="live-feed-header">
        <div className="live-badge-row">
          {isActive ? (
            <span className="live-badge">
              <span className="live-dot" />
              LIVE DEMO
            </span>
          ) : (
            <span className="live-badge done">DEMO COMPLETE</span>
          )}
          <span className="live-stats">
            {totalBets} bets · {parseFloat(totalDeposits).toFixed(3)} ROSE deposited
          </span>
        </div>
        <p className="live-question">{demo.question}</p>

        {isActive && (
          <div className="live-progress-row">
            <span className="live-progress-label">
              {Math.floor(elapsed / 60)}m {elapsed % 60}s elapsed
            </span>
            <div className="live-progress-track">
              <div className="live-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="live-progress-label">{demo.durationMin}m total</span>
          </div>
        )}

        <div className="live-odds-bar">
          {oddsUnknown ? (
            <div className="live-odds-unknown">
              <span className="live-odds-pct">??? YES</span>
              <div className="live-odds-track">
                <div className="live-odds-fill-unknown" style={{ width: "100%" }} />
              </div>
              <span className="live-odds-pct">??? NO</span>
            </div>
          ) : (
            <>
              <div className="live-odds-side live-odds-side-yes">
                <span className="live-odds-pct">{yesPct}% YES</span>
                <span className="live-odds-detail">{yesPool.toFixed(3)} ROSE · {yesMult}x payout</span>
              </div>
              <div className="live-odds-track">
                <div className="live-odds-fill-yes" style={{ width: `${yesPct}%` }} />
                <div className="live-odds-fill-no"  style={{ width: `${noPct}%` }} />
              </div>
              <div className="live-odds-side live-odds-side-no">
                <span className="live-odds-pct">{noPct}% NO</span>
                <span className="live-odds-detail">{noPool.toFixed(3)} ROSE · {noMult}x payout</span>
              </div>
            </>
          )}
        </div>
        <p className="live-privacy-note">
          🔒 Bet choices are encrypted — only amounts are visible on-chain
        </p>
      </div>

      <div className="live-feed-list">
        {bets && bets.length > 0 ? (
          bets.slice(0, 40).map((bet) => (
            <div key={bet.txHash} className="live-bet-row">
              <span className="live-bet-addr">
                {bet.user.slice(0, 6)}…{bet.user.slice(-4)}
              </span>
              <span className="live-bet-amount">{parseFloat(bet.amount).toFixed(4)} ROSE</span>
              <span className="live-bet-choice">??? (private)</span>
            </div>
          ))
        ) : (
          <p className="live-empty">Waiting for bets…</p>
        )}
      </div>

      {demo.payout && (
        <PayoutTable
          outcome={demo.payout.outcome}
          winners={demo.payout.winners}
          losers={demo.payout.losers}
          totalDeposited={demo.payout.totalDeposited}
          totalPaidOut={demo.payout.totalPaidOut}
        />
      )}
    </div>
  );
}
