'use client';

import { startTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ConnectionError from '@/components/ConnectionError';

export default function PageError({ error, reset }) {
  const router = useRouter();
  const retry = useCallback(() => startTransition(() => { router.refresh(); reset(); }), [router, reset]);
  return <ConnectionError error={error} retry={retry} note="Your cart is safe." />;
}
