'use client';

import { useEffect, useState } from 'react';

interface DatasetInfo {
  name: string;
  displayName: string;
  data: any[];
}

export default function DataPage() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    // Load selected datasets from cookie
    const cookies = document.cookie.split(';');
    const selectedCookie = cookies.find(c => c.trim().startsWith('selectedDatasets='));
    const selectedDatasets = selectedCookie
      ? selectedCookie.split('=')[1].split(',').map(s => s.trim()).filter(s => s.length > 0)
      : [];

    if (selectedDatasets.length === 0) {
      setError('No datasets selected. Please select datasets from Admin → Dataset Selection');
      setLoading(false);
      return;
    }

    // Fetch data for each dataset
    Promise.all(
      selectedDatasets.map(async (datasetName) => {
        const res = await fetch(`/api/data?dataset=${datasetName}`);
        const data = await res.json();

        // Get display name from datasets API
        const datasetsRes = await fetch('/api/datasets');
        const allDatasets = await datasetsRes.json();
        const datasetInfo = allDatasets.find((d: any) => d.name === datasetName);

        return {
          name: datasetName,
          displayName: datasetInfo?.displayName || datasetName,
          data: Array.isArray(data) ? data : []
        };
      })
    )
      .then(datasetsData => {
        setDatasets(datasetsData);
        if (datasetsData.length > 0) {
          setActiveTab(datasetsData[0].name);
        }
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to load data');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">Loading datasets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-red-500">{error}</p>
      </div>
    );
  }

  if (datasets.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-500">No datasets available</p>
      </div>
    );
  }

  const activeDataset = datasets.find(d => d.name === activeTab);
  if (!activeDataset) return null;

  const data = activeDataset.data;

  // Get all unique keys from the data
  const keys = Array.from(new Set(data.flatMap(item => Object.keys(item))));

  // Filter data based on search
  const filteredData = data.filter(item =>
    Object.values(item).some(value =>
      String(value).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Sort data
  const sortedData = sortKey
    ? [...filteredData].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        const multiplier = sortDirection === 'asc' ? 1 : -1;

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return (aVal - bVal) * multiplier;
        }

        return String(aVal).localeCompare(String(bVal)) * multiplier;
      })
    : filteredData;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg">
        {/* Dataset Tabs */}
        <div className="border-b">
          <div className="flex">
            {datasets.map(dataset => (
              <button
                key={dataset.name}
                onClick={() => {
                  setActiveTab(dataset.name);
                  setSearchTerm('');
                  setSortKey('');
                }}
                className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                  activeTab === dataset.name
                    ? 'border-primary text-primary'
                    : 'border-transparent hover:bg-gray-50'
                }`}
                style={activeTab === dataset.name ? {
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)'
                } : {}}
              >
                {dataset.displayName}
                <span className="ml-2 text-sm text-gray-500">
                  ({dataset.data.length})
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          <div className="mb-4 flex justify-between items-center">
            <h2 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
              {activeDataset.displayName}
            </h2>
            <div className="text-sm text-gray-500">
              {sortedData.length} of {data.length} records
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--color-primary)' } as any}
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2" style={{ borderColor: 'var(--color-primary)' }}>
                  {keys.map(key => (
                    <th
                      key={key}
                      className="px-4 py-2 text-left font-semibold cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort(key)}
                    >
                      <div className="flex items-center gap-1">
                        {key}
                        {sortKey === key && (
                          <span className="text-xs">
                            {sortDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    {keys.map(key => (
                      <td key={key} className="px-4 py-2">
                        {typeof item[key] === 'object'
                          ? JSON.stringify(item[key])
                          : String(item[key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
