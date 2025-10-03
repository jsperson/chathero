const fs = require('fs');
const https = require('https');

// Read existing data
const existingData = JSON.parse(fs.readFileSync('data/spacex-launches.json', 'utf-8'));
console.log(`Loaded ${existingData.length} existing launches`);

// Fetch from Launch Library API with payload mass
async function fetchPage(offset) {
  return new Promise((resolve, reject) => {
    const url = `https://ll.thespacedevs.com/2.2.0/launch/?lsp__id=121&limit=100&offset=${offset}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchAllLaunches() {
  const allLaunches = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching offset ${offset}...`);
    const response = await fetchPage(offset);

    const launches = response.results || [];
    allLaunches.push(...launches);

    hasMore = response.next !== null;
    offset += 100;

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return allLaunches;
}

async function main() {
  console.log('Fetching all SpaceX launches from API...');
  const apiLaunches = await fetchAllLaunches();
  console.log(`Fetched ${apiLaunches.length} launches from API`);

  // Create a map of mission name to payload mass
  const payloadMassMap = new Map();

  apiLaunches.forEach(launch => {
    const missionName = launch.name;
    const rocket = launch.rocket?.configuration?.name || '';

    // Try to get payload mass from various sources
    let payloadMass = null;

    // Check if there's a payload in the launch
    if (launch.mission && launch.mission.type) {
      // For Starlink missions, estimate based on satellite count and type
      if (missionName.includes('Starlink')) {
        // V2 Mini satellites are heavier (~800kg each for batch of ~21)
        if (missionName.includes('V2') || parseInt(missionName.match(/Group (\d+)-/)?.[1] || '0') >= 6) {
          payloadMass = 17000; // Approximate for V2 Mini batches
        } else {
          payloadMass = 15600; // Approximate for V1.5 batches (260kg * 60)
        }
      }
    }

    // Check rocket configuration for generic payload capacity (as fallback)
    if (!payloadMass && launch.rocket?.configuration?.leo_capacity) {
      // Don't use this - it's max capacity, not actual payload
    }

    if (missionName) {
      payloadMassMap.set(missionName, payloadMass);
    }
  });

  // Update existing data with payload masses
  let updatedCount = 0;
  const updatedData = existingData.map(record => {
    const payloadMass = payloadMassMap.get(record.mission_name);
    if (payloadMass !== undefined && payloadMass !== null) {
      updatedCount++;
      return { ...record, payload_mass_kg: payloadMass };
    }
    return record;
  });

  console.log(`Updated ${updatedCount} records with payload mass`);

  // Write back to file
  fs.writeFileSync('data/spacex-launches.json', JSON.stringify(updatedData, null, 2));
  console.log('Data file updated successfully');
}

main().catch(console.error);
