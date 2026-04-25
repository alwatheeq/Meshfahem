import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../contexts/I18nContext';

export interface WidgetConfig {
  id: string;
  type: 'book' | 'flashcards' | 'notes' | 'toc' | 'search';
  position: { x: number; y: number };
  size: { width: number; height: number };
  isCollapsed: boolean;
  isMinimized?: boolean; // Deprecated - kept for backward compatibility only
  zIndex: number;
}

interface WidgetContainerProps {
  widget: WidgetConfig;
  onUpdate: (widget: WidgetConfig) => void;
  onRemove?: () => void;
  title: string;
  children: React.ReactNode;
  canRemove?: boolean;
  canClose?: boolean; // Controls whether close button is shown
  freeFormMode?: boolean; // Controls whether widget is draggable (free-form) or in fixed layout
}

export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  widget,
  onUpdate,
  onRemove,
  title,
  children,
  canRemove = true,
  canClose = true,
  freeFormMode = true
}) => {
  const { getThemeCardBg, getThemeCardBorder, getThemeText, getThemeTextSecondary, getThemeTextMuted } = useTheme();
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [wasDragging, setWasDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState('');
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Don't allow dragging if freeFormMode is false
    if (!freeFormMode) {
      return;
    }

    // Don't drag if clicking resize handles
    if ((e.target as HTMLElement).closest('.resize-handle')) {
      return;
    }

    // Don't drag if clicking buttons or interactive elements
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('textarea') ||
      (e.target as HTMLElement).closest('select') ||
      (e.target as HTMLElement).closest('a')
    ) {
      return;
    }

    // Allow drag from anywhere on the widget, including when collapsed
    // Collapsed widgets should be draggable
    setIsDragging(true);
    setWasDragging(false);
    
    const rect = widgetRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Handle resize first
    if (isResizing && resizeDirection) {
      const deltaX = e.clientX - resizeStart.x;
      const deltaY = e.clientY - resizeStart.y;
      
      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newX = widget.position.x;
      let newY = widget.position.y;

      // Minimum and maximum sizes
      const minWidth = 300;
      const minHeight = 200;
      const maxWidth = window.innerWidth - 20;
      const maxHeight = window.innerHeight - 20;

      // Handle resize directions
      if (resizeDirection.includes('right')) {
        newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width + deltaX));
      }
      if (resizeDirection.includes('left')) {
        const _widthChange = resizeStart.width - Math.max(minWidth, Math.min(maxWidth, resizeStart.width - deltaX));
        newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width - deltaX));
        newX = widget.position.x + (resizeStart.width - newWidth);
      }
      if (resizeDirection.includes('bottom')) {
        newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height + deltaY));
      }
      if (resizeDirection.includes('top')) {
        const _heightChange = resizeStart.height - Math.max(minHeight, Math.min(maxHeight, resizeStart.height - deltaY));
        newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height - deltaY));
        newY = widget.position.y + (resizeStart.height - newHeight);
      }

      // Constrain position to viewport (for left/top resizing)
      const maxX = window.innerWidth - newWidth;
      const maxY = window.innerHeight - newHeight;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      onUpdate({
        ...widget,
        position: { x: newX, y: newY },
        size: { width: newWidth, height: newHeight }
      });
      return;
    }

    // Handle drag
    if (!isDragging) return;

    // Track if we actually moved (dragged) vs just clicked
    if (!wasDragging && (Math.abs(e.clientX - (widget.position.x + dragStart.x)) > 5 || Math.abs(e.clientY - (widget.position.y + dragStart.y)) > 5)) {
      setWasDragging(true);
    }

    // NO viewport constraints - widgets can go anywhere
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    onUpdate({
      ...widget,
      position: { x: newX, y: newY }
    });
  }, [isResizing, resizeDirection, resizeStart, widget, onUpdate, isDragging, dragStart, wasDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeDirection('');
    setWasDragging(false);
  }, []);

  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(direction);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: widget.size.width,
      height: widget.size.height
    });
  };

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isResizing 
        ? (resizeDirection.includes('nw') || resizeDirection.includes('se') 
            ? 'nwse-resize' 
            : resizeDirection.includes('ne') || resizeDirection.includes('sw') 
            ? 'nesw-resize' 
            : resizeDirection.includes('right') || resizeDirection.includes('left') 
            ? 'ew-resize' 
            : 'ns-resize')
        : 'grabbing';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, isResizing, resizeDirection, handleMouseMove, handleMouseUp]);

  const handleToggleCollapse = () => {
    onUpdate({
      ...widget,
      isCollapsed: !widget.isCollapsed
    });
  };

  const handleBringToFront = () => {
    // Bring to front by setting high z-index
    const maxZIndex = Math.max(...document.querySelectorAll('[data-widget]').length > 0 
      ? Array.from(document.querySelectorAll('[data-widget]')).map(el => 
          parseInt(window.getComputedStyle(el).zIndex) || 0
        )
      : [widget.zIndex]
    );
    
    onUpdate({
      ...widget,
      zIndex: maxZIndex + 1
    });
  };

  // Determine positioning based on freeFormMode
  const widgetStyle = freeFormMode
    ? {
        position: 'fixed' as const,
        left: widget.position.x,
        top: widget.position.y,
        width: widget.isCollapsed ? 'auto' : widget.size.width,
        height: widget.isCollapsed ? 'auto' : widget.size.height,
        zIndex: widget.zIndex
      }
    : {
        position: 'relative' as const,
        width: '100%',
        maxWidth: '1200px',
        height: widget.isCollapsed ? 'auto' : widget.size.height,
        zIndex: widget.zIndex
      };

  return (
    <div
      ref={widgetRef}
      style={widgetStyle}
      className={`${getThemeCardBg()} rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.07)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.25)] border ${getThemeCardBorder()} ${freeFormMode ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''} ${widget.isCollapsed ? 'inline-block' : ''}`}
      onMouseDown={handleMouseDown}
      onClick={freeFormMode ? handleBringToFront : undefined}
      data-widget={widget.id}
    >
      {/* Header */}
      <div className={`flex items-center justify-between ${widget.isCollapsed ? 'px-3 py-2 min-w-0' : 'px-4 py-2.5'} border-b ${getThemeCardBorder()} ${widget.isCollapsed ? 'rounded-xl border-0' : 'rounded-t-xl'}`}>
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          <h3
            className={`font-medium uppercase tracking-widest opacity-50 ${widget.isCollapsed ? 'text-[10px] truncate' : 'text-[10px]'} ${getThemeText()}`}
            title={widget.isCollapsed ? title : undefined}
          >
            {title}
          </h3>
        </div>

        <div className="flex items-center space-x-0.5 flex-shrink-0">
          {/* Collapse/Expand - only show when free mode is enabled */}
          {freeFormMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCollapse();
              }}
              className={`p-1.5 rounded-full ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}
              title={widget.isCollapsed ? (t('book_mode.expand') || 'Expand') : (t('book_mode.collapse') || 'Collapse')}
            >
              {widget.isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>
          )}

          {/* Remove */}
          {canRemove && canClose && onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className={`p-1.5 rounded-full ${getThemeTextSecondary()} hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors`}
              title={t('book_mode.close') || 'Close'}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content - only shown when not collapsed */}
      {!widget.isCollapsed && (
        <div className="min-h-0 overflow-auto" style={{ height: widget.size.height - 48 }}>
          {children}
        </div>
      )}

      {/* Resize handles - only show when free-form mode is enabled and not collapsed */}
      {freeFormMode && !widget.isCollapsed && (
        <>
          {/* Corner handles */}
          <div
            className={`absolute top-0 left-0 w-4 h-4 cursor-nwse-resize hover:opacity-60 rounded-tl-xl resize-handle z-10 ${getThemeTextMuted()}`}
            onMouseDown={(e) => handleResizeStart(e, 'top-left')}
          />
          <div
            className={`absolute top-0 right-0 w-4 h-4 cursor-nesw-resize hover:opacity-60 rounded-tr-xl resize-handle z-10 ${getThemeTextMuted()}`}
            onMouseDown={(e) => handleResizeStart(e, 'top-right')}
          />
          <div
            className={`absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize hover:opacity-60 rounded-bl-xl resize-handle z-10 ${getThemeTextMuted()}`}
            onMouseDown={(e) => handleResizeStart(e, 'bottom-left')}
          />
          <div
            className={`absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:opacity-60 rounded-br-xl resize-handle z-10 ${getThemeTextMuted()}`}
            onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
          />
          {/* Edge handles */}
          <div
            className={`absolute top-0 left-3 right-3 h-1 cursor-ns-resize hover:opacity-60 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/50 resize-handle z-10 ${getThemeTextMuted()}`}
            onMouseDown={(e) => handleResizeStart(e, 'top')}
          />
          <div
            className={`absolute bottom-0 left-3 right-3 h-1 cursor-ns-resize hover:opacity-60 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/50 resize-handle z-10 ${getThemeTextMuted()}`}
            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
          />
          <div
            className={`absolute left-0 top-3 bottom-3 w-1 cursor-ew-resize hover:opacity-60 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/50 resize-handle z-10 ${getThemeTextMuted()}`}
            onMouseDown={(e) => handleResizeStart(e, 'left')}
          />
          <div
            className={`absolute right-0 top-3 bottom-3 w-1 cursor-ew-resize hover:opacity-60 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/50 resize-handle z-10 ${getThemeTextMuted()}`}
            onMouseDown={(e) => handleResizeStart(e, 'right')}
          />
        </>
      )}
    </div>
  );
};

