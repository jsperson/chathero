'use client';

import { useState, useEffect } from 'react';

export type PhaseStatus = 'pending' | 'active' | 'completed';

export interface Phase {
  id: string;
  name: string;
  status: PhaseStatus;
  details?: string;
}

interface ProgressStepperProps {
  phases: Phase[];
}

export default function ProgressStepper({ phases }: ProgressStepperProps) {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {phases.map((phase, index) => (
          <div key={phase.id} className="flex items-center flex-1">
            {/* Step Circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                  phase.status === 'completed'
                    ? 'bg-green-500 text-white'
                    : phase.status === 'active'
                    ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-gray-300 text-gray-600'
                }`}
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
              </div>
              <div className="mt-2 text-xs font-medium text-center max-w-[80px]">
                <div
                  className={`${
                    phase.status === 'active'
                      ? 'text-blue-600'
                      : phase.status === 'completed'
                      ? 'text-green-600'
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
    </div>
  );
}
