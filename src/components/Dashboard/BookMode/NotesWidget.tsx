import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, BookOpen, FileText } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../contexts/I18nContext';
import { supabase } from '../../../lib/supabase';
import { ErrorLogger } from '../../../utils/errorLogger';
import { handleSupabaseError } from '../../../utils/errorHandler';

interface Note {
  id: string;
  page_index: number | null;
  note_type: 'page' | 'book';
  content: string;
  created_at: string;
  updated_at: string;
  isTemporary?: boolean; // Flag for localStorage notes
}

interface NotesWidgetProps {
  summaryId: string | null;
  summaryText?: string; // Required for localStorage when summaryId is null
  currentPageIndex?: number;
  totalPages?: number;
  onNoteAdded?: () => void;
  onNotesChange?: (notes: Note[]) => void;
}

// Hash function to create unique key for summary text
const hashSummaryText = (text: string): string => {
  // Simple hash: first 50 chars + length + first word
  const preview = text.substring(0, 50).replace(/\s+/g, '');
  const length = text.length;
  const firstWord = text.split(/\s+/)[0] || '';
  return `${preview}_${length}_${firstWord}`.substring(0, 50);
};

// Get localStorage key for temporary notes
const getTempNotesKey = (summaryText: string): string => {
  return `temp_notes_${hashSummaryText(summaryText)}`;
};

