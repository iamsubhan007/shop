import { NextResponse } from 'next/server';
import { getSettings, orderingState, paymentInstructions, publicSettings } from '@/lib/server/settings';
import { getCustomer } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

// Public settings. Payment account details are only returned to signed-in customers (checkout).
export async function GET(request) {
  const s = await getSettings();
  const out = { ...publicSettings(s), orderingState: orderingState(s) };
  if (new URL(request.url).searchParams.get('payment') === '1' && (await getCustomer())) {
    out.paymentInstructions = paymentInstructions(s);
  }
  return NextResponse.json(out);
}
