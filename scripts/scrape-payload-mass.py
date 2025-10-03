#!/usr/bin/env python3
import json
import re
import sys

# Read existing data
with open('data/spacex-launches.json', 'r') as f:
    launches = json.load(f)

print(f"Loaded {len(launches)} launches")

# Common payload masses for Starlink missions (based on historical data)
STARLINK_MASSES = {
    'v0.9': 13620,  # 60 satellites * 227 kg
    'v1.0': 15600,  # 60 satellites * 260 kg
    'v1.5': 15600,  # 60 satellites * 260 kg
    'v2-mini': 17400,  # ~21 satellites * ~800 kg
}

# Known payload masses for major missions
KNOWN_PAYLOADS = {
    'CRS': 2500,  # Dragon cargo ~2500kg
    'Crew': 12500,  # Dragon + crew ~12500kg
    'GPS': 4400,  # GPS III satellites
    'SES': 5300,  # Typical comsat
    'Iridium NEXT': 9600,  # 10 satellites * 860kg + dispenser
    'OneWeb': 5000,  # Batch of OneWeb satellites
}

updated_count = 0

for launch in launches:
    mission = launch['mission_name']
    vehicle = launch.get('vehicle', '')

    # Skip if already has payload mass
    if launch.get('payload_mass_kg') not in [None, 0]:
        continue

    payload_mass = None

    # Starlink missions
    if 'Starlink' in mission:
        # Group 6+ are V2 Mini
        group_match = re.search(r'Group (\d+)-', mission)
        if group_match and int(group_match.group(1)) >= 6:
            payload_mass = STARLINK_MASSES['v2-mini']
        else:
            payload_mass = STARLINK_MASSES['v1.5']

    # CRS missions
    elif 'CRS' in mission or 'SpX' in mission:
        payload_mass = 2500

    # Crew missions
    elif 'Crew' in mission or 'Demo-2' in mission:
        payload_mass = 12500

    # GPS missions
    elif 'GPS' in mission:
        payload_mass = 4400

    # Iridium
    elif 'Iridium' in mission:
        payload_mass = 9600

    # OneWeb
    elif 'OneWeb' in mission:
        payload_mass = 5000

    # SES and other comsats - estimate based on GTO missions
    elif any(x in mission for x in ['SES', 'Intelsat', 'Eutelsat', 'Telstar', 'ViaSat', 'Echostar']):
        payload_mass = 5300

    # Transporter rideshare missions
    elif 'Transporter' in mission:
        payload_mass = 5000

    # Falcon Heavy missions (typically heavier payloads)
    elif vehicle == 'Falcon Heavy':
        if 'Arabsat' in mission:
            payload_mass = 6000
        elif 'STP-2' in mission:
            payload_mass = 3700
        else:
            payload_mass = 6000  # Estimate for FH payloads

    if payload_mass:
        launch['payload_mass_kg'] = payload_mass
        updated_count += 1

print(f"Updated {updated_count} launches with payload mass estimates")

# Write updated data
with open('data/spacex-launches.json', 'w') as f:
    json.dump(launches, f, indent=2)

print("Data file updated successfully")

# Show statistics
null_count = sum(1 for l in launches if l.get('payload_mass_kg') in [None, 0])
print(f"Remaining null values: {null_count}/{len(launches)}")
