export const MAX_VOTES = 1000000000000000000000000n; // 10n ** 24n;
/**
 * Decode a single tally result
 *
 * The encoded value contains both vote count and voice credits:
 * encoded = v * MAX_VOTES + v²
 *
 * @param encoded - Encoded result string or bigint
 * @returns Object containing vote count and voice credits
 *
 * @example
 * ```typescript
 * const encoded = "7000000000000000000000049"; // 7 votes, 49 voice credits
 * const { vote, voiceCredit } = decodeResult(encoded);
 * console.log(vote);        // 7n
 * console.log(voiceCredit); // 49n
 * ```
 */
export function decodeResult(encoded: bigint | string): { vote: bigint; voiceCredit: bigint } {
  const encodedValue = BigInt(encoded);
  const vote = encodedValue / MAX_VOTES;
  const voiceCredit = encodedValue % MAX_VOTES;

  return { vote, voiceCredit };
}

/**
 * Vote data structure
 *
 * @property v - Vote count (number of votes)
 * @property v2 - Voice credits spent (v² in Quadratic Voting)
 */
export interface VoteData {
  v: number; // Vote count
  v2: number; // Voice credits spent
}

/**
 * Percentage result structure
 *
 * @property v - Vote count percentage (as string with 3 decimal places)
 * @property v2 - Voice credits percentage (as string with 3 decimal places)
 */
export interface PercentageResult {
  v: string; // Vote count percentage
  v2: string; // Voice credits percentage
}

/**
 * Decode multiple tally results
 *
 * @param results - Array of encoded result strings
 * @returns Array of decoded vote data
 *
 * @example
 * ```typescript
 * const encoded = ["7000000000000000000000049", "5000000000000000000000025"];
 * const votes = decodeResults(encoded);
 * // [{ v: 7, v2: 49 }, { v: 5, v2: 25 }]
 * ```
 */
export function decodeResults(results: string[]): VoteData[] {
  return results.map((r) => {
    const { vote, voiceCredit } = decodeResult(r);
    return {
      v: Number(vote),
      v2: Number(voiceCredit)
    };
  });
}

/**
 * Calculate total votes and voice credits
 *
 * @param votes - Array of vote data
 * @returns Total vote count and voice credits
 *
 * @example
 * ```typescript
 * const votes = [{ v: 7, v2: 49 }, { v: 5, v2: 25 }];
 * const totals = calculateTotals(votes);
 * // { v: 12, v2: 74 }
 * ```
 */
export function calculateTotals(votes: VoteData[]): VoteData {
  return votes.reduce(
    (sum, curr) => ({
      v: sum.v + curr.v,
      v2: sum.v2 + curr.v2
    }),
    { v: 0, v2: 0 }
  );
}

/**
 * Calculate percentage distribution of votes
 *
 * @param votes - Array of vote data
 * @param totalVotes - Total votes (optional, will be calculated if not provided)
 * @returns Array of percentage results
 *
 * @example
 * ```typescript
 * const votes = [{ v: 7, v2: 49 }, { v: 5, v2: 25 }];
 * const percentages = calculatePercentages(votes);
 * // [{ v: "58.333", v2: "66.216" }, { v: "41.667", v2: "33.784" }]
 * ```
 */
export function calculatePercentages(votes: VoteData[], totalVotes?: VoteData): PercentageResult[] {
  const totals = totalVotes || calculateTotals(votes);

  return votes.map((vote) => ({
    v: totals.v === 0 ? '0.0' : ((vote.v / totals.v) * 100).toFixed(3),
    v2: totals.v2 === 0 ? '0.0' : ((vote.v2 / totals.v2) * 100).toFixed(3)
  }));
}

/**
 * Process tally results: decode, calculate totals, and compute percentages
 *
 * @param encodedResults - Array of encoded result strings
 * @returns Object containing decoded votes, totals, and percentage results
 *
 * @example
 * ```typescript
 * const encoded = ["7000000000000000000000049", "5000000000000000000000025"];
 * const { votes, totals, percentages } = processTallyResults(encoded);
 * ```
 */
export function processTallyResults(encodedResults: string[]): {
  votes: VoteData[];
  totals: VoteData;
  percentages: PercentageResult[];
} {
  const votes = decodeResults(encodedResults);
  const totals = calculateTotals(votes);
  const percentages = calculatePercentages(votes, totals);

  return { votes, totals, percentages };
}

// ============================================================================
// Advanced Analysis Functions
// ============================================================================

