/**
 * Minimal Deno global types for Supabase Edge Functions.
 * Ensures IDE/TypeScript recognizes Deno when the project is opened as a Vite workspace.
 * At runtime, Deno is provided by the Edge Functions runtime.
 */
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};
