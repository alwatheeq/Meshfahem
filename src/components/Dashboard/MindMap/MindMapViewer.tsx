import React, { useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X, Network } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';

interface MindMapViewerProps {
  nodes: Node[];
  edges: Edge[];
  onClose: () => void;
}

const MindMapViewer: React.FC<MindMapViewerProps> = ({ nodes, edges, onClose }) => {
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeText,
    getThemeTextSecondary,
    getThemeAccent,
  } = useTheme();

  const onInit = useCallback((reactFlowInstance: { fitView: () => void }) => {
    setTimeout(() => reactFlowInstance.fitView(), 100);
  }, []);

  // Apply themed styles to child nodes (non-gradient ones)
  const themedNodes = nodes.map((node, index) => {
    if (index === 0) {
      // Root node keeps its gradient style
      return node;
    }
    return {
      ...node,
      style: {
        ...node.style,
        background: undefined,
        // Tailwind classes cannot be used in inline styles; use CSS-compatible values
      },
      className: `${getThemeCardBg()} ${getThemeCardBorder()} ${getThemeText()}`,
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal container */}
      <div
        className={`relative w-[95vw] h-[90vh] rounded-2xl shadow-2xl overflow-hidden border
          ${getThemeCardBg()} ${getThemeCardBorder()}`}
      >
        {/* Title bar */}
        <div
          className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-3
            border-b backdrop-blur-md bg-white/80 dark:bg-gray-900/80 ${getThemeCardBorder()}`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${getThemeAccent()} bg-opacity-10`}>
              <Network className="w-5 h-5 text-emerald-500" />
            </div>
            <h2 className={`text-lg font-semibold ${getThemeText()}`}>
              Mind Map
            </h2>
            <span className={`text-xs ${getThemeTextSecondary()}`}>
              {nodes.length} concepts
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close mind map"
          >
            <X className={`w-5 h-5 ${getThemeTextSecondary()}`} />
          </button>
        </div>

        {/* ReactFlow canvas */}
        <div className="w-full h-full pt-14">
          <ReactFlow
            nodes={themedNodes}
            edges={edges}
            onInit={onInit}
            fitView
            minZoom={0.2}
            maxZoom={2}
            attributionPosition="bottom-left"
            proOptions={{ hideAttribution: true }}
          >
            <Controls
              position="bottom-right"
              className="!bg-white/90 dark:!bg-gray-800/90 !border-gray-200 dark:!border-gray-700 !rounded-xl !shadow-lg"
            />
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="rgba(148, 163, 184, 0.3)"
            />
            <MiniMap
              position="bottom-left"
              className="!bg-white/90 dark:!bg-gray-800/90 !border-gray-200 dark:!border-gray-700 !rounded-xl !shadow-lg"
              maskColor="rgba(0, 0, 0, 0.1)"
              nodeColor={(node) => {
                // Root node is emerald, children are slate
                return node.style?.background
                  ? '#10b981'
                  : '#94a3b8';
              }}
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};

export default MindMapViewer;