/**
 * Voting intensity data
 *
 * Intensity measures how strongly voters feel about an option.
 * Higher intensity = fewer voters spending more credits per vote.
 *
 * @property avgIntensity - Average voice credits per vote (v² / v)
 * @property interpretation - Human-readable intensity level
 */
export interface IntensityData {
  avgIntensity: number;
  interpretation: 'low' | 'medium' | 'high' | 'extreme';
}

/**
 * Calculate average voting intensity for a single option
 *
 * Intensity = v² / v (voice credits per vote)
 * - Low (< 5): Many voters, weak preference
 * - Medium (5-15): Balanced support
 * - High (15-30): Strong preference from committed voters
 * - Extreme (> 30): Very few voters with extreme conviction
 *
 * @param vote - Vote data for a single option
 * @returns Intensity data with interpretation
 *
 * @example
 * ```typescript
 * const vote = { v: 7, v2: 49 };
 * const intensity = calculateIntensity(vote);
 * // { avgIntensity: 7, interpretation: 'medium' }
 *
 * const extremeVote = { v: 10, v2: 400 };
 * const extreme = calculateIntensity(extremeVote);
 * // { avgIntensity: 40, interpretation: 'extreme' }
 * ```
 */
export function calculateIntensity(vote: VoteData): IntensityData {
  if (vote.v === 0) {
    return { avgIntensity: 0, interpretation: 'low' };
  }

  const avgIntensity = vote.v2 / vote.v;

  let interpretation: IntensityData['interpretation'];
  if (avgIntensity < 5) interpretation = 'low';
  else if (avgIntensity < 15) interpretation = 'medium';
  else if (avgIntensity < 30) interpretation = 'high';
  else interpretation = 'extreme';

  return { avgIntensity, interpretation };
}

/**
 * Calculate intensities for all options
 *
 * @param votes - Array of vote data
 * @returns Array of intensity data
 *
 * @example
 * ```typescript
 * const votes = [{ v: 7, v2: 49 }, { v: 5, v2: 125 }];
 * const intensities = calculateIntensities(votes);
 * // [
 * //   { avgIntensity: 7, interpretation: 'medium' },
 * //   { avgIntensity: 25, interpretation: 'high' }
 * // ]
 * ```
 */
export function calculateIntensities(votes: VoteData[]): IntensityData[] {
  return votes.map(calculateIntensity);
}

/**
 * Ranked option with comprehensive data
 *
 * @property index - Original option index
 * @property rank - Ranking position (1 = highest)
 * @property vote - Vote data
 * @property percentage - Percentage distribution
 * @property intensity - Intensity data
 * @property isWinner - Whether this is the winning option
 */
export interface RankedOption {
  index: number;
  rank: number;
  vote: VoteData;
  percentage: PercentageResult;
  intensity: IntensityData;
  isWinner: boolean;
}

/**
 * Rank options by vote count
 *
 * @param votes - Array of vote data
 * @param percentages - Array of percentage results
 * @param intensities - Array of intensity data
 * @returns Ranked options sorted by vote count (highest first)
 *
 * @example
 * ```typescript
 * const votes = [{ v: 5, v2: 25 }, { v: 10, v2: 100 }, { v: 7, v2: 49 }];
 * const percentages = calculatePercentages(votes);
 * const intensities = calculateIntensities(votes);
 * const ranked = rankByVotes(votes, percentages, intensities);
 * // [
 * //   { index: 1, rank: 1, vote: { v: 10, v2: 100 }, isWinner: true, ... },
 * //   { index: 2, rank: 2, vote: { v: 7, v2: 49 }, isWinner: false, ... },
 * //   { index: 0, rank: 3, vote: { v: 5, v2: 25 }, isWinner: false, ... }
 * // ]
 * ```
 */
export function rankByVotes(
  votes: VoteData[],
  percentages: PercentageResult[],
  intensities: IntensityData[]
): RankedOption[] {
  return votes
    .map((vote, index) => ({
      index,
      vote,
      percentage: percentages[index],
      intensity: intensities[index]
    }))
    .sort((a, b) => b.vote.v - a.vote.v)
    .map((item, rank) => ({
      ...item,
      rank: rank + 1,
      isWinner: rank === 0
    }));
}

/**
 * Rank options by voice credits (intensity-based ranking)
 *
 * This ranking shows which options received the most passionate support,
 * regardless of the number of votes.
 *
 * @param votes - Array of vote data
 * @param percentages - Array of percentage results
 * @param intensities - Array of intensity data
 * @returns Ranked options sorted by voice credits (highest first)
 *
 * @example
 * ```typescript
 * const votes = [{ v: 10, v2: 100 }, { v: 5, v2: 125 }];
 * const ranked = rankByIntensity(votes, percentages, intensities);
 * // Option 1 ranks higher despite fewer votes (125 > 100 voice credits)
 * ```
 */
