# Health
curl -s http://localhost:3000/health | jq

# Track a universe (demo IDs from seed)
curl -s -X POST http://localhost:3000/api/v1/tracking/experiences \
-H 'Content-Type: application/json' \
-d '{"universeId":15506160459, "name":"Demo Obby"}' | jq

# Experience header + snapshot + sparklines
curl -s http://localhost:3000/api/v1/experiences/15506160459 | jq

# History series (7d)
curl -s 'http://localhost:3000/api/v1/experiences/15506160459/history?metric=playing&window=7d' | jq

# Compare two experiences
curl -s 'http://localhost:3000/api/v1/experiences/compare?ids=15506160459,12812920653' | jq

# Radar breakouts
curl -s 'http://localhost:3000/api/v1/radar/breakouts?limit=10' | jq