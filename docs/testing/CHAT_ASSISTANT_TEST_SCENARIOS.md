# Chat Assistant Test Scenarios

## Overview
This document outlines all test scenarios for the Perplexity AI Chat Assistant integration.

## ✅ Fixed Issues

1. **Timeout Memory Leak**: Fixed - timeout now cleared on error responses
2. **Empty Response Handling**: Added validation for empty API responses
3. **Response Structure Validation**: Added checks for invalid response structure
4. **General Assistant Validation**: Fixed summary text validation for general assistant queries

## Test Scenarios

### 1. Authentication & Authorization

#### 1.1 Valid Authentication
- **Setup**: User logged in with valid session token
- **Expected**: Request processed successfully
- **Status**: ✅ Should work

#### 1.2 Missing Authentication
- **Setup**: No Authorization header
- **Expected**: Returns 401 "Authentication required"
- **Status**: ✅ Implemented (line 202-204)

#### 1.3 Invalid Token
- **Setup**: Invalid/expired token in Authorization header
- **Expected**: Returns 401 "Authentication required"
- **Status**: ✅ Implemented (line 202-204)

#### 1.4 Admin User
- **Setup**: User with admin role
- **Expected**: Credit checks bypassed, no credit deduction
- **Status**: ✅ Implemented (line 188-196, 384)

---

### 2. Input Validation

#### 2.1 Valid Message
- **Setup**: Message with 1-5000 characters
- **Expected**: Message processed successfully
- **Status**: ✅ Should work

#### 2.2 Empty Message
- **Setup**: Empty or whitespace-only message
- **Expected**: Returns 400 "Message is required"
- **Status**: ✅ Implemented (line 207-209)

#### 2.3 Message Too Long
- **Setup**: Message > 5000 characters
- **Expected**: Returns 400 "Message is too long (max 5000 characters)"
- **Status**: ✅ Implemented (line 211-213)

#### 2.4 Valid Summary Text
- **Setup**: Summary text >= 10 characters or "General assistant" format
- **Expected**: Request processed
- **Status**: ✅ Implemented (line 216-218)

#### 2.5 Invalid Summary Text
- **Setup**: Summary text < 10 characters (not general assistant)
- **Expected**: Returns 400 "Summary text is required"
- **Status**: ✅ Implemented (line 216-218)

---

### 3. Credit System

#### 3.1 Sufficient Credits
- **Setup**: User has >= 3 credits
- **Expected**: Request processed, credits deducted
- **Status**: ✅ Implemented (line 221-243)

#### 3.2 Insufficient Credits
- **Setup**: User has < 3 credits
- **Expected**: Returns 429 with refresh date message
- **Status**: ✅ Implemented (line 232-237)

#### 3.3 Credit Deduction
- **Setup**: Successful API call with token usage
- **Expected**: Credits deducted based on token count
- **Status**: ✅ Implemented (line 384-410)

#### 3.4 Credit Deduction Failure
- **Setup**: API succeeds but credit deduction fails
- **Expected**: Message still saved, error logged, no crash
- **Status**: ✅ Implemented (line 393-409)

---

### 4. Conversation Management

#### 4.1 New Conversation
- **Setup**: No conversation_id provided, new context
- **Expected**: New conversation created, ID returned
- **Status**: ✅ Implemented (line 246-291)

#### 4.2 Existing Conversation
- **Setup**: Valid conversation_id provided
- **Expected**: Uses existing conversation, loads history
- **Status**: ✅ Implemented (line 292-304)

#### 4.3 Conversation Not Found
- **Setup**: Invalid conversation_id or belongs to different user
- **Expected**: Returns 404 "Conversation not found or access denied"
- **Status**: ✅ Implemented (line 301-303)

#### 4.4 Conversation History Loading
- **Setup**: Existing conversation with previous messages
- **Expected**: Last 10 messages loaded for context
- **Status**: ✅ Implemented (line 306-316)

---

### 5. API Integration (Perplexity)

#### 5.1 Successful API Call
- **Setup**: Valid API key, valid request
- **Expected**: Response parsed, tokens extracted, message returned
- **Status**: ✅ Implemented (line 24-53)

