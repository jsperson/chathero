'use client';

export default function DatasetMaintenance() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold mb-4 flex items-center gap-3">
            🔧 Dataset Maintenance
          </h1>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <div className="text-6xl mb-4">🚧</div>
            <h2 className="text-2xl font-semibold text-blue-900 mb-2">Coming Soon</h2>
            <p className="text-blue-700 mb-4">
              Dataset maintenance features are currently under development.
            </p>
            <div className="text-left max-w-md mx-auto">
              <p className="text-sm text-blue-600 mb-2 font-semibold">Planned Features:</p>
              <ul className="text-sm text-blue-600 space-y-1 list-disc list-inside">
                <li>Upload new datasets</li>
                <li>Edit dataset metadata</li>
                <li>Delete datasets</li>
                <li>Validate dataset schemas</li>
                <li>Dataset statistics and preview</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
