import {
  assertValidMintAddress,
  fetchHolderStats,
  fetchMintAuthorities,
} from "./solanaRpcClient.ts";
import {
  CATEGORY_IMAGES,
  HOLDER_ANALYSIS_UNAVAILABLE_WARNING,
  type DexAggregated,
  type DexScreenerPair,
  type HealthCategory,
  type ScoreSection,
  type TokenHealthReport,
  type TokenHealthResult,
} from "./tokenHealthTypes.ts";

const DEXSCREENER_URL = "https://api.dexscreener.com/tokens/v1/solana";

function getCategory(score: number): HealthCategory {
  if (score >= 80) return "GOOD";
  if (score >= 60) return "AVERAGE";
  if (score >= 40) return "POOR";
  return "BAD";
}

function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "N/A";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

function formatAuthority(revoked: boolean): string {
  return revoked ? "Revoked" : "Active";
}

async function fetchDexScreener(mint: string): Promise<DexScreenerPair[]> {
  const response = await fetch(`${DEXSCREENER_URL}/${mint}`);

  if (!response.ok) {
    throw new Error("DexScreener request failed.");
  }

  const pairs = (await response.json()) as DexScreenerPair[];
  return Array.isArray(pairs) ? pairs : [];
}

function aggregateDexPairs(pairs: DexScreenerPair[]): DexAggregated {
  if (!pairs.length) {
    return {
      name: null,
      symbol: null,
      hasMedia: false,
      liquidityUsd: 0,
      marketCap: 0,
      volume24h: 0,
      poolCount: 0,
      ageDays: null,
      oldestPairDate: null,
    };
  }

  const primary = pairs[0];
  const base = primary.baseToken ?? {};
  const info = primary.info ?? {};

  const liquidityUsd = pairs.reduce(
    (sum, pair) => sum + (pair.liquidity?.usd ?? 0),
    0
  );
  const volume24h = pairs.reduce(
    (sum, pair) => sum + (pair.volume?.h24 ?? 0),
    0
  );
  const marketCap = Math.max(
    ...pairs.map((pair) => pair.marketCap ?? pair.fdv ?? 0)
  );

  const timestamps = pairs
    .map((pair) => pair.pairCreatedAt)
    .filter((value): value is number => Boolean(value));
  const oldestPairDate = timestamps.length
    ? new Date(Math.min(...timestamps))
    : null;
  const ageDays = oldestPairDate
    ? (Date.now() - oldestPairDate.getTime()) / (1000 * 60 * 60 * 24)
    : null;

  const hasImage = Boolean(info.imageUrl);
  const hasWebsite = Boolean(info.websites?.length);
  const hasSocials = Boolean(info.socials?.length);

  return {
    name: base.name ?? null,
    symbol: base.symbol ?? null,
    hasMedia: hasImage || hasWebsite || hasSocials,
    liquidityUsd,
    marketCap,
    volume24h,
    poolCount: pairs.length,
    ageDays,
    oldestPairDate,
  };
}

function scoreMetadata(dex: Pick<DexAggregated, "name" | "symbol" | "hasMedia">) {
  let score = 0;
  const notes: string[] = [];

  if (dex.name) {
    score += 5;
  } else {
    notes.push("Token name metadata was not found.");
  }

  if (dex.symbol) {
    score += 5;
  } else {
    notes.push("Token symbol metadata was not found.");
  }

  if (dex.hasMedia) {
    score += 5;
  } else {
    notes.push("No image, website, or social links were detected.");
  }

  return { score, max: 15, notes };
}

