'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Dataset {
  name: string;
  displayName: string;
  type: string;
  recordCount: number;
}

export default function DatasetManagementPage() {
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load available datasets
    fetch('/api/datasets')
      .then(res => res.json())
      .then(data => {
        setDatasets(data.datasets || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load datasets:', err);
        setLoading(false);
      });

    // Load currently selected datasets from cookie
    const cookies = document.cookie.split(';');
    const selectedCookie = cookies.find(c => c.trim().startsWith('selectedDatasets='));
    if (selectedCookie) {
      const value = selectedCookie.split('=')[1];
      setSelectedDatasets(value.split(',').map(s => s.trim()).filter(s => s.length > 0));
    }
  }, []);

  const handleToggleDataset = (datasetName: string) => {
    setSelectedDatasets(prev => {
      if (prev.includes(datasetName)) {
        return prev.filter(d => d !== datasetName);
      } else {
        return [...prev, datasetName];
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);

    // Save to cookie
    const value = selectedDatasets.join(',');
    document.cookie = `selectedDatasets=${value}; path=/; max-age=31536000`; // 1 year

    // Give feedback
    setTimeout(() => {
      setSaving(false);
      router.push('/');
    }, 500);
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Loading datasets...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-primary)' }}>
          Dataset Management
        </h1>
        <p className="text-gray-600 mb-6">
          Select which datasets to query. You can select multiple datasets for cross-dataset analysis.
        </p>

        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">💡 Multi-Dataset Queries</h3>
          <p className="text-sm text-blue-800">
            When multiple datasets are selected, you can ask questions that correlate data across them.
            Example: &quot;How many launches by president?&quot; will correlate SpaceX launches with presidential terms.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {datasets.map(dataset => (
            <div
              key={dataset.name}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                selectedDatasets.includes(dataset.name)
                  ? 'border-2 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              style={selectedDatasets.includes(dataset.name) ? { borderColor: 'var(--color-primary)' } : {}}
              onClick={() => handleToggleDataset(dataset.name)}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedDatasets.includes(dataset.name)}
                    onChange={() => handleToggleDataset(dataset.name)}
                    className="w-5 h-5"
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{dataset.displayName}</h3>
                  <div className="flex gap-4 text-sm text-gray-600 mt-1">
                    <span>📁 Type: {dataset.type}</span>
                    <span>📊 Records: {dataset.recordCount.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/schema?dataset=${dataset.name}`);
                      }}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      📝 Schema Editor
                    </button>
                    {dataset.hasProjectConfig && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/data/config?dataset=${dataset.name}`);
                        }}
                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        🔧 Configuration
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-600">
            {selectedDatasets.length === 0 && 'No datasets selected'}
            {selectedDatasets.length === 1 && '1 dataset selected'}
            {selectedDatasets.length > 1 && `${selectedDatasets.length} datasets selected (multi-dataset mode)`}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || selectedDatasets.length === 0}
              className="px-6 py-2 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {saving ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