export function rankByIntensity(
  votes: VoteData[],
  percentages: PercentageResult[],
  intensities: IntensityData[]
): RankedOption[] {
  return votes
    .map((vote, index) => ({
      index,
      vote,
      percentage: percentages[index],
      intensity: intensities[index]
    }))
    .sort((a, b) => b.vote.v2 - a.vote.v2)
    .map((item, rank) => ({
      ...item,
      rank: rank + 1,
      isWinner: rank === 0
    }));
}

/**
 * Distribution analysis metrics
 *
 * These metrics help identify voting patterns and potential issues:
 * - Gini Coefficient: Measures inequality (0 = equal, 1 = unequal)
 * - Herfindahl Index: Measures concentration (lower = more distributed)
 * - Normalized Entropy: Measures diversity (higher = more diverse)
 *
 * @property mean - Average votes per option
 * @property median - Median votes
 * @property stdDev - Standard deviation
 * @property giniCoefficient - Gini coefficient [0, 1]
 * @property herfindahlIndex - Herfindahl-Hirschman Index [0, 1]
 * @property normalizedEntropy - Shannon entropy normalized [0, 1]
 * @property top3Concentration - Percentage held by top 3 options
 * @property top5Concentration - Percentage held by top 5 options
 * @property alerts - Warning messages about distribution issues
 */
export interface DistributionMetrics {
  mean: number;
  median: number;
  stdDev: number;
  giniCoefficient: number;
  herfindahlIndex: number;
  normalizedEntropy: number;
  top3Concentration: number;
  top5Concentration: number;
  alerts: string[];
}

/**
 * Analyze vote distribution for fairness and pattern detection
 *
 * This function provides statistical analysis to detect:
 * - Voting inequality (Gini coefficient)
 * - Concentration of votes (HHI)
 * - Diversity of support (Entropy)
 * - Dominance by top options
 *
 * @param votes - Array of vote data
 * @returns Distribution metrics with alerts
 *
 * @example
 * ```typescript
 * const votes = [
 *   { v: 100, v2: 10000 },
 *   { v: 10, v2: 100 },
 *   { v: 5, v2: 25 },
 *   { v: 2, v2: 4 }
 * ];
 * const metrics = analyzeDistribution(votes);
 * console.log(metrics.giniCoefficient); // High inequality
 * console.log(metrics.alerts);          // ['High concentration (HHI > 0.5)', ...]
 * ```
 */
export function analyzeDistribution(votes: VoteData[]): DistributionMetrics {
  const values = votes.map((v) => v.v);
  const total = values.reduce((a, b) => a + b, 0);

  if (total === 0) {
    return {
      mean: 0,
      median: 0,
      stdDev: 0,
      giniCoefficient: 0,
      herfindahlIndex: 0,
      normalizedEntropy: 0,
      top3Concentration: 0,
      top5Concentration: 0,
      alerts: ['No votes recorded']
    };
  }

  // Basic statistics
  const sorted = [...values].sort((a, b) => b - a);
  const mean = total / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];

  const variance = values.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Gini coefficient
  // Formula: G = (2 * Σ(i * x_i)) / (n * Σx_i) - (n + 1) / n
  const sortedAsc = [...values].sort((a, b) => a - b);
  let giniSum = 0;
  for (let i = 0; i < sortedAsc.length; i++) {
    giniSum += (i + 1) * sortedAsc[i];
  }
  const gini = (2 * giniSum) / (values.length * total) - (values.length + 1) / values.length;

  // Herfindahl-Hirschman Index (HHI)
  // Formula: HHI = Σ(share_i)²
  let hhi = 0;
  for (const v of values) {
    const share = v / total;
    hhi += share * share;
  }

  // Shannon Entropy
  // Formula: H = -Σ(p_i * log2(p_i))
  let entropy = 0;
  for (const v of values) {
    if (v === 0) continue;
    const p = v / total;
    entropy -= p * Math.log2(p);
  }
  const activeOptions = values.filter((v) => v > 0).length;
  const maxEntropy = activeOptions > 0 ? Math.log2(activeOptions) : 0;
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // Concentration metrics
  const top3Sum = sorted.slice(0, 3).reduce((a, b) => a + b, 0);
  const top5Sum = sorted.slice(0, 5).reduce((a, b) => a + b, 0);

  // Generate alerts
  const alerts: string[] = [];
  if (gini > 0.6) alerts.push('High inequality (Gini > 0.6)');
  if (hhi > 0.5) alerts.push('High concentration (HHI > 0.5)');
  if (top3Sum / total > 0.8) alerts.push('Top 3 options dominate (>80%)');
  if (normalizedEntropy < 0.5) alerts.push('Low diversity (Entropy < 0.5)');

  return {
    mean,
    median,
    stdDev,
    giniCoefficient: gini,
    herfindahlIndex: hhi,
    normalizedEntropy,
    top3Concentration: top3Sum / total,
    top5Concentration: top5Sum / total,
    alerts
  };
}

