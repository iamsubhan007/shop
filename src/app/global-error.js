'use client';

import { useCallback } from 'react';
import ConnectionError from '@/components/ConnectionError';

// Last resort, when the outer page itself failed to render.
export default function GlobalError({ error }) {
  const retry = useCallback(() => window.location.reload(), []);
  return (
    <html lang="en">
      <body>
        <ConnectionError error={error} retry={retry} note="" />
      </body>
    </html>
  );
}
