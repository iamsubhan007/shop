import { NextResponse } from 'next/server';

// /menu (lowercase) is how most people type or link the menu page. The page itself lives at /Menu and routes here are case
// sensitive, so lowercase would be a dead 404 for visitors and search engines. Send it to the real page permanently.
export function proxy(request) {
  if (request.nextUrl.pathname === '/menu') {
    const url = request.nextUrl.clone();
    url.pathname = '/Menu';
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/menu'] };
