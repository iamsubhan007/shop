'use client';

import { startTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ConnectionError from '@/components/ConnectionError';

// Catches errors from every admin screen, including the sign-in check around them.
export default function AdminError({ error, reset }) {
  const router = useRouter();
  const retry = useCallback(() => startTransition(() => { router.refresh(); reset(); }), [router, reset]);
  return <ConnectionError error={error} retry={retry} note="Your orders are safe; you are still signed in." />;
}
