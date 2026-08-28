# AIstudy — Business Financial Model (v3)

Spreadsheet financial model for AIstudy: a free, ad-supported study app
powered by the DeepSeek V4 Flash API. **Chat has been removed from the
product and the model.**

## Core idea: one-time cost, lifetime revenue

Generating notes/flashcards/quizzes costs AI money **once**. Every time
the user comes back to study, that same asset earns a new page view and a
new ad impression at **zero extra AI cost**. The model prices this via
**lifetime page views per generated asset** (editable on the Assumptions
sheet): create note = 12 views, flashcards = 15, quiz = 4, folder Study
All = 15/4, essay = 2. Games cost nothing and earn 1 view per play.

## Files

| File | Purpose |
|------|---------|
| `aistudy_financial_model.xlsx` | 8-sheet model, live formulas (yellow = editable, blue = computed) |
| `build_model.py` | Generates the workbook |

Rebuild: `.venv/bin/python businessplan/build_model.py`

## Key assumptions

- DeepSeek V4 Flash: $0.14/$0.0028 per 1M input (miss/hit), $0.28 per 1M
  output; editable cache-hit rate.
- AI cost per action is length-driven: Short/Medium/Long PDF + Slides,
  per-action input/output token multipliers, editable upload mix.
- Google Ads CPM range **$2.00–$8.00**; 2 sticky slots, 95% viewability,
  30% ad-block; revenue per page view at both CPM ends.
- Hosting: $20/mo fixed + $0.005/MAU/mo variable (editable); Scale Model
  profit is net of AI cost + hosting.
- Usage tiers: Heavy 12 acts/day + 3 games, Moderate 5+2, Light 2+1,
  Casual 0.5+0.5 (editable).

## Sheet guide

1. **Assumptions** — pricing, doc lengths, upload mix, action token
   multipliers, folder size, **lifetime views per asset**, CPM range,
   viewability, ad-block, usage tiers.
2. **Cost Per Action** — $ cost per action by document length + weighted
   average.
3. **Unit Economics** — avg cost vs lifetime revenue at $2 and $8 CPM,
   profit, break-even CPM per action.
4. **Usage Mix** — share of daily paid actions per tier.
5. **Per-User P&L** — monthly AI cost, revenue, profit per tier at both
   CPM ends.
6. **Scale Model** — editable user counts → business totals at $2/$8 CPM,
   12-month projection at 5%/month growth.
7. **Break-Even** — revenue per page view across the $2–$8 sweep and
   per-action break-even CPM.
8. **Scenarios** — heavy-user profit grid: CPM × 1/2/3 ad slots.

## Headline findings (default assumptions)

| Metric | Value |
|--------|-------|
| Revenue per page view | $0.00266 @$2 / $0.01064 @$8 |
| Create note (12 views) | cost $0.0035 → **+$0.028 @$2** |
| Flashcards (15 views) | cost $0.0067 → **+$0.033 @$2** |
| Study All folder (15 views) | cost $0.0335 → **+$0.006 @$2** |
| Essay grading (2 views) | cost $0.0059 → −$0.0006 @$2, +$0.015 @$8 |
| Break-even CPMs | create note $0.22 · flashcards $0.34 · essay $2.21 · folder quiz $7.63 |
| Heavy user | **+$1.64/mo @$2**, +$20.55 @$8 |
| Light / Moderate / Casual | +$0.31 / +$0.59 / +$0.06 @$2 |
| 16k users (base mix) | **+$3,432/mo @$2** (net of $6,765 AI + $100 hosting), +$34,323 @$8 |

## Sensitivity levers

- **Lifetime views** dominate everything: doubling the revisit rate
  doubles revenue at zero cost.
- **Essay grading** is the weakest link (2 views) — could be priced,
  bundled with more reviews, or optimized.
- **Folder quiz** break-even is $7.63 CPM — cap folder size or use cache
  hits to bring it down.
- Ad stack (3 slots, higher CPM) multiplies the already-positive numbers.

Edit yellow cells to test any combination live.
