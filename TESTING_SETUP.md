# Testing Setup Guide

## Overview

Vitest has been configured for testing. To complete the setup, you need to install the testing dependencies.

## Installation

Run the following command to install all testing dependencies:

```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

## Configuration Files Created

1. **`vitest.config.ts`** - Vitest configuration with React support
2. **`src/test/setup.ts`** - Test setup file with mocks and utilities
3. **`src/test/utils/test-utils.tsx`** - Custom render function with all providers
4. **`src/test/__mocks__/supabase.ts`** - Mock Supabase client
5. **`src/test/examples/example.test.tsx`** - Example test file

## Running Tests

After installation, you can run tests with:

```bash
# Run tests in watch mode
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Writing Tests

Create test files with the `.test.ts` or `.test.tsx` extension in your `src` directory.

Example:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/utils/test-utils';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## Next Steps

1. Install the dependencies (see Installation above)
2. Write tests for critical paths:
   - Authentication flow
   - API integration
   - Key components
   - Error handling

See the plan for details on what tests to write.

