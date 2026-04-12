import React, { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Brain, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../contexts/I18nContext';

interface MindMapNode {
  id: string;
  label: string;
  description?: string;
}

interface MindMapEdge {
  source: string;
  target: string;
  label?: string;
}

interface MindMapData {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

interface MindMapViewProps {
  text: string;
  title?: string;
}

function layoutWithDagre(
  rawNodes: MindMapNode[],
  rawEdges: MindMapEdge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });

  rawNodes.forEach((n) => {
    g.setNode(n.id, { width: 200, height: 60 });
  });
  rawEdges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  const nodes: Node[] = rawNodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: 'mindMapNode',
      position: { x: pos.x - 100, y: pos.y - 30 },
      data: { label: n.label, description: n.description ?? '' },
    };
  });

  const edges: Edge[] = rawEdges.map((e, i) => ({
    id: `e-${e.source}-${e.target}-${i}`,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: { stroke: '#6366f1' },
  }));

  return { nodes, edges };
}

function CustomNode({ data }: NodeProps) {
  const { getThemeCardBg } = useTheme();
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative cursor-pointer"
      onClick={() => setShowTooltip((v) => !v)}
    >
      <Handle type="target" position={Position.Top} className="!bg-indigo-400" />
      <div
        className="rounded-lg border px-4 py-3 shadow-sm text-sm font-medium min-w-[140px] text-center transition-shadow hover:shadow-md"
        style={{ background: getThemeCardBg(), borderColor: '#6366f140' }}
      >
        {data.label as string}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400" />

      {showTooltip && (data.description as string) && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 rounded-lg border px-3 py-2 text-xs shadow-lg max-w-[220px] whitespace-pre-wrap"
          style={{ background: getThemeCardBg(), borderColor: '#6366f140' }}
        >
          {data.description as string}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { mindMapNode: CustomNode };

export default function MindMapView({ text, title }: MindMapViewProps) {
  const { getThemeCardBg } = useTheme();
  const { t } = useI18n();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summarySlice = text.trim().slice(0, 12000);
      const { data, error: fnError } = await supabase.functions.invoke('chat-assistant', {
        body: {
          message:
            'Extract key concepts and their relationships from the study material in summary_text. Return ONLY valid JSON in this format: {"nodes": [{"id": "1", "label": "Concept Name", "description": "Brief description"}], "edges": [{"source": "1", "target": "2", "label": "relates to"}]}. No markdown fences or extra commentary.',
          summary_text: summarySlice.length >= 10 ? summarySlice : 'Study material for mind map generation.',
          one_shot: true,
          topics: [],
          medical_mode: false,
        },
      });

      if (fnError) throw fnError;

      const raw: string =
        typeof data === 'string'
          ? data
          : data && typeof data === 'object' && data !== null && 'message' in data
            ? String((data as { message?: unknown }).message ?? '')
            : JSON.stringify(data);

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const parsed: MindMapData = JSON.parse(jsonMatch[0]);
      if (!parsed.nodes?.length) throw new Error('Empty mind map data');

      const layout = layoutWithDagre(parsed.nodes, parsed.edges ?? []);
      setNodes(layout.nodes);
      setEdges(layout.edges);
      setGenerated(true);
    } catch (err) {
      console.error('Mind map generation failed:', err);
      setError(t('mind_map.error'));
    } finally {
      setLoading(false);
    }
  }, [text, t, setNodes, setEdges]);

  const flowStyles = useMemo(
    () => ({ background: getThemeCardBg() }),
    [getThemeCardBg],
  );

  if (!generated) {
    return (
      <div
        className="rounded-lg border p-6 flex flex-col items-center gap-4"
        style={{ background: getThemeCardBg(), borderColor: '#6366f120' }}
      >
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Brain className="w-5 h-5 text-indigo-500" />
          <span>{title ?? t('mind_map.title')}</span>
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <button
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('mind_map.generating')}
            </>
          ) : error ? (
            <>
              <RefreshCw className="w-4 h-4" />
              {t('mind_map.retry')}
            </>
          ) : (
            <>
              <Brain className="w-4 h-4" />
              {t('mind_map.generate')}
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: '#6366f120' }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ background: getThemeCardBg(), borderColor: '#6366f120' }}
      >
        <Brain className="w-5 h-5 text-indigo-500" />
        <span className="font-semibold">{title ?? t('mind_map.title')}</span>
        <span className="ml-auto text-xs opacity-60">
          {t('mind_map.click_node')}
        </span>
      </div>

      <div className="h-[500px]" style={flowStyles}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={2}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            style={{ background: getThemeCardBg() }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
