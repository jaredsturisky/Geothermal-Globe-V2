# Runtime-Terror
Hackathon team. Amol Mathur, Jared Sturisky, Carson Moore, Arkady Marchenko

## Geothermal Globe

Interactive 3D globe for exploring global geothermal energy potential: heat-flow data, composite scores, plate boundaries, and top sites.

### Features

- **Threshold slider** — “High Potential Threshold” (default 0.5) controls which sites count as high potential. The slider (0.00–1.00, step 0.01) updates both the map dots and the Top 20 list immediately.
- **Region filters** — Filter by Continent, Country, and (when USA is selected) State. Filters apply to the map dots, the Top 20 list, and compare-mode candidate selection. Options are derived from the loaded geothermal dataset.
- **Compare mode** — Turn on “Compare mode” and click two points to pin them as Slot A and Slot B. A side-by-side comparison panel shows key metrics (score, heat flow, boundary distance) and a short “Winner and why” summary based on score components (e.g. higher heat flow, closer to plate boundary).

![Screenshot placeholder: globe with sidebar showing threshold, filters, and compare](docs/screenshot-placeholder.png)

### Run

- `npm run dev` — start dev server  
- `npm run build` — production build  
- `npm run test:region` — run minimal tests for region parsing (`parseResolvedPlace`)
