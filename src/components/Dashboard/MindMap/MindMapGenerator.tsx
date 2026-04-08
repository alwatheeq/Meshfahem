import React, { useEffect, useState, useCallback } from 'react';
import { type Node, type Edge } from '@xyflow/react';
import { Brain, RefreshCw, AlertTriangle } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../contexts/I18nContext';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { parseAIResponse, conceptsToFlow, generatePrompt } from './mindMapUtils';
import MindMapViewer from './MindMapViewer';

interface MindMapGeneratorProps {
  text: string;
  itemId?: string;
  onClose: () => void;
}

type GeneratorState = 'loading' | 'success' | 'error';

const MindMapGenerator: React.FC<MindMapGeneratorProps> = ({ text, itemId, onClose }) => {
  const { getThemeCardBg, getThemeCardBorder, getThemeText, getThemeTextSecondary, getThemeAccent } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();

  const [state, setState] = useState<GeneratorState>('loading');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const generate = useCallback(async () => {
    setState('loading');
    setErrorMessage('');

    try {
      const prompt = generatePrompt(text);

      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: {
          message: prompt,
          conversationId: `mindmap-${Date.now()}`,
          action: 'mind_map',
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate mind map');
      }

      const responseText = typeof data === 'string' ? data : data?.response || data?.message || JSON.stringify(data);
      const concepts = parseAIResponse(responseText);
      const flow = conceptsToFlow(concepts);

      setNodes(flow.nodes);
      setEdges(flow.edges);
      setState('success');

      // Cache to user_library_items if itemId is provided
      if (itemId && user) {
        try {
          await supabase
            .from('user_library_items')
            .update({ mind_map_data: { concepts, nodes: flow.nodes, edges: flow.edges } })
            .eq('id', itemId)
            .eq('user_id', user.id);
        } catch (cacheError) {
          console.warn('Failed to cache mind map data:', cacheError);
        }
      }
    } catch (err) {
      console.error('Mind map generation error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
      setState('error');
    }
  }, [text, itemId, user]);

  useEffect(() => {
    generate();
  }, [generate]);

  // Loading state
  if (state === 'loading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <div
          className={`relative z-10 w-80 rounded-2xl shadow-2xl border p-8 text-center
            ${getThemeCardBg()} ${getThemeCardBorder()}`}
        >
          {/* Pulsing brain animation */}
          <div className="relative mx-auto mb-6 w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
            <div className="absolute inset-2 rounded-full bg-emerald-500/30 animate-pulse" />
            <div className="relative flex items-center justify-center w-full h-full rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30">
              <Brain className="w-10 h-10 text-white animate-pulse" />
            </div>
          </div>

          <h3 className={`text-lg font-semibold mb-2 ${getThemeText()}`}>
            {t('generating_mind_map') || 'Generating Mind Map'}
          </h3>
          <p className={`text-sm ${getThemeTextSecondary()}`}>
            {t('analyzing_concepts') || 'Analyzing concepts and relationships...'}
          </p>

          {/* Animated dots */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-emerald-500"
                style={{
                  animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>

          <button
            onClick={onClose}
            className={`mt-6 text-xs ${getThemeTextSecondary()} hover:underline`}
          >
            {t('cancel') || 'Cancel'}
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <div
          className={`relative z-10 w-96 rounded-2xl shadow-2xl border p-8 text-center
            ${getThemeCardBg()} ${getThemeCardBorder()}`}
        >
          <div className="mx-auto mb-5 w-16 h-16 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>

          <h3 className={`text-lg font-semibold mb-2 ${getThemeText()}`}>
            {t('generation_failed') || 'Generation Failed'}
          </h3>
          <p className={`text-sm mb-6 ${getThemeTextSecondary()}`}>
            {errorMessage}
          </p>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors
                ${getThemeCardBorder()} ${getThemeTextSecondary()}
                hover:bg-gray-100 dark:hover:bg-gray-700`}
            >
              {t('close') || 'Close'}
            </button>
            <button
              onClick={generate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md
                shadow-emerald-500/20"
            >
              <RefreshCw className="w-4 h-4" />
              {t('retry') || 'Retry'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success — render the viewer
  return <MindMapViewer nodes={nodes} edges={edges} onClose={onClose} />;
};

export default MindMapGenerator;