/**
 * Comprehensive tally analysis result
 *
 * This interface combines all analysis results into a single structure
 * for convenient access to voting data and insights.
 *
 * @property votes - Decoded vote data
 * @property totals - Total votes and voice credits
 * @property percentages - Percentage distribution
 * @property rankedByVotes - Options ranked by vote count
 * @property rankedByIntensity - Options ranked by voice credits
 * @property intensities - Intensity analysis for each option
 * @property distribution - Statistical distribution analysis
 * @property winner - Information about the winning option
 * @property summary - High-level summary statistics
 */
export interface ComprehensiveTallyResult {
  votes: VoteData[];
  totals: VoteData;
  percentages: PercentageResult[];
  rankedByVotes: RankedOption[];
  rankedByIntensity: RankedOption[];
  intensities: IntensityData[];
  distribution: DistributionMetrics;
  winner: {
    index: number;
    votes: number;
    voiceCredits: number;
    percentage: string;
    intensity: number;
  };
  summary: {
    totalOptions: number;
    activeOptions: number;
    totalVotes: number;
    totalVoiceCredits: number;
    averageIntensity: number;
    healthScore: number;
  };
}

/**
 * Perform comprehensive analysis of tally results
 *
 * This is the main analysis function that provides complete insights
 * into voting results, including rankings, distributions, and health metrics.
 *
 * @param encodedResults - Array of encoded result strings from contract
 * @returns Comprehensive analysis result
 *
 * @example
 * ```typescript
 * // Get results from contract
 * const encodedResults = await contract.getAllResult();
 *
 * // Comprehensive analysis
 * const analysis = analyzeComprehensiveTallyResults(encodedResults);
 *
 * console.log('Winner:', analysis.winner);
 * console.log('Health Score:', analysis.summary.healthScore);
 * console.log('Top 3 by votes:', analysis.rankedByVotes.slice(0, 3));
 * console.log('Top 3 by intensity:', analysis.rankedByIntensity.slice(0, 3));
 * console.log('Alerts:', analysis.distribution.alerts);
 * ```
 */
export function analyzeComprehensiveTallyResults(
  encodedResults: string[]
): ComprehensiveTallyResult {
  // Basic decoding
  const votes = decodeResults(encodedResults);
  const totals = calculateTotals(votes);
  const percentages = calculatePercentages(votes, totals);
  const intensities = calculateIntensities(votes);

  // Rankings
  const rankedByVotes = rankByVotes(votes, percentages, intensities);
  const rankedByIntensity = rankByIntensity(votes, percentages, intensities);

  // Distribution analysis
  const distribution = analyzeDistribution(votes);

  // Winner information
  const winner = rankedByVotes[0];

  // Summary statistics
  const activeOptions = votes.filter((v) => v.v > 0).length;
  const avgIntensity = totals.v > 0 ? totals.v2 / totals.v : 0;

  // Health score calculation (0-100)
  // Higher score = healthier, more democratic distribution
  let healthScore = 100;
  if (distribution.giniCoefficient > 0.5) healthScore -= 25;
  if (distribution.herfindahlIndex > 0.4) healthScore -= 20;
  if (distribution.top3Concentration > 0.8) healthScore -= 15;
  if (distribution.normalizedEntropy < 0.5) healthScore -= 20;
  if (distribution.alerts.length > 0) healthScore -= distribution.alerts.length * 5;

  return {
    votes,
    totals,
    percentages,
    rankedByVotes,
    rankedByIntensity,
    intensities,
    distribution,
    winner: {
      index: winner.index,
      votes: winner.vote.v,
      voiceCredits: winner.vote.v2,
      percentage: winner.percentage.v,
      intensity: winner.intensity.avgIntensity
    },
    summary: {
      totalOptions: votes.length,
      activeOptions,
      totalVotes: totals.v,
      totalVoiceCredits: totals.v2,
      averageIntensity: avgIntensity,
      healthScore: Math.max(0, healthScore)
    }
  };
}

