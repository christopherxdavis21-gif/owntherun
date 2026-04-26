
## Goal
When you type a business name like "Starbucks", "Target", or "Galleria Mall", the search should return **multiple matching locations near you** in a clear, easy-to-tap list — not just street addresses.

## Why it isn't working today
Looking at `src/lib/mapbox.functions.ts` and the result list in `MapHub.tsx`:

1. **Mapbox is collapsing duplicate POIs.** A query like "Starbucks" with the current types list often returns just 1–2 POI features because the Geocoding v5 `/mapbox.places` endpoint deduplicates by name and prefers nearby addresses. We need to explicitly request more POIs and use the right query strategy.
2. **The result list is hard to scan on mobile.** `max-h-64` only shows ~3–4 results on a 514px-wide preview, the business name and address share one tight row, and there's no clear visual difference between a business and a street address.
3. **No "search this area" fallback.** If there are no Starbucks within the proximity bias radius, the search returns nothing instead of widening the search.

## Proposed changes

### 1. `src/lib/mapbox.functions.ts` — smarter geocoding
- **Two-pass search for business names:** When the query looks like a business name (no leading number, not all digits), first call Mapbox with `types=poi` and `limit=10` to get businesses, then a second call with `types=address,place` to get addresses, and merge.
- **Add `worldview=us` and `language` params** so chain stores return all branches, not just the corporate HQ.
- **Stop forcing `types=poi.landmark`** — that filter actually excludes most retail/restaurant POIs. Use the broader `poi` type alone for businesses.
- **Widen proximity gracefully:** if the POI pass returns fewer than 3 results within ~25 km of the user, do one more call without proximity to surface farther-away matches (still sorted by distance).
- Keep returning the existing `GeocodeResult[]` shape so the UI doesn't need a data-model change.

### 2. `src/components/MapHub.tsx` — scannable result list
- **Taller dropdown:** change `max-h-64` to `max-h-[60vh]` so 8–10 results are visible on mobile without awkward scrolling inside a tiny box.
- **Two-line result rows** with clear hierarchy:
  - Line 1: business/place **name** (bold) + distance chip on the right
  - Line 2: category (e.g. "Coffee shop") + full address, muted
- **Distinct icon per result type:** `Building2` for POIs/businesses, `MapPin` for street addresses, `Landmark` for places/regions — so multiple Starbucks visually read as a list of businesses.
- **"Showing X results for 'starbucks'" header** above the list when there are 2+ POI matches, so it's obvious you can pick one.
- Empty-state message ("No matches near you — try a broader term") when results are empty after a search completes.

### 3. No database, route, or auth changes
This is a pure search-quality + UI fix. No migrations, no new dependencies.

## Files touched
- `src/lib/mapbox.functions.ts` — update `geocodePlace` (two-pass, broader types, proximity fallback)
- `src/components/MapHub.tsx` — taller dropdown, richer 2-line rows, type-specific icons, results header

## How you'll verify it
After the change, typing "Starbucks" in your area should show a list of nearby Starbucks locations (each with its address and distance), and you can tap any one to plan a route to it. Same for "Target", "Galleria", "Walmart", etc.
