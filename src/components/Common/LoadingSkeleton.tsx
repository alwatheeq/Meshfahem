import React from 'react';

interface LoadingSkeletonProps {
  type?: 'text' | 'card' | 'table' | 'page';
  count?: number;
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  type = 'text',
  count = 1,
  className = '',
}) => {
  const renderSkeleton = () => {
    switch (type) {
      case 'text':
        return (
          <div className={`animate-pulse space-y-3 ${className}`}>
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-full"></div>
            ))}
          </div>
        );

      case 'card':
        return (
          <div className={`space-y-4 ${className}`}>
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse card-base"
              >
                <div className="h-6 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-3/4 mb-4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-5/6"></div>
                </div>
              </div>
            ))}
          </div>
        );

      case 'table':
        return (
          <div className={`animate-pulse card-base overflow-hidden ${className}`}>
            <div className="bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-slate-700 p-4">
              <div className="h-4 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-600 rounded w-1/4"></div>
            </div>
            <div className="p-4 space-y-3">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <div className="h-4 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-1/4"></div>
                  <div className="h-4 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-1/3"></div>
                  <div className="h-4 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-1/4"></div>
                  <div className="h-4 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-1/6"></div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'page':
        return (
          <div className={`animate-pulse space-y-6 ${className}`}>
            <div className="h-8 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-1/2"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card-base space-y-3">
                  <div className="h-6 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-10 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-1/2"></div>
                </div>
              ))}
            </div>
            <div className="card-base space-y-4 mt-6">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="h-4 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded w-full"></div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return renderSkeleton();
};

export const PageLoadingSkeleton: React.FC = () => (
  <div className="flex justify-center items-center py-12">
    <div className="space-y-4 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      <p className="text-gray-600 dark:text-gray-400">Loading...</p>
    </div>
  </div>
);
