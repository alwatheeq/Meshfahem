import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, ChevronDown, ChevronUp, MoreVertical, Edit2, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ErrorLogger } from '../../utils/errorLogger';
import { useConfirm } from '../../hooks/useConfirm';
import { useTheme } from '../../contexts/ThemeContext';

interface Comment {
  id: string;
  user_id: string;
  comment_text: string;
  parent_comment_id: string | null;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
  user_email?: string;
  replies?: Comment[];
}

interface CommentSectionProps {
  itemId: string;
  initialCount?: number;
}

export const CommentSection: React.FC<CommentSectionProps> = ({
  itemId,
  initialCount = 0
}) => {
  const { user } = useAuth();
  const { confirm, ConfirmModal } = useConfirm();
  const { getThemeGradient } = useTheme();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(false);
  const [commentCount, setCommentCount] = useState(initialCount);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchComments();
  }, [itemId, sortOrder]);

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id,
          user_id,
          comment_text,
          parent_comment_id,
          is_edited,
          edited_at,
          created_at
        `)
        .eq('item_id', itemId)
        .order('created_at', { ascending: sortOrder === 'oldest' })
        .limit(50);

      if (error) throw error;

      if (data) {
        const userIds = [...new Set(data.map(c => c.user_id))];
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, email')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.email]) || []);

        const commentsWithEmail = data.map(c => ({
          ...c,
          user_email: profileMap.get(c.user_id) || 'Anonymous'
        }));

        const threaded = buildCommentTree(commentsWithEmail);
        setComments(threaded);
        setCommentCount(data.length);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'CommentSection', action: 'fetchComments', itemId });
    }
  };

  const buildCommentTree = (flatComments: Comment[]): Comment[] => {
    const commentMap = new Map<string, Comment>();
    const rootComments: Comment[] = [];

    flatComments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    flatComments.forEach(comment => {
      const commentNode = commentMap.get(comment.id)!;
      if (comment.parent_comment_id) {
        const parent = commentMap.get(comment.parent_comment_id);
        if (parent) {
          parent.replies!.push(commentNode);
        } else {
          rootComments.push(commentNode);
        }
      } else {
        rootComments.push(commentNode);
      }
    });

    return rootComments;
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !user || loading) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('comments')
        .insert({
          item_id: itemId,
          user_id: user.id,
          comment_text: newComment.trim(),
          parent_comment_id: null
        });

      if (error) throw error;

      setNewComment('');
      await fetchComments();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'CommentSection', action: 'handleSubmitComment', itemId, userId: user?.id });
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (parentId: string) => {
    if (!replyText.trim() || !user || loading) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('comments')
        .insert({
          item_id: itemId,
          user_id: user.id,
          comment_text: replyText.trim(),
          parent_comment_id: parentId
        });

      if (error) throw error;

      setReplyText('');
      setReplyingTo(null);
      await fetchComments();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'CommentSection', action: 'handleReply', itemId, parentId, userId: user?.id });
    } finally {
      setLoading(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editText.trim() || !user || loading) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('comments')
        .update({ comment_text: editText.trim() })
        .eq('id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;

      setEditingComment(null);
      setEditText('');
      await fetchComments();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'CommentSection', action: 'handleEditComment', itemId, commentId, userId: user?.id });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user || loading) return;

    const confirmed = await confirm('Are you sure you want to delete this comment?', {
      title: 'Delete Comment',
      variant: 'destructive',
      confirmText: 'Delete',
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchComments();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'CommentSection', action: 'handleDeleteComment', itemId, commentId, userId: user?.id });
    } finally {
      setLoading(false);
    }
  };

  const toggleThread = (commentId: string) => {
    setExpandedThreads(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const CommentItem: React.FC<{ comment: Comment; depth?: number }> = ({ comment, depth = 0 }) => {
    const isExpanded = expandedThreads.has(comment.id);
    const hasReplies = comment.replies && comment.replies.length > 0;
    const isOwner = user?.id === comment.user_id;

    return (
      <div className={`${depth > 0 ? 'ml-8 pl-4 border-l-2 border-gray-200 dark:border-gray-700' : ''}`}>
        <div className="py-3">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className={`h-8 w-8 rounded-full ${getThemeGradient('ui')} flex items-center justify-center text-white text-sm font-medium`}>
                {comment.user_email?.charAt(0).toUpperCase() || '?'}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {comment.user_email}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(comment.created_at)}
                </span>
                {comment.is_edited && (
                  <span className="text-xs text-gray-400 italic dark:text-gray-500">
                    (edited)
                  </span>
                )}
              </div>

              {editingComment === comment.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    maxLength={2000}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    rows={3}
                  />
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEditComment(comment.id)}
                      disabled={!editText.trim() || loading}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingComment(null);
                        setEditText('');
                      }}
                      className="px-3 py-1 bg-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-400 dark:bg-gray-600 dark:text-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {comment.comment_text}
                  </p>

                  <div className="flex items-center space-x-4 mt-2">
                    {depth < 2 && (
                      <button
                        onClick={() => setReplyingTo(comment.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium dark:text-blue-400"
                      >
                        Reply
                      </button>
                    )}

                    {isOwner && (
                      <>
                        <button
                          onClick={() => {
                            setEditingComment(comment.id);
                            setEditText(comment.comment_text);
                          }}
                          className="text-xs text-gray-600 hover:text-gray-800 font-medium dark:text-gray-400"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium dark:text-red-400"
                        >
                          Delete
                        </button>
                      </>
                    )}

                    {hasReplies && (
                      <button
                        onClick={() => toggleThread(comment.id)}
                        className="text-xs text-gray-600 hover:text-gray-800 font-medium flex items-center space-x-1 dark:text-gray-400"
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        <span>{comment.replies!.length} {comment.replies!.length === 1 ? 'reply' : 'replies'}</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              {replyingTo === comment.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a reply..."
                    maxLength={2000}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                    rows={2}
                  />
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleReply(comment.id)}
                      disabled={!replyText.trim() || loading}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyText('');
                      }}
                      className="px-3 py-1 bg-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-400 dark:bg-gray-600 dark:text-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {hasReplies && isExpanded && (
            <div className="mt-2">
              {comment.replies!.map(reply => (
                <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
        <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
          <MessageSquare className="h-5 w-5" />
          <span className="text-sm">Sign in to view and post comments</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <MessageSquare className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Comments ({commentCount})
          </h3>
        </div>

        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
          className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>
      </div>

      <div className="mb-4">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          maxLength={2000}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
          rows={3}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {newComment.length}/2000
          </span>
          <button
            onClick={handleSubmitComment}
            disabled={!newComment.trim() || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Send className="h-4 w-4" />
            <span>Post Comment</span>
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No comments yet. Be the first to comment!</p>
          </div>
        ) : (
          comments.map(comment => (
            <CommentItem key={comment.id} comment={comment} />
          ))
        )}
      </div>
      {ConfirmModal}
    </div>
  );
};