function scoreSupplyStructure(
  topHolderPercentage: number | null,
  top10HolderPercentage: number | null,
  holderAnalysisUnavailable: boolean
) {
  const notes: string[] = [];
  let topHolderScore = 0;
  let top10Score = 0;

  if (holderAnalysisUnavailable) {
    notes.push(HOLDER_ANALYSIS_UNAVAILABLE_WARNING);
    return { score: 10, max: 20, notes };
  }

  if (topHolderPercentage == null) {
    notes.push("Holder distribution could not be calculated.");
    return { score: 0, max: 20, notes };
  }

  if (topHolderPercentage < 10) {
    topHolderScore = 12;
    notes.push("Top holder concentration is excellent (under 10%).");
  } else if (topHolderPercentage < 20) {
    topHolderScore = 10;
    notes.push("Top holder concentration is good (under 20%).");
  } else if (topHolderPercentage < 35) {
    topHolderScore = 7;
    notes.push("Top holder concentration is average (under 35%).");
  } else if (topHolderPercentage < 50) {
    topHolderScore = 4;
    notes.push("Top holder concentration is elevated (under 50%).");
  } else {
    topHolderScore = 0;
    notes.push("Top holder controls more than 50% of supply.");
  }

  if (top10HolderPercentage != null) {
    if (top10HolderPercentage < 25) {
      top10Score = 8;
      notes.push("Top 10 holders show strong decentralization.");
    } else if (top10HolderPercentage < 40) {
      top10Score = 6;
      notes.push("Top 10 holder concentration is moderate.");
    } else if (top10HolderPercentage < 60) {
      top10Score = 4;
      notes.push("Top 10 holders control a notable share of supply.");
    } else if (top10HolderPercentage < 80) {
      top10Score = 2;
      notes.push("Top 10 holders are highly concentrated.");
    } else {
      top10Score = 0;
      notes.push("Top 10 holders control most of the supply.");
    }
  }

  return {
    score: topHolderScore + top10Score,
    max: 20,
    notes,
  };
}

function scoreLiquidity(liquidityUsd: number) {
  const notes: string[] = [];

  if (liquidityUsd >= 100_000) {
    notes.push("Liquidity is excellent (over $100,000).");
    return { score: 20, max: 20, notes };
  }
  if (liquidityUsd >= 25_000) {
    notes.push("Liquidity is good (over $25,000).");
    return { score: 16, max: 20, notes };
  }
  if (liquidityUsd >= 5_000) {
    notes.push("Liquidity is average (over $5,000).");
    return { score: 11, max: 20, notes };
  }
  if (liquidityUsd >= 1_000) {
    notes.push("Liquidity is low (over $1,000).");
    return { score: 6, max: 20, notes };
  }
  if (liquidityUsd > 0) {
    notes.push("Liquidity is very low (under $1,000).");
    return { score: 2, max: 20, notes };
  }

  notes.push("No measurable liquidity was found.");
  return { score: 0, max: 20, notes };
}

function scoreMarketActivity(volume24h: number) {
  const notes: string[] = [];

  if (volume24h >= 50_000) {
    notes.push("24h trading volume is excellent (over $50,000).");
    return { score: 10, max: 10, notes };
  }
  if (volume24h >= 10_000) {
    notes.push("24h trading volume is good (over $10,000).");
    return { score: 8, max: 10, notes };
  }
  if (volume24h >= 2_000) {
    notes.push("24h trading volume is average (over $2,000).");
    return { score: 5, max: 10, notes };
  }
  if (volume24h > 0) {
    notes.push("24h trading volume is limited.");
    return { score: 2, max: 10, notes };
  }

  notes.push("No 24h trading volume was detected.");
  return { score: 0, max: 10, notes };
}

function scoreTokenAge(ageDays: number | null) {
  const notes: string[] = [];

  if (ageDays == null) {
    notes.push("Token age could not be determined from available markets.");
    return { score: 5, max: 10, notes };
  }

  if (ageDays >= 90) {
    notes.push("Token has been active for over 90 days.");
    return { score: 10, max: 10, notes };
  }
  if (ageDays >= 30) {
    notes.push("Token has been active for over 30 days.");
    return { score: 6, max: 10, notes };
  }
  if (ageDays >= 7) {
    notes.push("Token is relatively new (over 7 days).");
    return { score: 3, max: 10, notes };
  }

  notes.push("Token is very new (under 7 days), which adds risk.");
  return { score: 0, max: 10, notes };
}

