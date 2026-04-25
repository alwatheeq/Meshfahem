/**
 * Supabase `functions.invoke` often sets `error.message` to a generic non-2xx string
 * while the Edge Function puts the real reason in the JSON body (`data.error`).
 */

function bodyErrorString(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { error?: unknown; message?: unknown };
  const err = typeof d.error === 'string' && d.error.trim() ? d.error.trim() : null;
  const msg = typeof d.message === 'string' && d.message.trim() ? d.message.trim() : null;
  if (msg) return msg;
  if (err) return err;
  return null;
}

export function getEdgeFunctionErrorMessage(
  data: unknown,
  invokeError: { message: string } | null
): string {
  return bodyErrorString(data) || invokeError?.message || 'Function call failed';
}

/** Throw when HTTP layer failed, body is empty, or JSON reports `success: false`. */
export function throwIfEdgeFunctionInvokeFailed(
  data: unknown,
  invokeError: { message: string } | null
): void {
  if (invokeError) {
    throw new Error(getEdgeFunctionErrorMessage(data, invokeError));
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Function call failed');
  }
  if ((data as { success?: boolean }).success === false) {
    throw new Error(getEdgeFunctionErrorMessage(data, null));
  }
}
