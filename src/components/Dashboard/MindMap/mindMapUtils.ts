import { Node, Edge, Position } from '@xyflow/react';

export interface MindMapConcept {
  id: string;
  label: string;
  children: string[];
}

/**
 * Parses the AI response JSON string into an array of MindMapConcept objects.
 * Handles both raw JSON arrays and JSON embedded within markdown code blocks.
 */
export function parseAIResponse(response: string): MindMapConcept[] {
  try {
    // Try to extract JSON from markdown code block first
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : response.trim();

    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      throw new Error('Expected a JSON array of concepts');
    }

    return parsed.map((item: Record<string, unknown>, index: number) => ({
      id: (item.id as string) || `concept-${index}`,
      label: (item.label as string) || 'Untitled',
      children: Array.isArray(item.children) ? (item.children as string[]) : [],
    }));
  } catch (error) {
    console.error('Failed to parse AI response for mind map:', error);
    throw new Error('Could not parse the AI response into a mind map. Please try again.');
  }
}

/**
 * Converts an array of MindMapConcept objects into ReactFlow nodes and edges
 * using a radial tree layout. The first concept is the center/root node.
 */
export function conceptsToFlow(concepts: MindMapConcept[], isDark: boolean = false): { nodes: Node[]; edges: Edge[] } {
  if (concepts.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const root = concepts[0];
  const childConcepts = concepts.slice(1);

  // Center node — main topic
  nodes.push({
    id: root.id,
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: root.label },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    style: {
      background: isDark
        ? 'linear-gradient(135deg, #059669, #0d9488)'
        : 'linear-gradient(135deg, #10b981, #14b8a6)',
      color: '#ffffff',
      border: 'none',
      borderRadius: '16px',
      padding: '16px 28px',
      fontSize: '16px',
      fontWeight: 700,
      boxShadow: isDark
        ? '0 8px 24px rgba(5, 150, 105, 0.25)'
        : '0 8px 24px rgba(16, 185, 129, 0.35)',
      minWidth: '180px',
      textAlign: 'center' as const,
    },
  });

  // Lay out child nodes in a radial pattern around the center
  const childCount = childConcepts.length;
  const horizontalSpacing = 200;
  const verticalSpacing = 120;

  childConcepts.forEach((concept, index) => {
    // Distribute children around the center using angular positioning
    const angle = (2 * Math.PI * index) / childCount - Math.PI / 2;
    const radiusX = Math.max(horizontalSpacing, childCount * 40);
    const radiusY = Math.max(verticalSpacing, childCount * 30);

    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;

    nodes.push({
      id: concept.id,
      type: 'default',
      position: { x, y },
      data: { label: concept.label },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style: {
        borderRadius: '12px',
        padding: '10px 18px',
        fontSize: '13px',
        fontWeight: 500,
        minWidth: '120px',
        textAlign: 'center' as const,
        background: isDark ? '#1e293b' : '#ffffff',
        color: isDark ? '#e2e8f0' : '#334155',
        border: isDark ? '1px solid rgba(100, 116, 139, 0.3)' : '1px solid rgba(148, 163, 184, 0.3)',
        boxShadow: isDark ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.08)',
      },
    });

    // Edge from root to this child
    edges.push({
      id: `edge-${root.id}-${concept.id}`,
      source: root.id,
      target: concept.id,
      type: 'smoothstep',
      animated: true,
      style: {
        stroke: isDark ? '#34d399' : '#10b981',
        strokeWidth: 2,
      },
    });
  });

  // Create edges for child-to-child relationships defined in concept.children
  concepts.forEach((concept) => {
    concept.children.forEach((childId) => {
      // Avoid duplicate edges from root already added above
      const edgeId = `edge-${concept.id}-${childId}`;
      if (
        concept.id !== root.id &&
        !edges.some((e) => e.id === edgeId)
      ) {
        edges.push({
          id: edgeId,
          source: concept.id,
          target: childId,
          type: 'smoothstep',
          style: {
            stroke: isDark ? '#64748b' : '#94a3b8',
            strokeWidth: 1.5,
            strokeDasharray: '6 3',
          },
        });
      }
    });
  });

  return { nodes, edges };
}

/**
 * Generates an AI prompt that asks the model to extract key concepts
 * from the given text and return them as a structured JSON array.
 */
export function generatePrompt(text: string): string {
  return `Analyze the following text and extract the key concepts and their relationships as a mind map structure.

Return ONLY a JSON array (no markdown, no explanation) where:
- The FIRST element is the main/central topic
- Each subsequent element is a related concept
- Each object has: "id" (unique string), "label" (short descriptive text, max 5 words), "children" (array of ids this concept connects to)

Aim for 6-12 concepts that capture the essential ideas and their relationships.

Text to analyze:
"""
${text.substring(0, 4000)}
"""

Return ONLY the JSON array:`;
}
