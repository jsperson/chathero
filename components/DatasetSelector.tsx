'use client';

import { useState, useEffect } from 'react';

interface Dataset {
  name: string;
  displayName: string;
  recordCount: number;
  description: string;
  hasProjectConfig: boolean;
}

interface DatasetSelectorProps {
  onDatasetChange?: (datasetName: string) => void;
}

export default function DatasetSelector({ onDatasetChange }: DatasetSelectorProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      const response = await fetch('/api/datasets');
      const data = await response.json();

      setDatasets(data.datasets || []);

      // Load last selected dataset from localStorage, or use default
      const saved = localStorage.getItem('selectedDataset');
      const initial = saved || data.default;
      setSelectedDataset(initial);

      // Ensure cookie is set for server-side access
      if (initial) {
        document.cookie = `selectedDataset=${initial}; path=/; max-age=31536000`; // 1 year
      }
    } catch (error) {
      console.error('Failed to load datasets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (datasetName: string) => {
    setSelectedDataset(datasetName);
    localStorage.setItem('selectedDataset', datasetName);

    // Set cookie for server-side access
    document.cookie = `selectedDataset=${datasetName}; path=/; max-age=31536000`; // 1 year

    if (onDatasetChange) {
      onDatasetChange(datasetName);
    }

    // Reload page to apply new dataset
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-500">
        Loading datasets...
      </div>
    );
  }

  if (datasets.length === 0) {
    return null;
  }

  return (
    <div className="inline-block">
      <select
        value={selectedDataset}
        onChange={(e) => handleChange(e.target.value)}
        className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2"
        style={{ '--tw-ring-color': 'var(--color-primary)' } as any}
      >
        {datasets.map((dataset) => (
          <option key={dataset.name} value={dataset.name}>
            {dataset.displayName} ({dataset.recordCount} records)
          </option>
        ))}
      </select>
    </div>
  );
}