#### 5.2 Missing API Key
- **Setup**: PREPLIXITY_API_KEY not set in environment
- **Expected**: Returns error "Missing PREPLIXITY_API_KEY environment variable"
- **Status**: ✅ Implemented (line 10-13, 149-152)

#### 5.3 Invalid API Key
- **Setup**: Invalid API key in secret
- **Expected**: Returns Perplexity API error (401/403)
- **Status**: ✅ Implemented (line 39-44)

#### 5.4 API Timeout
- **Setup**: API takes > 50 seconds to respond
- **Expected**: Returns error "Request timeout - API took too long to respond"
- **Status**: ✅ Implemented (line 22, 56-58)

#### 5.5 Network Error
- **Setup**: Network failure during API call
- **Expected**: Returns error "Request failed: [error message]"
- **Status**: ✅ Implemented (line 59-61)

#### 5.6 Invalid Response Structure
- **Setup**: API returns unexpected JSON structure
- **Expected**: Returns error "Perplexity API returned invalid response structure"
- **Status**: ✅ Implemented (line 48-52)

#### 5.7 Empty Response
- **Setup**: API returns empty content
- **Expected**: Returns error "Perplexity API returned empty response"
- **Status**: ✅ Implemented (line 54-57)

#### 5.8 API Error Response
- **Setup**: API returns non-200 status
- **Expected**: Returns error with status code and message
- **Status**: ✅ Implemented (line 39-44)

---

### 6. Context Types

#### 6.1 General Assistant (No Context)
- **Setup**: summary_text contains "General assistant"
- **Expected**: Uses general assistant system prompt
- **Status**: ✅ Implemented (line 67-87)

#### 6.2 Summary Context
- **Setup**: context_type = 'summary', valid summary_text
- **Expected**: Uses content-specific system prompt
- **Status**: ✅ Implemented (line 94-120)

#### 6.3 Library Item Context
- **Setup**: context_type = 'library_item', context_id provided
- **Expected**: Links conversation to library item
- **Status**: ✅ Implemented (line 250-264)

#### 6.4 History Item Context
- **Setup**: context_type = 'history_item', context_id provided
- **Expected**: Links conversation to history item
- **Status**: ✅ Implemented (line 250-264)

#### 6.5 Medical Mode
- **Setup**: medical_mode = true
- **Expected**: System prompt includes medical education emphasis
- **Status**: ✅ Implemented (line 100, 108, 115)

---

### 7. Message Flow

#### 7.1 Single Message
- **Setup**: Send one message, get response
- **Expected**: User message saved, assistant response saved, tokens tracked
- **Status**: ✅ Implemented (line 370-457)

#### 7.2 Conversation Thread
- **Setup**: Multiple messages in same conversation
- **Expected**: Previous messages included in context (last 10)
- **Status**: ✅ Implemented (line 306-316, 344-352)

#### 7.3 Message Ordering
- **Setup**: Messages sent in sequence
- **Expected**: Messages ordered by created_at ascending
- **Status**: ✅ Implemented (line 311)

---

### 8. Error Handling

#### 8.1 Database Error - Conversation Creation
- **Setup**: Database fails when creating conversation
- **Expected**: Returns 500 "Failed to create conversation"
- **Status**: ✅ Implemented (line 285-288)

#### 8.2 Database Error - Message Save
- **Setup**: Database fails when saving user message
- **Expected**: Error logged, continues processing
- **Status**: ✅ Implemented (line 380-382)

#### 8.3 Database Error - Assistant Message Save
- **Setup**: Database fails when saving assistant message
- **Expected**: Error logged, response still returned
- **Status**: ✅ Implemented (line 424-426)

#### 8.4 Database Error - History Loading
- **Setup**: Database fails when loading conversation history
- **Expected**: Error logged, continues with empty history
- **Status**: ✅ Implemented (line 314-316)

---

### 9. Frontend Integration