function scoreAuthorities(
  mintAuthorityRevoked: boolean,
  freezeAuthorityRevoked: boolean
) {
  const notes: string[] = [];
  let score = 0;

  if (mintAuthorityRevoked) {
    score += 8;
    notes.push("Mint authority has been revoked.");
  } else {
    notes.push(
      "Mint authority is still active, allowing additional supply to be minted."
    );
  }

  if (freezeAuthorityRevoked) {
    score += 7;
    notes.push("Freeze authority has been revoked.");
  } else {
    notes.push(
      "Freeze authority is still active, allowing accounts to be frozen."
    );
  }

  return { score, max: 15, notes };
}

function scoreLiquidityQuality(poolCount: number, liquidityUsd: number) {
  const notes: string[] = [];

  if (poolCount >= 2) {
    if (liquidityUsd >= 5_000) {
      notes.push("Liquidity is spread across multiple pools.");
      return { score: 10, max: 10, notes };
    }
    notes.push("Multiple pools exist, but total liquidity remains limited.");
    return { score: 7, max: 10, notes };
  }

  if (poolCount === 1) {
    if (liquidityUsd >= 25_000) {
      notes.push("A single pool carries solid liquidity.");
      return { score: 8, max: 10, notes };
    }
    if (liquidityUsd >= 5_000) {
      notes.push("Liquidity relies on a single pool.");
      return { score: 6, max: 10, notes };
    }
    if (liquidityUsd >= 1_000) {
      notes.push("Single-pool liquidity is limited.");
      return { score: 4, max: 10, notes };
    }
    notes.push("Single pool with very low liquidity.");
    return { score: 2, max: 10, notes };
  }

  notes.push("No liquidity pools were detected.");
  return { score: 0, max: 10, notes };
}

function buildWarnings(report: TokenHealthReport): string[] {
  const warnings: string[] = [];

  if (report.holderAnalysisUnavailable) {
    warnings.push(HOLDER_ANALYSIS_UNAVAILABLE_WARNING);
  }

  if (report.topHolderPercentage != null && report.topHolderPercentage > 50) {
    warnings.push("Top holder controls more than 50% of supply.");
  }
  if (report.liquidityUsd < 1_000) {
    warnings.push("Liquidity is below $1,000.");
  }
  if (!report.mintAuthorityRevoked) {
    warnings.push("Mint authority is still active.");
  }
  if (!report.freezeAuthorityRevoked) {
    warnings.push("Freeze authority is still active.");
  }
  if (report.volume24h <= 0) {
    warnings.push("No 24h trading volume detected.");
  }
  if (!report.name && !report.symbol && !report.hasMedia) {
    warnings.push("No token metadata was found.");
  }
  if (report.poolCount === 1 && report.liquidityUsd < 5_000) {
    warnings.push("Liquidity depends on a single low-liquidity pool.");
  }

  return warnings;
}

function buildSummary(
  category: HealthCategory,
  sections: ScoreSection[],
  warnings: string[]
): string {
  const positives = sections
    .flatMap((section) => section.notes)
    .filter((note) =>
      /excellent|good|revoked|strong|decentralization|over 90|over 30|spread across/i.test(
        note
      )
    )
    .slice(0, 3);

  if (positives.length >= 2) {
    return `This token shows ${positives.join(" ").replace(/\.$/, "")}. Overall health is ${category.toLowerCase()}.`;
  }

  if (warnings.length) {
    return `This token has ${warnings.length} notable risk factor${warnings.length > 1 ? "s" : ""} that affected the score. Review the detailed report before making decisions.`;
  }

  return `This token received a ${category.toLowerCase()} health rating based on liquidity, holder distribution, authorities, and market activity.`;
}

