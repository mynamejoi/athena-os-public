import { NextResponse } from 'next/server';
import { isSetupComplete } from '@/lib/app-config';

export async function GET() {
  try {
    const complete = await isSetupComplete();
    return NextResponse.json({ complete });
  } catch {
    return NextResponse.json({ complete: false });
  }
}
