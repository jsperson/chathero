'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface DatasetInfo {
  name: string;
  displayName: string;
  data: any[];
  total: number;
  hasMore: boolean;
}

export default function DataPage() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 100;

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

    // Fetch data for each dataset with pagination
    Promise.all(
      selectedDatasets.map(async (datasetName) => {
        const res = await fetch(`/api/data?dataset=${datasetName}&offset=0&limit=${PAGE_SIZE}`);
        const response = await res.json();

        // Get display name from datasets API
        const datasetsRes = await fetch('/api/datasets');
        const datasetsResponse = await datasetsRes.json();
        const datasetInfo = datasetsResponse.datasets?.find((d: any) => d.name === datasetName);

        return {
          name: datasetName,
          displayName: datasetInfo?.displayName || datasetName,
          data: response.data || [],
          total: response.total || 0,
          hasMore: response.hasMore || false
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
  }, [PAGE_SIZE]);

  const loadMoreData = useCallback(async () => {
    const activeDataset = datasets.find(d => d.name === activeTab);
    if (!activeDataset || !activeDataset.hasMore || loadingMore) return;

    setLoadingMore(true);
    try {
      const offset = activeDataset.data.length;
      const res = await fetch(`/api/data?dataset=${activeTab}&offset=${offset}&limit=${PAGE_SIZE}`);
      const response = await res.json();

      setDatasets(prev => prev.map(ds => {
        if (ds.name === activeTab) {
          return {
            ...ds,
            data: [...ds.data, ...response.data],
            hasMore: response.hasMore
          };
        }
        return ds;
      }));
    } catch (err) {
      console.error('Failed to load more data:', err);
    }
    setLoadingMore(false);
  }, [datasets, activeTab, loadingMore, PAGE_SIZE]);

  // Infinite scroll handler
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Load more when scrolled to within 200px of bottom
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMoreData();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [loadMoreData]);

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
                  ({dataset.data.length} of {dataset.total})
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
              {searchTerm ? `${sortedData.length} of ${data.length} loaded` : `${data.length} of ${activeDataset.total} records`}
              {data.length < activeDataset.total && !searchTerm && (
                <span className="ml-2 text-blue-600">(scroll for more)</span>
              )}
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
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto" ref={scrollContainerRef}>
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

            {/* Loading more indicator */}
            {loadingMore && (
              <div className="text-center py-4 text-gray-500">
                Loading more records...
              </div>
            )}

            {/* End of data indicator */}
            {!activeDataset.hasMore && activeDataset.data.length > 0 && (
              <div className="text-center py-4 text-gray-400 text-sm">
                All {activeDataset.total} records loaded
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
