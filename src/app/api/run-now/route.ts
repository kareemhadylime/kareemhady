import { NextResponse } from 'next/server';
import { runDaily } from '@/lib/run-daily';

export async function POST() {
  const result = await runDaily('manual');
  return NextResponse.redirect(
    new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
    { status: 303 }
  );
}
