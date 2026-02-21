import pandas as pd
import json
import numpy as np
from sklearn.neighbors import BallTree

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
df = df[df['heat_flow'] > 0]

# Normalize heat flow to [0, 1] using 99.5th percentile cap to handle outliers
cap = df['heat_flow'].quantile(0.995)
df['hf_score'] = df['heat_flow'].clip(upper=cap) / cap

# ── 2. Load plate boundary points ────────────────────────────────────────────
boundaries = pd.read_csv('datasets/all.csv')
boundaries = boundaries.dropna(subset=['lat', 'lon'])

# Build a BallTree on boundary coords using haversine (expects radians)
boundary_rad = np.radians(boundaries[['lat', 'lon']].values)
tree = BallTree(boundary_rad, metric='haversine')

# ── 3. Query nearest boundary distance for every measurement ─────────────────
measurement_rad = np.radians(df[['lat_NS', 'long_EW']].values)
distances, _ = tree.query(measurement_rad, k=1)
distances_km = distances[:, 0] * 6371.0   # radians → km

# Proximity score: exponential decay, sigma = 300 km
# At boundary (0 km) → 1.0; at 300 km → 0.37; at 900 km → 0.05
sigma_km = 300.0
df['proximity'] = np.exp(-distances_km / sigma_km)

# ── 4. Composite score: 70% heat flow + 30% plate boundary proximity ─────────
# Heat flow is the primary signal; proximity lifts geologically plausible areas
df['score'] = (0.70 * df['hf_score'] + 0.30 * df['proximity']).round(4)

# ── 5. Export ─────────────────────────────────────────────────────────────────
records = [
    {"coordinates": [round(row['long_EW'], 4), round(row['lat_NS'], 4)], "score": row['score']}
    for _, row in df.iterrows()
]

with open('public/geothermal_data.json', 'w') as f:
    json.dump(records, f, separators=(',', ':'))

print(f"Exported {len(records)} records")
print(f"Score stats — min: {df['score'].min():.4f}, mean: {df['score'].mean():.4f}, max: {df['score'].max():.4f}")