#### 9.1 ChatAssistant Component
- **Setup**: Context-specific chat (summary/library item)
- **Expected**: Loads existing conversation, sends messages correctly
- **Status**: ✅ Implemented (ChatAssistant.tsx)

#### 9.2 GlobalChatAssistant Component
- **Setup**: Global chat (no specific context)
- **Expected**: Uses general assistant context, draggable/resizable
- **Status**: ✅ Implemented (GlobalChatAssistant.tsx)

#### 9.3 Error Display
- **Setup**: API returns error
- **Expected**: Error toast shown to user, temp message removed
- **Status**: ✅ Implemented (line 222-239 in ChatAssistant.tsx)

#### 9.4 Credit Update Event
- **Setup**: Successful message sent
- **Expected**: 'creditUpdated' event dispatched
- **Status**: ✅ Implemented (line 220, 423)

#### 9.5 Loading State
- **Setup**: Message sent, waiting for response
- **Expected**: Loading spinner shown, input disabled
- **Status**: ✅ Implemented (line 333-339, 360-361)

---

### 10. Edge Cases

#### 10.1 Very Long Summary Text
- **Setup**: summary_text > 10,000 characters
- **Expected**: Truncated to 10,000 chars in system prompt
- **Status**: ✅ Implemented (line 90-92)

#### 10.2 Empty Topics Array
- **Setup**: topics = []
- **Expected**: Shows "General" in system prompt
- **Status**: ✅ Implemented (line 99)

#### 10.3 Null Original Text
- **Setup**: original_text = null
- **Expected**: Not included in system prompt
- **Status**: ✅ Implemented (line 98)

#### 10.4 Token Limit Capping
- **Setup**: maxTokens > 4096
- **Expected**: Capped to 4096, warning logged
- **Status**: ✅ Implemented (line 16-19)

#### 10.5 Missing Token Usage Data
- **Setup**: API response missing usage field
- **Expected**: Uses fallback calculation (0 tokens)
- **Status**: ✅ Implemented (line 48-50)

---

## Testing Checklist

### Manual Testing Required

- [ ] Test with valid Perplexity API key
- [ ] Test with invalid API key
- [ ] Test timeout scenario (simulate slow API)
- [ ] Test with insufficient credits
- [ ] Test conversation creation and loading
- [ ] Test general assistant vs context-specific
- [ ] Test medical mode
- [ ] Test error handling in frontend
- [ ] Test credit deduction accuracy
- [ ] Test message history loading

### Automated Testing (Future)

- [ ] Unit tests for callPerplexity function
- [ ] Unit tests for buildSystemPrompt function
- [ ] Integration tests for full flow
- [ ] Error scenario tests
- [ ] Credit system tests

---

## Known Limitations

1. **User Message Saved Before API Call**: If API fails, user message is already saved. This is intentional for debugging but could be improved.

2. **Token Estimation**: User message tokens are estimated (length/4) rather than exact. This is acceptable for credit tracking.

3. **History Limit**: Only last 10 messages loaded for context. This is a performance optimization.

4. **General Assistant Detection**: Uses string matching ("General assistant") which could be improved with a flag.

---

## Performance Considerations

- Timeout: 50 seconds (reasonable for AI responses)
- Max tokens: 4096 (prevents excessive costs)
- History limit: 10 messages (balances context vs performance)
- Summary truncation: 10,000 chars (prevents prompt bloat)

---

## Security Considerations

- ✅ Authentication required for all requests
- ✅ User can only access their own conversations
- ✅ Admin users bypass credit checks (intentional)
- ✅ API key stored as secret (not exposed)
- ✅ Input validation prevents injection
- ✅ Message length limits prevent abuse

---

## Deployment Checklist

- [ ] Verify PREPLIXITY_API_KEY secret is set in Supabase
- [ ] Deploy chat-assistant edge function
- [ ] Test with real API key
- [ ] Monitor error logs
- [ ] Verify credit deduction works
- [ ] Test frontend integration
- [ ] Test all context types

---

## Monitoring

Key metrics to monitor:
- API response times
- Error rates
- Credit deduction accuracy
- Conversation creation rates
- Token usage patterns
