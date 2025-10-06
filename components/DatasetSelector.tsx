'use client';

import { useState, useEffect, useRef } from 'react';

interface Dataset {
  name: string;
  displayName: string;
  recordCount: number;
  description: string;
  hasProjectConfig: boolean;
}

interface DatasetSelectorProps {
  onDatasetChange?: (datasetNames: string[]) => void;
}

export default function DatasetSelector({ onDatasetChange }: DatasetSelectorProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDatasets();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadDatasets = async () => {
    try {
      const response = await fetch('/api/datasets');
      const data = await response.json();

      setDatasets(data.datasets || []);

      // Load last selected datasets from localStorage, or use default
      const saved = localStorage.getItem('selectedDatasets');
      let initial: string[] = [];

      if (saved) {
        try {
          initial = JSON.parse(saved);
        } catch {
          // If parsing fails, use default
          initial = [data.default];
        }
      } else {
        initial = [data.default];
      }

      setSelectedDatasets(initial);

      // Ensure cookie is set for server-side access (comma-separated)
      if (initial.length > 0) {
        document.cookie = `selectedDatasets=${initial.join(',')}; path=/; max-age=31536000`; // 1 year
      }
    } catch (error) {
      console.error('Failed to load datasets:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDataset = (datasetName: string) => {
    const newSelection = selectedDatasets.includes(datasetName)
      ? selectedDatasets.filter(d => d !== datasetName)
      : [...selectedDatasets, datasetName];

    // Ensure at least one dataset is selected
    if (newSelection.length === 0) {
      return;
    }

    setSelectedDatasets(newSelection);
    localStorage.setItem('selectedDatasets', JSON.stringify(newSelection));

    // Set cookie for server-side access (comma-separated)
    document.cookie = `selectedDatasets=${newSelection.join(',')}; path=/; max-age=31536000`; // 1 year

    if (onDatasetChange) {
      onDatasetChange(newSelection);
    }

    // Reload page to apply new dataset selection
    window.location.reload();
  };

  const selectAll = () => {
    const allDatasetNames = datasets.map(d => d.name);
    setSelectedDatasets(allDatasetNames);
    localStorage.setItem('selectedDatasets', JSON.stringify(allDatasetNames));
    document.cookie = `selectedDatasets=${allDatasetNames.join(',')}; path=/; max-age=31536000`;

    if (onDatasetChange) {
      onDatasetChange(allDatasetNames);
    }

    window.location.reload();
  };

  const clearAll = () => {
    // Keep first dataset to ensure at least one is selected
    const firstDataset = datasets.length > 0 ? [datasets[0].name] : [];
    setSelectedDatasets(firstDataset);
    localStorage.setItem('selectedDatasets', JSON.stringify(firstDataset));
    document.cookie = `selectedDatasets=${firstDataset.join(',')}; path=/; max-age=31536000`;

    if (onDatasetChange) {
      onDatasetChange(firstDataset);
    }

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
    <div className="inline-block relative" ref={dropdownRef}>
      {/* Collapsed State */}
      <div
        className="border rounded-lg px-4 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📊 Datasets</span>
          <span
            className="px-2 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {selectedDatasets.length}
          </span>
          <span className="text-xs text-gray-500">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded State */}
      {expanded && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[300px]">
          {/* Action Buttons */}
          <div className="flex gap-2 p-3 border-b">
            <button
              onClick={(e) => { e.stopPropagation(); selectAll(); }}
              className="flex-1 px-3 py-1 text-xs border rounded hover:bg-gray-50"
            >
              Select All
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); clearAll(); }}
              className="flex-1 px-3 py-1 text-xs border rounded hover:bg-gray-50"
            >
              Clear All
            </button>
          </div>

          {/* Dataset List */}
          <div className="max-h-[400px] overflow-y-auto">
            {datasets.map((dataset) => (
              <div
                key={dataset.name}
                className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                onClick={(e) => { e.stopPropagation(); toggleDataset(dataset.name); }}
              >
                <input
                  type="checkbox"
                  checked={selectedDatasets.includes(dataset.name)}
                  onChange={() => {}}
                  className="mt-1"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">{dataset.displayName}</div>
                  <div className="text-xs text-gray-500">{dataset.recordCount} records</div>
                  {dataset.description && (
                    <div className="text-xs text-gray-400 mt-1">{dataset.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
