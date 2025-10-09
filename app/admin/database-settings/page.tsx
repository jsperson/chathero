'use client';

import { useState, useEffect } from 'react';

interface DatabaseConfig {
  type: 'sqlserver' | 'postgresql' | 'mysql' | 'sqlite' | '';
  connection: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    file?: string; // For SQLite
  };
}

export default function DatabaseSettings() {
  const [dataSourceType, setDataSourceType] = useState<'file' | 'database'>('file');
  const [dbConfig, setDbConfig] = useState<DatabaseConfig>({
    type: '',
    connection: {
      host: '',
      port: 1433,
      database: '',
      username: '',
      password: '',
    },
  });
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [tables, setTables] = useState<string[]>([]);

  // Load current configuration
  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    try {
      const response = await fetch('/api/admin/database-config');
      if (response.ok) {
        const data = await response.json();
        setDataSourceType(data.dataSourceType || 'file');
        if (data.database) {
          setDbConfig(data.database);
        }
      }
    } catch (error) {
      console.error('Failed to load database config:', error);
    }
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');
    setTables([]);

    try {
      const response = await fetch('/api/admin/database-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ database: dbConfig }),
      });

      const result = await response.json();

      if (response.ok) {
        setTestStatus('success');
        setTestMessage(`✅ Connection successful! Found ${result.tables.length} tables.`);
        setTables(result.tables);
      } else {
        setTestStatus('error');
        setTestMessage(`❌ ${result.error}: ${result.message || ''}`);
      }
    } catch (error: any) {
      setTestStatus('error');
      setTestMessage(`❌ Connection failed: ${error.message}`);
    }
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    setSaveMessage('');

    try {
      const response = await fetch('/api/admin/database-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataSourceType,
          database: dataSourceType === 'database' ? dbConfig : undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setSaveStatus('success');
        setSaveMessage('✅ Configuration and credentials saved successfully! Restart the server to apply changes.');
      } else {
        setSaveStatus('error');
        setSaveMessage(`❌ ${result.error}`);
      }
    } catch (error: any) {
      setSaveStatus('error');
      setSaveMessage(`❌ Save failed: ${error.message}`);
    }
  };

  const getDefaultPort = (type: string) => {
    switch (type) {
      case 'sqlserver': return 1433;
      case 'postgresql': return 5432;
      case 'mysql': return 3306;
      default: return 1433;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full sm:max-w-4xl sm:mx-auto px-4 py-4 sm:p-8">
        <div className="bg-white rounded-lg shadow-md p-6 sm:p-8 overflow-x-hidden">
          <h1 className="text-2xl sm:text-3xl font-bold mb-6">Database Settings</h1>

          {/* Data Source Type Selection */}
          <div className="mb-8 w-full">
            <label className="block text-sm font-semibold mb-3">Data Source Type</label>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dataSourceType"
                  value="file"
                  id="type-file"
                  checked={dataSourceType === 'file'}
                  onChange={(e) => setDataSourceType(e.target.value as 'file')}
                  className="w-4 h-4 flex-shrink-0"
                />
                <label htmlFor="type-file" className="cursor-pointer">File-based (JSON/CSV)</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dataSourceType"
                  value="database"
                  id="type-database"
                  checked={dataSourceType === 'database'}
                  onChange={(e) => setDataSourceType(e.target.value as 'database')}
                  className="w-4 h-4 flex-shrink-0"
                />
                <label htmlFor="type-database" className="cursor-pointer">Database</label>
              </div>
            </div>
          </div>

          {dataSourceType === 'database' && (
            <>
              {/* Database Type */}
              <div className="mb-6">
                <label className="block text-sm font-semibold mb-2">Database Type</label>
                <select
                  value={dbConfig.type}
                  onChange={(e) => {
                    const newType = e.target.value as DatabaseConfig['type'];
                    setDbConfig({
                      ...dbConfig,
                      type: newType,
                      connection: {
                        ...dbConfig.connection,
                        port: getDefaultPort(newType),
                      },
                    });
                  }}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select database type...</option>
                  <option value="sqlserver">SQL Server</option>
                  <option value="postgresql">PostgreSQL (Coming Soon)</option>
                  <option value="mysql">MySQL (Coming Soon)</option>
                  <option value="sqlite">SQLite (Coming Soon)</option>
                </select>
              </div>

              {dbConfig.type && dbConfig.type !== 'sqlite' && (
                <>
                  {/* Host */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold mb-2">Host</label>
                    <input
                      type="text"
                      value={dbConfig.connection.host}
                      onChange={(e) => setDbConfig({
                        ...dbConfig,
                        connection: { ...dbConfig.connection, host: e.target.value }
                      })}
                      placeholder="e.g., localhost or server.database.windows.net"
                      className="w-full p-2 border rounded"
                    />
                  </div>

                  {/* Port */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold mb-2">Port</label>
                    <input
                      type="number"
                      value={dbConfig.connection.port}
                      onChange={(e) => setDbConfig({
                        ...dbConfig,
                        connection: { ...dbConfig.connection, port: parseInt(e.target.value) || 1433 }
                      })}
                      className="w-full p-2 border rounded"
                    />
                  </div>

                  {/* Database Name */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold mb-2">Database Name</label>
                    <input
                      type="text"
                      value={dbConfig.connection.database}
                      onChange={(e) => setDbConfig({
                        ...dbConfig,
                        connection: { ...dbConfig.connection, database: e.target.value }
                      })}
                      placeholder="e.g., MyDatabase"
                      className="w-full p-2 border rounded"
                    />
                  </div>

                  {/* Username */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold mb-2">Username</label>
                    <input
                      type="text"
                      value={dbConfig.connection.username}
                      onChange={(e) => setDbConfig({
                        ...dbConfig,
                        connection: { ...dbConfig.connection, username: e.target.value }
                      })}
                      placeholder="Database username"
                      className="w-full p-2 border rounded"
                    />
                  </div>

                  {/* Password */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold mb-2">Password</label>
                    <input
                      type="password"
                      value={dbConfig.connection.password}
                      onChange={(e) => setDbConfig({
                        ...dbConfig,
                        connection: { ...dbConfig.connection, password: e.target.value }
                      })}
                      placeholder="Database password"
                      className="w-full p-2 border rounded"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Credentials are securely stored in .env.local (not committed to git)
                    </p>
                  </div>
                </>
              )}

              {dbConfig.type === 'sqlite' && (
                <div className="mb-6">
                  <label className="block text-sm font-semibold mb-2">Database File Path</label>
                  <input
                    type="text"
                    value={dbConfig.connection.file || ''}
                    onChange={(e) => setDbConfig({
                      ...dbConfig,
                      connection: { ...dbConfig.connection, file: e.target.value }
                    })}
                    placeholder="e.g., ./data/mydb.sqlite"
                    className="w-full p-2 border rounded"
                  />
                </div>
              )}

              {/* Test Connection Button */}
              <div className="mb-6">
                <button
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing' || !dbConfig.type}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </button>

                {testMessage && (
                  <div className={`mt-4 p-4 rounded ${
                    testStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                  }`}>
                    {testMessage}
                  </div>
                )}

                {tables.length > 0 && (
                  <div className="mt-4 p-4 bg-gray-50 rounded">
                    <h3 className="font-semibold mb-2">Available Tables:</h3>
                    <ul className="list-disc list-inside max-h-48 overflow-y-auto">
                      {tables.map((table, i) => (
                        <li key={i} className="text-sm">{table}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Save Button */}
          <div className="border-t pt-6 mt-8">
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saveStatus === 'saving' ? 'Saving...' : 'Save Configuration'}
            </button>

            {saveMessage && (
              <div className={`mt-4 p-4 rounded ${
                saveStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                {saveMessage}
              </div>
            )}

            {dataSourceType === 'file' && (
              <p className="mt-4 text-sm text-gray-600">
                File-based mode uses datasets from the data directory. Configure datasets in Dataset Selection.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
