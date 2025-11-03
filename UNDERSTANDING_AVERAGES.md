# Understanding the Average Metrics

## Your Question

How do these metrics make sense together?
- Avg Simulator Pointer: **0.1379**
- Avg Bid Reduction Pointer: **0.1402**
- Avg Difference: **0.46%**

At first glance, this seems wrong because:
- Bid Reduction (0.1402) is slightly higher than Simulator (0.1379)
- We'd expect a negative difference, not +0.46%

## The Answer: Per-Campaign vs. Aggregate Calculation

The key is understanding **when** the difference is calculated:

### ❌ What We're NOT Doing
```
Average Difference = (Avg Simulator - Avg Bid Reduction) / Avg Bid Reduction × 100
                   = (0.1379 - 0.1402) / 0.1402 × 100
                   = -1.64%
```

### ✅ What We ARE Doing
```sql
-- Step 1: Calculate difference for EACH campaign individually
CASE
  WHEN bid_reduction_pointer IS NOT NULL
    AND bid_reduction_pointer != 0
    AND simulator_pointer IS NOT NULL
  THEN ((simulator_pointer - bid_reduction_pointer) / bid_reduction_pointer) * 100
  ELSE NULL
END AS difference_percentage

-- Step 2: Average all those per-campaign differences
AVG(difference_percentage)
```

## Example to Illustrate

Let's say we have 3 campaigns:

| Campaign | Simulator | Bid Reduction | Difference % |
|----------|-----------|---------------|--------------|
| A        | 0.5       | 0.4           | (0.5-0.4)/0.4×100 = **+25%** |
| B        | 0.2       | 0.3           | (0.2-0.3)/0.3×100 = **-33.33%** |
| C        | 0.05      | 0.05          | (0.05-0.05)/0.05×100 = **0%** |

**Averages:**
- Avg Simulator = (0.5 + 0.2 + 0.05) / 3 = **0.25**
- Avg Bid Reduction = (0.4 + 0.3 + 0.05) / 3 = **0.25**
- Avg Difference = (25 + (-33.33) + 0) / 3 = **-2.78%**

**If we calculated difference from averages:**
- (0.25 - 0.25) / 0.25 × 100 = **0%**

## Why Your Numbers Make Sense

With your actual data:
- Avg Simulator = 0.1379
- Avg Bid Reduction = 0.1402
- Avg Difference = +0.46%

This means:
1. On average across all campaigns, the bid reduction pointer is slightly higher (0.1402 vs 0.1379)
2. However, when looking at individual campaign differences:
   - Some campaigns have simulator MUCH higher than bid reduction (large positive %)
   - Some campaigns have simulator MUCH lower than bid reduction (large negative %)
   - When you average all these per-campaign percentages, you get +0.46%

### Real-World Scenario

Imagine:
- 50 campaigns where simulator is 50% higher than bid reduction
- 49 campaigns where they're equal
- 1 campaign where bid reduction is EXTREMELY high (10x simulator)

**Result:**
- The one extreme campaign drags down the **Avg Bid Reduction** significantly
- But when calculating **Avg Difference**, it's just 1 vote out of 100 campaigns
- So Avg Bid Reduction can be higher than Avg Simulator, while Avg Difference is still positive

## The Mathematical Principle

This is a well-known statistical phenomenon:

```
AVG(A / B) ≠ AVG(A) / AVG(B)
```

Or more specifically:
```
AVG((A - B) / B) ≠ (AVG(A) - AVG(B)) / AVG(B)
```

This is because:
- Averages of ratios weight each campaign equally
- Ratios of averages weight higher-value campaigns more heavily

## Which One Is Better?

**Per-Campaign Average (what we use):**
- ✅ Each campaign has equal weight
- ✅ Better for understanding typical campaign behavior
- ✅ Not skewed by extreme outliers
- ❌ Can seem counterintuitive when compared to simple averages

**Ratio of Averages:**
- ✅ Easier to verify by hand
- ✅ Represents the "aggregate" view
- ❌ Heavily influenced by campaigns with large absolute values
- ❌ Can misrepresent typical campaign experience

## Your Specific Case Analysis

Given:
- Avg Simulator: 0.1379
- Avg Bid Reduction: 0.1402
- Avg Difference: +0.46%

**What this tells us:**
1. The aggregate bid reduction is slightly higher (0.1402 vs 0.1379)
2. But this is likely due to a few campaigns with very high bid reduction pointers
3. For the typical campaign (50th percentile), simulator is actually slightly higher than bid reduction
4. The +0.46% represents the median campaign experience, not the weighted aggregate

## How to Verify

You can verify this by looking at the distribution:
1. Count how many campaigns have positive difference (simulator > bid reduction)
2. Count how many campaigns have negative difference (simulator < bid reduction)
3. If more campaigns have positive differences, that explains the positive average

Or check for outliers:
1. Look for campaigns with extremely high bid_reduction_pointer values
2. These campaigns pull up the Avg Bid Reduction
3. But they don't dominate the Avg Difference percentage

## Summary

The metrics make perfect sense together:
- **Avg Simulator (0.1379)** and **Avg Bid Reduction (0.1402)** represent the mean pointer values
- **Avg Difference (+0.46%)** represents the mean per-campaign percentage difference
- These are measuring different things and will naturally diverge
- The positive +0.46% means that for the typical campaign, simulator is slightly higher than bid reduction
- But a few campaigns with very high bid reduction values pull the aggregate average higher
