
import { initiateWhoopAuth } from '@/lib/whoop';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const url = await initiateWhoopAuth();
        return NextResponse.redirect(url);
    } catch (error) {
        console.error('Whoop Auth Error:', error);
        return NextResponse.json({ error: `Auth Error: ${(error as Error).message}` }, { status: 500 });
    }
}
