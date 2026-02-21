import pandas as pd
import json
import numpy as np
from sklearn.neighbors import BallTree
from collections import defaultdict

# ── 1. Load heat flow measurements ───────────────────────────────────────────
df = pd.read_excel(
    'datasets/IHFC_2024_GHFDB.xlsx',
    header=5,          # row index 5 (row 6 in Excel) is the field name row
    usecols=['lat_NS', 'long_EW', 'qc', 'q']
)

# Use corrected heat flow (qc) where available, fall back to q
df['heat_flow'] = df['qc'].combine_first(df['q'])

# Drop rows with missing coords or non-positive heat flow
df = df.dropna(subset=['lat_NS', 'long_EW', 'heat_flow'])
df = df[df['heat_flow'] > 0].copy()
df = df.reset_index(drop=True)

# Normalize heat flow to [0, 1] using 99.5th percentile cap to handle outliers
cap = df['heat_flow'].quantile(0.995)
df['hf_score'] = df['heat_flow'].clip(upper=cap) / cap

# ── 2. Load plate boundaries and build BallTree ───────────────────────────────
boundaries = pd.read_csv('datasets/all.csv').dropna(subset=['lat', 'lon'])
boundary_rad = np.radians(boundaries[['lat', 'lon']].values)
tree = BallTree(boundary_rad, metric='haversine')

# ── 3. Distance to nearest boundary for every measurement ────────────────────
measurement_rad = np.radians(df[['lat_NS', 'long_EW']].values)
distances, _ = tree.query(measurement_rad, k=1)
df['dist_km'] = distances[:, 0] * 6371.0

# Proximity score: exponential decay, sigma = 300 km
sigma_km = 300.0
df['proximity'] = np.exp(-df['dist_km'] / sigma_km)

# ── 4. Composite score: 70% heat flow + 30% plate boundary proximity ─────────
df['score'] = (0.70 * df['hf_score'] + 0.30 * df['proximity']).round(4)

print(f"Score stats — min: {df['score'].min():.4f}, mean: {df['score'].mean():.4f}, max: {df['score'].max():.4f}")

# ── 5. Export main heatmap data (with hf and bd for click-to-inspect) ────────
records = [
    {
        "coordinates": [round(row['long_EW'], 4), round(row['lat_NS'], 4)],
        "score": row['score'],
        "hf": round(float(row['heat_flow']), 1),
        "bd": round(float(row['dist_km']), 1),
    }
    for _, row in df.iterrows()
]

with open('public/geothermal_data.json', 'w') as f:
    json.dump(records, f, separators=(',', ':'))
print(f"Exported {len(records)} heatmap records")

# ── 6. Top 20 sites: greedy pick by score with 500 km minimum separation ──────
df_sorted = df.sort_values('score', ascending=False)
top_sites = []
MIN_SEP_KM = 500

for _, row in df_sorted.iterrows():
    if len(top_sites) >= 20:
        break
    lat_r = np.radians(row['lat_NS'])
    lon_r = np.radians(row['long_EW'])
    too_close = False
    for site in top_sites:
        dlat = lat_r - np.radians(site['lat'])
        dlon = lon_r - np.radians(site['lon'])
        a = np.sin(dlat/2)**2 + np.cos(lat_r) * np.cos(np.radians(site['lat'])) * np.sin(dlon/2)**2
        if 2 * 6371 * np.arcsin(np.sqrt(np.clip(a, 0, 1))) < MIN_SEP_KM:
            too_close = True
            break
    if not too_close:
        top_sites.append({
            'rank': len(top_sites) + 1,
            'lat': round(float(row['lat_NS']), 4),
            'lon': round(float(row['long_EW']), 4),
            'score': round(float(row['score']), 4),
            'hf': round(float(row['heat_flow']), 1),
            'bd': round(float(row['dist_km']), 1),
        })

with open('public/top_sites.json', 'w') as f:
    json.dump(top_sites, f, indent=2)
print(f"Exported {len(top_sites)} top sites")

# ── 7. Plate boundary paths for PathLayer ─────────────────────────────────────
# Group consecutive same-plate rows into path segments
boundaries_raw = pd.read_csv('datasets/all.csv')
segments = defaultdict(list)
for _, row in boundaries_raw.dropna(subset=['lat', 'lon']).iterrows():
    segments[row['plate']].append([round(float(row['lon']), 4), round(float(row['lat']), 4)])

boundary_paths = [{'plate': plate, 'path': pts} for plate, pts in segments.items()]

with open('public/plate_boundaries.json', 'w') as f:
    json.dump(boundary_paths, f, separators=(',', ':'))
print(f"Exported {len(boundary_paths)} plate boundary paths")
