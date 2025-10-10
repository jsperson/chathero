'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateDatasetPage() {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<'file' | 'database'>('file');
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('general data');
  const [dataType, setDataType] = useState<'json' | 'csv'>('json');

  // Database connection fields
  const [dbType, setDbType] = useState<'sqlserver' | 'postgresql' | 'mysql'>('sqlserver');
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('1433');
  const [dbName, setDbName] = useState('');
  const [dbUsername, setDbUsername] = useState('');
  const [dbPassword, setDbPassword] = useState('');

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const normalizedName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  const handleCreate = async () => {
    if (!normalizedName) {
      setError('Dataset name is required');
      return;
    }

    if (!displayName) {
      setError('Display name is required');
      return;
    }

    if (sourceType === 'database') {
      if (!dbHost || !dbName || !dbUsername) {
        setError('Database host, name, and username are required');
        return;
      }
    }

    setCreating(true);
    setError('');

    try {
      const payload = {
        name: normalizedName,
        displayName,
        description,
        domain,
        sourceType,
        ...(sourceType === 'file' ? {
          dataType,
        } : {
          database: {
            type: dbType,
            host: dbHost,
            port: parseInt(dbPort),
            database: dbName,
            username: dbUsername,
            password: dbPassword,
          }
        })
      };

      const response = await fetch('/api/datasets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to create dataset');
        setCreating(false);
        return;
      }

      // Navigate to the new dataset's table management page
      router.push(`/admin/datasets/${normalizedName}`);
    } catch (err) {
      console.error('Failed to create dataset:', err);
      setError('Failed to create dataset');
      setCreating(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/admin/datasets')}
            className="text-gray-600 hover:text-gray-800 mb-4 flex items-center gap-1"
          >
            ← Back to Datasets
          </button>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--color-primary)' }}>
            Create New Dataset
          </h1>
          <p className="text-gray-600 mt-2">
            Create a new dataset from either file-based data or a database connection.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Source Type *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="file"
                  checked={sourceType === 'file'}
                  onChange={(e) => setSourceType(e.target.value as 'file' | 'database')}
                  className="mr-2"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span>📁 File-Based (JSON/CSV)</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  value="database"
                  checked={sourceType === 'database'}
                  onChange={(e) => setSourceType(e.target.value as 'file' | 'database')}
                  className="mr-2"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span>🗄️ Database Connection</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {sourceType === 'file'
                ? 'Store data in JSON or CSV files'
                : 'Connect to an existing database'
              }
            </p>
          </div>

          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dataset Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_dataset"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {normalizedName && normalizedName !== name && (
              <p className="text-xs text-gray-500 mt-1">
                Will be saved as: <code className="bg-gray-100 px-1 rounded">{normalizedName}</code>
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Name will be normalized to lowercase with underscores
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Display Name *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Dataset"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Friendly name shown in the UI
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this dataset..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Domain
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="general data"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Domain or category (e.g., "finance", "healthcare", "general data")
            </p>
          </div>

          {sourceType === 'file' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Type *
              </label>
              <div className="flex gap-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    value="json"
                    checked={dataType === 'json'}
                    onChange={(e) => setDataType(e.target.value as 'json' | 'csv')}
                    className="mr-2"
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span>JSON</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    value="csv"
                    checked={dataType === 'csv'}
                    onChange={(e) => setDataType(e.target.value as 'json' | 'csv')}
                    className="mr-2"
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span>CSV</span>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                File format for this dataset (cannot be changed later)
              </p>
            </div>
          ) : (
            <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
              <h3 className="font-medium text-gray-900">Database Connection Details</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Database Type *
                </label>
                <select
                  value={dbType}
                  onChange={(e) => {
                    setDbType(e.target.value as 'sqlserver' | 'postgresql' | 'mysql');
                    // Update default port based on database type
                    if (e.target.value === 'sqlserver') setDbPort('1433');
                    else if (e.target.value === 'postgresql') setDbPort('5432');
                    else if (e.target.value === 'mysql') setDbPort('3306');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="sqlserver">SQL Server</option>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Host *
                  </label>
                  <input
                    type="text"
                    value={dbHost}
                    onChange={(e) => setDbHost(e.target.value)}
                    placeholder="localhost"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Port *
                  </label>
                  <input
                    type="number"
                    value={dbPort}
                    onChange={(e) => setDbPort(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Database Name *
                </label>
                <input
                  type="text"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  placeholder="my_database"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={dbUsername}
                    onChange={(e) => setDbUsername(e.target.value)}
                    placeholder="username"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={dbPassword}
                    onChange={(e) => setDbPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional - can use environment variables instead
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
          <button
            onClick={() => router.push('/admin/datasets')}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !normalizedName || !displayName}
            className="px-6 py-2 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {creating ? 'Creating...' : 'Create Dataset'}
          </button>
        </div>
      </div>
    </div>
  );
}
