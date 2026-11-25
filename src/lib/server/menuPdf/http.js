import 'server-only';
import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server/guard';
import { StateError } from './state';
import { NO_STORE } from './source';

/** Owner/admin only (with the Origin check on writes), errors as JSON the admin page can show. */
export function menuPdfAdminRoute(handler) {
  return async (request, context) => {
    const g = await requireStaff(request, ['owner', 'admin']);
    if (g.error) return g.error;
    try {
      const result = await handler(request, { staff: g.staff, params: context?.params ? await context.params : {} });
      return result instanceof Response ? result : NextResponse.json(result, { headers: NO_STORE });
    } catch (e) {
      if (e instanceof StateError) return NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE });
      console.error('menu pdf admin failed', e);
      return NextResponse.json({ error: 'That did not work. The menu customers get has not changed. Please try again.' }, { status: 503, headers: NO_STORE });
    }
  };
}
