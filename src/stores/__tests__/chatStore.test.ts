import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '../chatStore';

describe('chatStore', () => {
  beforeEach(() => {
    // Reset the store between tests
    useChatStore.getState().clearChatContext();
  });

  it('should start with default context', () => {
    const { context } = useChatStore.getState();
    expect(context.summaryText).toBeNull();
    expect(context.contextType).toBe('general');
    expect(context.topics).toEqual([]);
    expect(context.medicalMode).toBe(false);
  });

  it('should update context partially with setChatContext', () => {
    const { setChatContext } = useChatStore.getState();

    setChatContext({ summaryText: 'Test summary', contextType: 'summary' });

    const { context } = useChatStore.getState();
    expect(context.summaryText).toBe('Test summary');
    expect(context.contextType).toBe('summary');
    // Other fields should remain default
    expect(context.medicalMode).toBe(false);
    expect(context.topics).toEqual([]);
  });

  it('should merge multiple setChatContext calls', () => {
    const { setChatContext } = useChatStore.getState();

    setChatContext({ summaryText: 'Summary 1' });
    setChatContext({ topics: ['biology', 'chemistry'] });

    const { context } = useChatStore.getState();
    expect(context.summaryText).toBe('Summary 1');
    expect(context.topics).toEqual(['biology', 'chemistry']);
  });

  it('should reset to defaults on clearChatContext', () => {
    const { setChatContext, clearChatContext } = useChatStore.getState();

    setChatContext({
      summaryText: 'Test',
      contextType: 'library_item',
      medicalMode: true,
      topics: ['anatomy'],
    });

    clearChatContext();

    const { context } = useChatStore.getState();
    expect(context.summaryText).toBeNull();
    expect(context.contextType).toBe('general');
    expect(context.medicalMode).toBe(false);
    expect(context.topics).toEqual([]);
  });
});
