'use client';

import { useState } from 'react';

export type PhaseStatus = 'pending' | 'active' | 'completed' | 'warning' | 'error';

export interface PhaseDetail {
  label: string;
  value: string | number | any;
  type?: 'text' | 'code' | 'json' | 'number';
}

export interface Phase {
  id: string;
  name: string;
  status: PhaseStatus;
  details?: string;
  expandedDetails?: PhaseDetail[];
}

interface ProgressStepperProps {
  phases: Phase[];
}

export default function ProgressStepper({ phases }: ProgressStepperProps) {
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  const togglePhase = (phaseId: string) => {
    if (expandedPhase === phaseId) {
      setExpandedPhase(null);
    } else {
      setExpandedPhase(phaseId);
    }
  };

  const renderDetailValue = (detail: PhaseDetail) => {
    switch (detail.type) {
      case 'code':
        return (
          <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
            <code>{detail.value}</code>
          </pre>
        );
      case 'json':
        return (
          <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
            <code>{JSON.stringify(detail.value, null, 2)}</code>
          </pre>
        );
      case 'number':
        return <span className="font-mono text-blue-600">{detail.value}</span>;
      default:
        return <span className="text-gray-700">{detail.value}</span>;
    }
  };

  return (
    <div className="w-full py-4">
      <div className="max-w-3xl mx-auto">
        {/* Phase Stepper */}
        <div className="flex items-center justify-between">
          {phases.map((phase, index) => (
            <div key={phase.id} className="flex items-center flex-1">
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => phase.expandedDetails && togglePhase(phase.id)}
                  disabled={!phase.expandedDetails}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                    phase.status === 'completed'
                      ? 'bg-green-500 text-white'
                      : phase.status === 'warning'
                      ? 'bg-yellow-500 text-white'
                      : phase.status === 'error'
                      ? 'bg-red-500 text-white'
                      : phase.status === 'active'
                      ? 'bg-blue-500 text-white animate-pulse'
                      : 'bg-gray-300 text-gray-600'
                  } ${phase.expandedDetails ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                >
                  {phase.status === 'completed' ? (
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : phase.status === 'warning' ? (
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  ) : phase.status === 'error' ? (
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  ) : phase.status === 'active' ? (
                    <svg
                      className="w-5 h-5 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>
                <div className="mt-2 text-xs font-medium text-center max-w-[80px]">
                  <div
                    className={`${
                      phase.status === 'active'
                        ? 'text-blue-600'
                        : phase.status === 'completed'
                        ? 'text-green-600'
                        : phase.status === 'warning'
                        ? 'text-yellow-600'
                        : phase.status === 'error'
                        ? 'text-red-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {phase.name}
                  </div>
                  {phase.details && phase.status === 'active' && (
                    <div className="text-gray-400 text-[10px] mt-1">
                      {phase.details}
                    </div>
                  )}
                  {phase.expandedDetails && (
                    <div className="text-gray-400 text-[10px] mt-1">
                      {expandedPhase === phase.id ? '▲' : '▼'}
                    </div>
                  )}
                </div>
              </div>

              {/* Connector Line */}
              {index < phases.length - 1 && (
                <div className="flex-1 h-1 mx-2 -mt-8">
                  <div
                    className={`h-full transition-all duration-300 ${
                      phase.status === 'completed'
                        ? 'bg-green-500'
                        : 'bg-gray-300'
                    }`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Expanded Details Panel */}
        {expandedPhase && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4 animate-fadeIn">
            {phases
              .filter(p => p.id === expandedPhase)
              .map(phase => (
                <div key={phase.id}>
                  <h3 className="font-semibold text-sm mb-3 text-gray-800">
                    {phase.name} Details
                  </h3>
                  <div className="space-y-2">
                    {phase.expandedDetails?.map((detail, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="font-medium text-gray-600 mb-1">
                          {detail.label}:
                        </div>
                        <div className="ml-2">
                          {renderDetailValue(detail)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
