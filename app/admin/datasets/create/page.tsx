'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateDatasetPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('general data');
  const [dataType, setDataType] = useState<'json' | 'csv'>('json');
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

    setCreating(true);
    setError('');

    try {
      const response = await fetch('/api/datasets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          displayName,
          description,
          domain,
          dataType,
        }),
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
            Create a new file-based dataset. You'll be able to add tables and data after creation.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
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
              <label className="flex items-center">
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