export async function analyzeTokenHealth(mint: string): Promise<TokenHealthResult> {
  const normalizedMint = assertValidMintAddress(mint);

  const [pairs, authorities, holders] = await Promise.all([
    fetchDexScreener(normalizedMint),
    fetchMintAuthorities(normalizedMint),
    fetchHolderStats(normalizedMint),
  ]);

  const dex = aggregateDexPairs(pairs);

  const metadata = scoreMetadata(dex);
  const supply = scoreSupplyStructure(
    holders.topHolderPercentage,
    holders.top10HolderPercentage,
    holders.analysisUnavailable
  );
  const liquidity = scoreLiquidity(dex.liquidityUsd);
  const activity = scoreMarketActivity(dex.volume24h);
  const age = scoreTokenAge(dex.ageDays);
  const authoritiesScore = scoreAuthorities(
    authorities.mintAuthorityRevoked,
    authorities.freezeAuthorityRevoked
  );
  const liquidityQuality = scoreLiquidityQuality(dex.poolCount, dex.liquidityUsd);

  const sections: ScoreSection[] = [
    { label: "Metadata", ...metadata },
    { label: "Supply Structure", ...supply },
    { label: "Liquidity", ...liquidity },
    { label: "Market Activity", ...activity },
    { label: "Token Age", ...age },
    { label: "Authorities", ...authoritiesScore },
    { label: "Liquidity Quality", ...liquidityQuality },
  ];

  const totalScore = Math.min(
    100,
    Math.max(0, sections.reduce((sum, section) => sum + section.score, 0))
  );
  const category = getCategory(totalScore);

  const report: TokenHealthReport = {
    mint: normalizedMint,
    name: dex.name || "Unknown",
    symbol: dex.symbol || "N/A",
    liquidityUsd: dex.liquidityUsd,
    marketCap: dex.marketCap,
    volume24h: dex.volume24h,
    topHolderPercentage: holders.topHolderPercentage,
    top10HolderPercentage: holders.top10HolderPercentage,
    holderAnalysisUnavailable: holders.analysisUnavailable,
    mintAuthorityRevoked: authorities.mintAuthorityRevoked,
    freezeAuthorityRevoked: authorities.freezeAuthorityRevoked,
    ageDays: dex.ageDays,
    poolCount: dex.poolCount,
    hasMedia: dex.hasMedia,
  };

  const warnings = buildWarnings(report);
  const summary = buildSummary(category, sections, warnings);

  return {
    score: totalScore,
    category,
    image: CATEGORY_IMAGES[category],
    summary,
    warnings,
    sections,
    report,
  };
}

function createModalElements(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "checker-modal-overlay";
  overlay.id = "checker-modal-overlay";
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="checker-modal" role="dialog" aria-modal="true" aria-labelledby="checker-modal-title">
      <button class="checker-modal__close" type="button" aria-label="Close results">&times;</button>
      <img class="checker-modal__image" id="checker-modal-image" alt="" width="120" height="120" />
      <p class="checker-modal__score" id="checker-modal-score"></p>
      <h3 class="checker-modal__rating" id="checker-modal-title"></h3>
      <p class="checker-modal__summary" id="checker-modal-summary"></p>
      <div class="checker-modal__report" id="checker-modal-report"></div>
      <p class="checker-modal__disclaimer">Not financial advice. Always do your own research.</p>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
}

