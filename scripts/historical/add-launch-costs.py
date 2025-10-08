#!/usr/bin/env python3
import json
import re

# Read existing data
with open('data/spacex-launches.json', 'r') as f:
    launches = json.load(f)

print(f"Loaded {len(launches)} launches")

# Launch costs in USD (millions)
# Based on SpaceX pricing and historical contracts

COSTS = {
    # Falcon 1 (early years, developmental)
    'Falcon 1': 7,  # ~$7M per launch

    # Falcon 9 pricing has evolved over time
    'Falcon 9 v1.0': 62,  # Early F9, ~$62M
    'Falcon 9 v1.1': 62,  # ~$62M
    'Falcon 9 FT': 62,    # Full Thrust, ~$62M
    'Falcon 9 Block 5': 62,  # List price ~$62M for new booster

    # Reused boosters (significant discount)
    'reused': 50,  # ~$50M for reused booster mission

    # Falcon Heavy
    'Falcon Heavy': 97,  # ~$97M per launch (reusable config)
    'Falcon Heavy expendable': 150,  # ~$150M for expendable

    # Starship (developmental, estimates)
    'Starship': 10,  # Target cost ~$10M per launch (not yet achieved)
}

# Special pricing for internal missions
INTERNAL_MISSIONS = {
    'Starlink': 15,  # Internal cost estimate for Starlink deployment
    'Crew Dragon': 55,  # NASA Commercial Crew ~$55M per seat × 4 = ~$220M, but launch ~$55M
    'Cargo Dragon': 62,  # Standard F9 pricing
}

added_count = 0

for launch in launches:
    mission = launch['mission_name']
    vehicle = launch.get('vehicle', '')
    date = launch.get('launch_date', '')

    cost = None

    # Determine cost based on vehicle and mission type
    if 'Falcon 1' in vehicle:
        cost = COSTS['Falcon 1']

    elif 'Falcon Heavy' in vehicle:
        # Check if expendable (usually for high-energy orbits)
        if 'STP-2' in mission or 'Arabsat' in mission:
            cost = COSTS['Falcon Heavy expendable']
        else:
            cost = COSTS['Falcon Heavy']

    elif 'Starship' in vehicle:
        cost = COSTS['Starship']

    elif 'Falcon 9' in vehicle:
        # Starlink missions use internal pricing
        if 'Starlink' in mission:
            cost = INTERNAL_MISSIONS['Starlink']

        # Crew missions
        elif 'Crew' in mission or 'Demo-2' in mission:
            cost = INTERNAL_MISSIONS['Crew Dragon']

        # Cargo missions
        elif 'CRS' in mission or 'SpX' in mission:
            cost = INTERNAL_MISSIONS['Cargo Dragon']

        # Check if it's a reused booster (after ~2017)
        elif date >= '2017-03-30':  # First successful reuse
            # Most missions after 2018 use reused boosters
            if date >= '2018-01-01':
                cost = COSTS['reused']
            else:
                cost = COSTS['Falcon 9 Block 5']

        # Early Falcon 9 variants
        else:
            if 'v1.0' in vehicle:
                cost = COSTS['Falcon 9 v1.0']
            elif 'v1.1' in vehicle:
                cost = COSTS['Falcon 9 v1.1']
            else:
                cost = COSTS['Falcon 9 FT']

    if cost:
        launch['launch_cost_usd_millions'] = cost
        added_count += 1

print(f"Added launch cost estimates to {added_count} launches")

# Write updated data
with open('data/spacex-launches.json', 'w') as f:
    json.dump(launches, f, indent=2)

print("Data file updated successfully")

# Show statistics
with_cost = sum(1 for l in launches if l.get('launch_cost_usd_millions'))
print(f"Launches with cost data: {with_cost}/{len(launches)}")

# Calculate total estimated costs
total_cost = sum(l.get('launch_cost_usd_millions', 0) for l in launches)
print(f"Total estimated launch costs: ${total_cost:.1f}M")
