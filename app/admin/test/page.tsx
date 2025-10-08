'use client';

import { useState } from 'react';
import Header from '@/components/Header';

interface TestResult {
  name: string;
  status: 'success' | 'failure' | 'skipped';
  message: string;
  duration: number;
  error?: string;
}

interface TestSuite {
  category: string;
  tests: TestResult[];
}

interface TestResponse {
  success: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
  };
  results: TestSuite[];
  timestamp: string;
}

export default function TestDashboard() {
  const [testResults, setTestResults] = useState<TestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    setLoading(true);
    setError(null);
    setTestResults(null);

    try {
      const response = await fetch('/api/admin/test');
      if (!response.ok) {
        throw new Error('Failed to run tests');
      }
      const data = await response.json();
      setTestResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return '✅';
      case 'failure':
        return '❌';
      case 'skipped':
        return '⊝';
      default:
        return '❓';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-600';
      case 'failure':
        return 'text-red-600';
      case 'skipped':
        return 'text-gray-400';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-6xl mx-auto p-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold mb-2">Application Test Suite</h1>
          <p className="text-gray-600 mb-6">
            Run comprehensive tests to verify all application components are working correctly after code modifications.
          </p>

          <button
            onClick={runTests}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '🔄 Running Tests...' : '▶️ Run All Tests'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="text-red-800 font-semibold mb-2">Error</h3>
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {testResults && (
          <>
            {/* Summary */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4">Test Results Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">{testResults.summary.total}</div>
                  <div className="text-sm text-gray-600">Total Tests</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-green-600">{testResults.summary.passed}</div>
                  <div className="text-sm text-gray-600">Passed</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-red-600">{testResults.summary.failed}</div>
                  <div className="text-sm text-gray-600">Failed</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-purple-600">{testResults.summary.duration}ms</div>
                  <div className="text-sm text-gray-600">Duration</div>
                </div>
              </div>

              <div className="mt-4 p-4 rounded-lg" style={{
                backgroundColor: testResults.success ? '#d1fae5' : '#fee2e2'
              }}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{testResults.success ? '✅' : '❌'}</span>
                  <span className="font-semibold" style={{
                    color: testResults.success ? '#065f46' : '#991b1b'
                  }}>
                    {testResults.success ? 'All tests passed!' : 'Some tests failed'}
                  </span>
                </div>
              </div>
            </div>

            {/* Test Suites */}
            {testResults.results.map((suite, idx) => (
              <div key={idx} className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <span>{suite.category}</span>
                  <span className="text-sm font-normal text-gray-500">
                    ({suite.tests.filter(t => t.status === 'success').length}/{suite.tests.length} passed)
                  </span>
                </h3>

                <div className="space-y-2">
                  {suite.tests.map((test, testIdx) => (
                    <div
                      key={testIdx}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-2xl">{getStatusIcon(test.status)}</span>
                          <div className="flex-1">
                            <div className="font-semibold">{test.name}</div>
                            <div className={`text-sm ${getStatusColor(test.status)}`}>
                              {test.message}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-gray-500">
                          {test.duration}ms
                        </div>
                      </div>

                      {test.error && (
                        <div className="mt-3 p-3 bg-red-50 rounded border border-red-200">
                          <div className="text-sm font-semibold text-red-800 mb-1">Error Details:</div>
                          <pre className="text-xs text-red-600 overflow-x-auto whitespace-pre-wrap">
                            {test.error}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Timestamp */}
            <div className="text-center text-sm text-gray-500">
              Test run completed at {new Date(testResults.timestamp).toLocaleString()}
            </div>
          </>
        )}

        {!testResults && !loading && !error && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="text-6xl mb-4">🧪</div>
            <h3 className="text-xl font-semibold mb-2">No tests run yet</h3>
            <p className="text-gray-600">Click "Run All Tests" to start testing your application</p>
          </div>
        )}
      </div>
    </div>
  );
}