export const NotesWidget: React.FC<NotesWidgetProps> = ({
  summaryId,
  summaryText = '',
  currentPageIndex,
  totalPages = 1,
  onNoteAdded,
  onNotesChange
}) => {
  const { user } = useAuth();
  const { getThemeGradient, getThemeText, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const { t } = useI18n();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddNote, setShowAddNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<'page' | 'book'>('page');
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(currentPageIndex ?? 0);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadNotes();
    } else {
      setNotes([]);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryId, user, currentPageIndex, summaryText]);

  useEffect(() => {
    setSelectedPageIndex(currentPageIndex ?? 0);
  }, [currentPageIndex]);

  const loadNotes = async () => {
    if (!user) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let allNotes: Note[] = [];

      // Load from database if summaryId exists
      if (summaryId) {
        // Build query to get all notes for this summary
        // Show book-level notes (page_index is null) and page-level notes for current page
        let query = supabase
          .from('summary_notes')
          .select('*')
          .eq('user_id', user.id)
          .eq('summary_id', summaryId);

        // Filter: show book notes (page_index is null) OR page notes for current page
        if (currentPageIndex !== undefined) {
          query = query.or(`page_index.is.null,page_index.eq.${currentPageIndex}`);
        } else {
          // If no current page, show only book-level notes
          query = query.is('page_index', null);
        }

        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;

        if (error) {
          handleSupabaseError(error, {
            component: 'NotesWidget',
            action: 'loadNotes',
            userId: user.id,
            metadata: { summaryId }
          });
          ErrorLogger.error(error, {
            component: 'NotesWidget',
            action: 'loadNotes',
            userId: user.id,
            metadata: { summaryId }
          });
        } else {
          allNotes = (data || []).map(note => ({ ...note, isTemporary: false }));
        }
      }

      // Load from localStorage if summaryId is null and summaryText is provided
      if (!summaryId && summaryText) {
        try {
          const tempNotesKey = getTempNotesKey(summaryText);
          const storedNotes = localStorage.getItem(tempNotesKey);
          if (storedNotes) {
            const tempNotes: Note[] = JSON.parse(storedNotes);
            // Filter: show book notes (page_index is null) OR page notes for current page
            const filteredTempNotes = currentPageIndex !== undefined
              ? tempNotes.filter(note => note.page_index === null || note.page_index === currentPageIndex)
              : tempNotes.filter(note => note.page_index === null);
            allNotes = [...allNotes, ...filteredTempNotes.map(note => ({ ...note, isTemporary: true }))];
          }
        } catch (error) {
          ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), {
            component: 'NotesWidget',
            action: 'loadNotes',
            userId: user.id,
            metadata: { error: 'localStorage parse error' }
          });
        }
      }

      // Sort by created_at descending
      allNotes.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });

      setNotes(allNotes);
      onNotesChange?.(allNotes);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'NotesWidget',
        action: 'loadNotes',
        userId: user?.id,
        metadata: { summaryId }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNote = async () => {
    if (!user || !noteContent.trim()) return;

    // If summaryId is null, save to localStorage
    if (!summaryId) {
      if (!summaryText) {
        ErrorLogger.error(new Error('summaryText is required when summaryId is null'), {
          component: 'NotesWidget',
          action: 'saveNote',
          userId: user.id
        });
        return;
      }

      try {
        const tempNotesKey = getTempNotesKey(summaryText);
        const storedNotes = localStorage.getItem(tempNotesKey);
        const existingNotes: Note[] = storedNotes ? JSON.parse(storedNotes) : [];

        if (editingNoteId) {
          // Update existing temporary note
          const noteIndex = existingNotes.findIndex(n => n.id === editingNoteId);
          if (noteIndex !== -1) {
            existingNotes[noteIndex] = {
              ...existingNotes[noteIndex],
              content: noteContent.trim(),
              note_type: noteType,
              page_index: effectivePageIndex,
              updated_at: new Date().toISOString()
            };
            localStorage.setItem(tempNotesKey, JSON.stringify(existingNotes));
          }
        } else {
          // Create new temporary note
          const newNote: Note = {
            id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content: noteContent.trim(),
            note_type: noteType,
            page_index: effectivePageIndex,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            isTemporary: true
          };
          existingNotes.push(newNote);
          localStorage.setItem(tempNotesKey, JSON.stringify(existingNotes));
        }

        await loadNotes();
        setEditingNoteId(null);
        setNoteContent('');
        setShowAddNote(false);
        onNoteAdded?.();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, {
          component: 'NotesWidget',
          action: 'saveNote',
          userId: user.id,
          metadata: { error: 'localStorage save error' }
        });
      }
      return;
    }

    // If summaryId exists, save to database
    try {
      if (editingNoteId) {
        // Update existing note
        const { error } = await supabase
          .from('summary_notes')
          .update({
            content: noteContent.trim(),
            note_type: noteType,
            page_index: effectivePageIndex,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingNoteId)
          .eq('user_id', user.id);

        if (error) {
          handleSupabaseError(error, {
            component: 'NotesWidget',
            action: 'updateNote',
            userId: user.id,
            metadata: { noteId: editingNoteId }
          });
          ErrorLogger.error(error, {
            component: 'NotesWidget',
            action: 'updateNote',
            userId: user.id,
            metadata: { noteId: editingNoteId }
          });
        } else {
          await loadNotes();
          setEditingNoteId(null);
          setNoteContent('');
          setShowAddNote(false);
          onNoteAdded?.();
        }
      } else {
        // Create new note
        const { error } = await supabase
          .from('summary_notes')
          .insert({
            user_id: user.id,
            summary_id: summaryId,
            content: noteContent.trim(),
            note_type: noteType,
            page_index: effectivePageIndex
          });

        if (error) {
          handleSupabaseError(error, {
            component: 'NotesWidget',
            action: 'createNote',
            userId: user.id,
            metadata: { summaryId }
          });
          ErrorLogger.error(error, {
            component: 'NotesWidget',
            action: 'createNote',
            userId: user.id,
            metadata: { summaryId }
          });
        } else {
          await loadNotes();
          setNoteContent('');
          setShowAddNote(false);
          onNoteAdded?.();
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'NotesWidget',
        action: 'saveNote',
        userId: user?.id,
        metadata: { summaryId }
      });
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!user) return;

    if (!confirm(t('notebook.delete_note') || 'Are you sure you want to delete this note?')) {
      return;
    }

    // Check if note is temporary (from localStorage)
    const note = notes.find(n => n.id === noteId);
    if (note?.isTemporary && !summaryId) {
      // Delete from localStorage (use summaryText when present, else fallback key for unsaved context)
      try {
        const tempNotesKey = getTempNotesKey(summaryText || '');
        const storedNotes = localStorage.getItem(tempNotesKey);
        if (storedNotes) {
          const existingNotes: Note[] = JSON.parse(storedNotes);
          const filteredNotes = existingNotes.filter(n => n.id !== noteId);
          localStorage.setItem(tempNotesKey, JSON.stringify(filteredNotes));
          await loadNotes();
          onNoteAdded?.();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, {
          component: 'NotesWidget',
          action: 'deleteNote',
          userId: user.id,
          metadata: { noteId, error: 'localStorage delete error' }
        });
      }
      return;
    }

    // Delete from database
    if (!summaryId) {
      ErrorLogger.error(new Error('Cannot delete database note without summaryId'), {
        component: 'NotesWidget',
        action: 'deleteNote',
        userId: user.id,
        metadata: { noteId }
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('summary_notes')
        .delete()
        .eq('id', noteId)
        .eq('user_id', user.id);

      if (error) {
        handleSupabaseError(error, {
          component: 'NotesWidget',
          action: 'deleteNote',
          userId: user.id,
          metadata: { noteId }
        });
        ErrorLogger.error(error, {
          component: 'NotesWidget',
          action: 'deleteNote',
          userId: user.id,
          metadata: { noteId }
        });
      } else {
        await loadNotes();
        onNoteAdded?.();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'NotesWidget',
        action: 'deleteNote',
        userId: user?.id,
        metadata: { noteId }
      });
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNoteId(note.id);
    setNoteContent(note.content);
    setNoteType(note.note_type);
    setSelectedPageIndex(note.page_index ?? currentPageIndex ?? 0);
    setShowAddNote(true);
  };

  const effectivePageIndex = noteType === 'page' ? selectedPageIndex : null;

  return (
    <div className="flex flex-col h-full bg-amber-50/80 dark:bg-amber-950/20">
      {/* Header Actions */}
      <div className={`px-5 py-2.5 border-b ${getThemeCardBorder()} border-amber-200/60 dark:border-amber-800/40`}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowAddNote(true);
            setEditingNoteId(null);
            setNoteContent('');
            setNoteType('page');
          }}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm ${getThemeGradient('ui')} text-white hover:opacity-90 transition-opacity`}
        >
          <Plus className="h-4 w-4" />
          <span>{t('notebook.add_note') || 'Add Note'}</span>
        </button>
      </div>

      {/* Add/Edit Note Form */}
      {showAddNote && (
        <div className={`p-4 border-b ${getThemeCardBorder()} ${getThemeSubtle('bg')} shadow-[0_2px_8px_rgba(0,0,0,0.08)]`}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="flex space-x-2">
                <button
                  onClick={() => setNoteType('page')}
                  className={`px-3 py-1 text-xs rounded ${
                    noteType === 'page'
                      ? `${getThemeGradient('ui')} text-white`
                      : `${getThemeSubtle('ui')} ${getThemeTextSecondary()}`
                  }`}
                >
                  {t('notebook.page_note') || 'Page Note'}
                </button>
                <button
                  onClick={() => setNoteType('book')}
                  className={`px-3 py-1 text-xs rounded ${
                    noteType === 'book'
                      ? `${getThemeGradient('ui')} text-white`
                      : `${getThemeSubtle('ui')} ${getThemeTextSecondary()}`
                  }`}
                >
                  {t('notebook.book_note') || 'Book Note'}
                </button>
              </div>
              {noteType === 'page' && totalPages > 0 && (
                <div className="flex items-center gap-2">
                  <label className={`text-xs ${getThemeTextSecondary()}`}>
                    {t('book_mode.page') || 'Page'}:
                  </label>
                  <select
                    value={selectedPageIndex}
                    onChange={(e) => setSelectedPageIndex(parseInt(e.target.value, 10))}
                    className={`px-2 py-1 text-xs rounded ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                  >
                    {Array.from({ length: totalPages }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder={t('notebook.add_note') || 'Write your note...'}
              className={`w-full px-3 py-2 ${getThemeCardBorder()} rounded-lg ${getThemeCardBg()} shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${getThemeTextPrimary()} resize-none`}
              rows={4}
            />
            <div className="flex space-x-2">
              <button
                onClick={handleSaveNote}
                disabled={!noteContent.trim()}
                className={`flex-1 px-5 py-2.5 rounded-lg text-sm ${getThemeGradient('ui')} text-white hover:opacity-90 disabled:opacity-50 transition-opacity`}
              >
                {editingNoteId ? (t('notebook.edit_note') || 'Update') : (t('notebook.add_note') || 'Save')}
              </button>
              <button
                onClick={() => {
                  setShowAddNote(false);
                  setEditingNoteId(null);
                  setNoteContent('');
                }}
                className={`px-5 py-2.5 rounded-lg text-sm ${getThemeSubtle('ui')} shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${getThemeTextSecondary()} hover:opacity-60 transition-colors`}
              >
                {t('common.cancel') || 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-8">
            <p className={getThemeTextSecondary()}>{t('common.loading') || 'Loading notes...'}</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-8">
            <BookOpen className={`h-12 w-12 ${getThemeTextMuted()} mx-auto mb-4`} />
            <p className={getThemeTextSecondary()}>{t('notebook.no_notes') || 'No notes yet'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => {
              const isExpanded = expandedNoteId === note.id;
              return (
                <div
                  key={note.id}
                  onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                  className={`p-2.5 bg-amber-50 dark:bg-amber-900/30 shadow-[0_2px_8px_rgba(0,0,0,0.12)] rounded-md border border-amber-200/80 dark:border-amber-700/50 transition-all cursor-pointer overflow-hidden ${
                    isExpanded
                      ? 'min-h-[80px] max-h-[104px] w-full max-w-[620px]'
                      : 'h-[48px] min-h-[44px] max-h-[52px] w-[320px] min-w-[280px] max-w-[360px]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      {note.note_type === 'page' ? (
                        <FileText className={`h-4 w-4 flex-shrink-0 ${getThemeTextMuted()}`} />
                      ) : (
                        <BookOpen className={`h-4 w-4 flex-shrink-0 ${getThemeTextMuted()}`} />
                      )}
                      <span className={`text-xs truncate ${getThemeTextMuted()}`}>
                        {note.note_type === 'page' && note.page_index !== null
                          ? `${t('book_mode.page') || 'Page'} ${note.page_index + 1}`
                          : t('notebook.book_note') || 'Book Note'}
                      </span>
                    </div>
                    <div className="flex space-x-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleEditNote(note)}
                        className={`p-1 ${getThemeTextSecondary()} hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors`}
                        title={t('notebook.edit_note') || 'Edit'}
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className={`p-1 ${getThemeTextSecondary()} hover:text-red-600 dark:hover:text-red-400 rounded transition-colors`}
                        title={t('notebook.delete_note') || 'Delete'}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className={`text-sm ${getThemeText()} whitespace-pre-wrap mt-1 ${isExpanded ? 'line-clamp-4' : 'line-clamp-1'}`}>
                    {note.content}
                  </p>
                  {isExpanded && (
                    <p className={`text-xs ${getThemeTextMuted()} mt-2`}>
                      {new Date(note.updated_at || note.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