/**
 * Format comprehensive tally results for human-readable display
 *
 * @param result - Comprehensive tally result
 * @returns Formatted string for console or UI display
 *
 * @example
 * ```typescript
 * const analysis = analyzeComprehensiveTallyResults(encodedResults);
 * console.log(formatTallyResults(analysis));
 * ```
 *
 * Output example:
 * ```
 * === Tally Results Analysis ===
 *
 * 🏆 Winner: Option 2
 *    Votes: 150 (45.455%)
 *    Voice Credits: 2500
 *    Intensity: 16.67
 *
 * 📊 Rankings by Votes:
 *    1. Option 2: 150 votes (45.455%) - Intensity: 16.67 (high)
 *    2. Option 1: 120 votes (36.364%) - Intensity: 6.67 (medium)
 *    ...
 * ```
 */
export function formatTallyResults(result: ComprehensiveTallyResult): string {
  let output = '=== Tally Results Analysis ===\n\n';

  // Winner
  output += `🏆 Winner: Option ${result.winner.index}\n`;
  output += `   Votes: ${result.winner.votes} (${result.winner.percentage}%)\n`;
  output += `   Voice Credits: ${result.winner.voiceCredits}\n`;
  output += `   Intensity: ${result.winner.intensity.toFixed(2)}\n\n`;

  // Rankings by votes
  output += '📊 Rankings by Votes:\n';
  result.rankedByVotes.slice(0, 5).forEach((opt) => {
    output += `   ${opt.rank}. Option ${opt.index}: ${opt.vote.v} votes (${opt.percentage.v}%)`;
    output += ` - Intensity: ${opt.intensity.avgIntensity.toFixed(2)} (${opt.intensity.interpretation})\n`;
  });
  output += '\n';

  // Rankings by intensity (if different from vote ranking)
  const topByIntensity = result.rankedByIntensity.slice(0, 3);
  const isDifferent = topByIntensity.some((opt, i) => opt.index !== result.rankedByVotes[i].index);
  if (isDifferent) {
    output += '🔥 Top 3 by Intensity (Passion):\n';
    topByIntensity.forEach((opt) => {
      output += `   ${opt.rank}. Option ${opt.index}: ${opt.vote.v2} voice credits`;
      output += ` (Intensity: ${opt.intensity.avgIntensity.toFixed(2)})\n`;
    });
    output += '\n';
  }

  // Summary
  output += '📈 Summary:\n';
  output += `   Total Options: ${result.summary.totalOptions}\n`;
  output += `   Active Options: ${result.summary.activeOptions}\n`;
  output += `   Total Votes: ${result.summary.totalVotes}\n`;
  output += `   Total Voice Credits: ${result.summary.totalVoiceCredits}\n`;
  output += `   Average Intensity: ${result.summary.averageIntensity.toFixed(2)}\n`;
  output += `   Health Score: ${result.summary.healthScore}/100`;

  // Health interpretation
  if (result.summary.healthScore >= 80) {
    output += ' ✅ (Excellent)\n';
  } else if (result.summary.healthScore >= 60) {
    output += ' ⚠️  (Good)\n';
  } else if (result.summary.healthScore >= 40) {
    output += ' ⚠️  (Fair)\n';
  } else {
    output += ' 🚨 (Critical)\n';
  }
  output += '\n';

  // Distribution
  output += '🔍 Distribution Analysis:\n';
  output += `   Gini Coefficient: ${result.distribution.giniCoefficient.toFixed(3)} `;
  output +=
    result.distribution.giniCoefficient < 0.3 ? '(Low inequality ✅)\n' : '(High inequality ⚠️)\n';
  output += `   HHI: ${result.distribution.herfindahlIndex.toFixed(3)} `;
  output +=
    result.distribution.herfindahlIndex < 0.2 ? '(Well distributed ✅)\n' : '(Concentrated ⚠️)\n';
  output += `   Entropy: ${result.distribution.normalizedEntropy.toFixed(3)} `;
  output +=
    result.distribution.normalizedEntropy > 0.7 ? '(High diversity ✅)\n' : '(Low diversity ⚠️)\n';
  output += `   Top 3 Concentration: ${(result.distribution.top3Concentration * 100).toFixed(1)}%\n`;

  if (result.distribution.alerts.length > 0) {
    output += '\n⚠️  Alerts:\n';
    result.distribution.alerts.forEach((alert) => {
      output += `   - ${alert}\n`;
    });
  }

  return output;
}
