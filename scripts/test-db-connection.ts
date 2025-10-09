/**
 * Database Connection Test Script
 *
 * Tests the database connection configuration
 * Usage: npx ts-node scripts/test-db-connection.ts
 */

import { loadConfig } from '../lib/config';
import { createDataAdapter } from '../lib/adapters/adapter-factory';

async function testConnection() {
  console.log('🔍 Testing database connection...\n');

  try {
    // Load configuration
    console.log('📋 Loading configuration...');
    const config = await loadConfig();

    if (config.dataSource.type !== 'database') {
      console.error('❌ Error: dataSource.type is not "database"');
      console.log('   Current type:', config.dataSource.type);
      console.log('   Please configure database connection in config/app.yaml');
      process.exit(1);
    }

    if (!config.dataSource.database) {
      console.error('❌ Error: database configuration is missing');
      process.exit(1);
    }

    console.log('✅ Configuration loaded');
    console.log('   Database type:', config.dataSource.database.type);
    console.log('   Host:', config.dataSource.database.connection.host);
    console.log('   Database:', config.dataSource.database.connection.database);
    console.log('   Username:', config.dataSource.database.connection.username);
    console.log('');

    // Create adapter (without tables - just for connection test)
    console.log('🔌 Creating database adapter...');
    const adapter = await createDataAdapter(config.dataSource, []);

    if (!('getTables' in adapter) || typeof adapter.getTables !== 'function') {
      console.error('❌ Error: Adapter does not support getTables()');
      process.exit(1);
    }

    console.log('✅ Adapter created\n');

    // Test connection by listing tables
    console.log('📊 Fetching table list...');
    const tables = await adapter.getTables();

    console.log('✅ Connection successful!\n');
    console.log(`Found ${tables.length} tables:\n`);

    tables.forEach((table, index) => {
      console.log(`  ${index + 1}. ${table}`);
    });

    console.log('\n✅ Database connection test completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. Start the development server: npm run dev');
    console.log('  2. Navigate to Admin > Dataset Selection');
    console.log('  3. Select tables to query');
    console.log('  4. Start chatting with your data!');

  } catch (error: any) {
    console.error('\n❌ Database connection test failed!\n');
    console.error('Error:', error.message);

    if (error.code === 'ELOGIN') {
      console.log('\n💡 Troubleshooting tips:');
      console.log('  - Check your username and password in .env.local');
      console.log('  - Verify the user has access to the database');
      console.log('  - For Azure SQL, use full username: user@servername');
    } else if (error.code === 'ETIMEOUT' || error.code === 'ESOCKET') {
      console.log('\n💡 Troubleshooting tips:');
      console.log('  - Check your firewall settings');
      console.log('  - Verify the host and port are correct');
      console.log('  - For Azure SQL, add your IP to the allowlist');
    } else if (error.code === 'ENOTFOUND') {
      console.log('\n💡 Troubleshooting tips:');
      console.log('  - Check that the host name is correct');
      console.log('  - Verify you have network connectivity');
    }

    console.log('\nFull error details:');
    console.error(error);
    process.exit(1);
  }
}

testConnection();