function renderModalReport(
  container: HTMLElement,
  result: TokenHealthResult
): void {
  const { report, warnings, sections } = result;
  const ageText =
    report.ageDays == null ? "Unknown" : `${Math.floor(report.ageDays)} days`;

  const warningsHtml = warnings.length
    ? `<ul class="checker-modal__warnings">${warnings
        .map((warning) => `<li>${warning}</li>`)
        .join("")}</ul>`
    : `<p class="checker-modal__no-warnings">No major warnings detected.</p>`;

  const breakdownHtml = sections
    .map(
      (section) => `
        <div class="checker-breakdown__item">
          <div class="checker-breakdown__head">
            <span>${section.label}</span>
            <strong>${section.score}/${section.max}</strong>
          </div>
          <p>${section.notes[0] || "No additional notes."}</p>
        </div>
      `
    )
    .join("");

  container.innerHTML = `
    <div class="checker-report-grid">
      <div><span>Token Name</span><strong>${report.name}</strong></div>
      <div><span>Symbol</span><strong>${report.symbol}</strong></div>
      <div class="checker-report-grid__full"><span>Mint Address</span><strong>${report.mint}</strong></div>
      <div><span>Liquidity</span><strong>${formatUsd(report.liquidityUsd)}</strong></div>
      <div><span>Market Cap</span><strong>${formatUsd(report.marketCap)}</strong></div>
      <div><span>24h Volume</span><strong>${formatUsd(report.volume24h)}</strong></div>
      <div><span>Top Holder</span><strong>${formatPercent(report.topHolderPercentage)}</strong></div>
      <div><span>Top 10 Holders</span><strong>${formatPercent(report.top10HolderPercentage)}</strong></div>
      <div><span>Mint Authority</span><strong>${formatAuthority(report.mintAuthorityRevoked)}</strong></div>
      <div><span>Freeze Authority</span><strong>${formatAuthority(report.freezeAuthorityRevoked)}</strong></div>
      <div><span>Token Age</span><strong>${ageText}</strong></div>
      <div><span>Liquidity Pools</span><strong>${report.poolCount}</strong></div>
    </div>
    <h4 class="checker-modal__subtitle">Warnings</h4>
    ${warningsHtml}
    <h4 class="checker-modal__subtitle">Score Breakdown</h4>
    <div class="checker-breakdown">${breakdownHtml}</div>
  `;
}

function openResultModal(result: TokenHealthResult): void {
  let overlay = document.getElementById("checker-modal-overlay") as HTMLDivElement | null;

  if (!overlay) {
    overlay = createModalElements();
  }

  const image = overlay.querySelector("#checker-modal-image") as HTMLImageElement;
  const score = overlay.querySelector("#checker-modal-score") as HTMLElement;
  const rating = overlay.querySelector("#checker-modal-title") as HTMLElement;
  const summary = overlay.querySelector("#checker-modal-summary") as HTMLElement;
  const report = overlay.querySelector("#checker-modal-report") as HTMLElement;

  image.src = result.image;
  image.alt = `${result.category} token health rating`;
  score.textContent = `Health Score: ${result.score}/100`;
  rating.textContent = `${result.category} TOKEN`;
  summary.textContent = result.summary;
  renderModalReport(report, result);

  overlay.hidden = false;
  document.body.classList.add("checker-modal-open");
  (overlay.querySelector(".checker-modal__close") as HTMLButtonElement).focus();
}

function closeResultModal(): void {
  const overlay = document.getElementById("checker-modal-overlay");

  if (!overlay) {
    return;
  }

  overlay.hidden = true;
  document.body.classList.remove("checker-modal-open");
}

export function initTokenChecker(): void {
  const form = document.getElementById("token-checker-form");
  const input = document.getElementById("token-checker-input") as HTMLInputElement | null;
  const button = document.getElementById("token-checker-submit") as HTMLButtonElement | null;
  const status = document.getElementById("token-checker-status");
  const loading = document.getElementById("token-checker-loading") as HTMLElement | null;

  if (!form || !input || !button || !status || !loading) {
    return;
  }

  if (!document.getElementById("checker-modal-overlay")) {
    const overlay = createModalElements();

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeResultModal();
      }
    });

    overlay.querySelector(".checker-modal__close")?.addEventListener("click", () => {
      closeResultModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.hidden) {
        closeResultModal();
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";
    loading.hidden = false;
    button.disabled = true;

    try {
      const result = await analyzeTokenHealth(input.value);
      openResultModal(result);
      status.textContent = "Analysis complete.";
    } catch (error) {
      status.textContent =
        error instanceof Error
          ? error.message
          : "Unable to analyze this token right now.";
    } finally {
      loading.hidden = true;
      button.disabled = false;
    }
  });
}
