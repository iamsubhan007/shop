import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Wraps a route handler so an unexpected exception (missing SESSION_SECRET, database unreachable, ...) becomes a
 * clear JSON 503 instead of a bare 500 with an empty body. The pages read `error` from the JSON; without it they
 * fall back to a vague message. The real reason is written to the server log (Vercel > Logs), never to the browser.
 */
export function withErrorHandling(name, handler) {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (err) {
      console.error(`[${name}] unhandled error:`, { name: err?.name, code: err?.code, message: err?.message });
      return NextResponse.json(
        { error: 'Sign-in is temporarily unavailable. Please try again in a few minutes.', code: 'server_error' },
        { status: 503 },
      );
    }
  };
}
