'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

interface DatasetInfo {
  name: string;
  displayName: string;
  description: string;
  domain: string;
}

export default function EditDatasetPage() {
  const router = useRouter();
  const params = useParams();
  const datasetName = params.dataset as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('');

  useEffect(() => {
    if (!datasetName) return;

    // Load dataset info
    fetch(`/api/datasets/${datasetName}`)
      .then(res => res.json())
      .then(data => {
        setDisplayName(data.displayName || '');
        setDescription(data.description || '');
        setDomain(data.type || 'general data');
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load dataset:', err);
        setError('Failed to load dataset');
        setLoading(false);
      });
  }, [datasetName]);

  const handleSave = async () => {
    if (!displayName) {
      setError('Display name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch(`/api/datasets/${datasetName}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          description,
          domain,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to update dataset');
        setSaving(false);
        return;
      }

      // Navigate back to dataset management
      router.push('/admin/datasets');
    } catch (err) {
      console.error('Failed to update dataset:', err);
      setError('Failed to update dataset');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Loading dataset...</p>
      </div>
    );
  }

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
            Edit Dataset Properties
          </h1>
          <p className="text-gray-600 mt-2">
            Update the metadata for <code className="bg-gray-100 px-2 py-1 rounded">{datasetName}</code>
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
              Dataset Name
            </label>
            <input
              type="text"
              value={datasetName}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">
              Dataset name cannot be changed
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
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
          <button
            onClick={() => router.push('/admin/datasets')}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !displayName}
            className="px-6 py-2 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
