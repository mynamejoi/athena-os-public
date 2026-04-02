
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for server-side logging
// using generic createClient from supabase-js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export type UsageProvider = 'anthropic' | 'google' | 'exa' | 'supadata';
export type UsageFeature = 'chat' | 'ingest' | 'research' | 'monitoring' | 'workout_coach' | 'workout_weekly_planner';

// Cost per 1M tokens (USD)
const PRICING = {
    'claude-3-5-sonnet-20240620': { in: 3.00, out: 15.00 },
    'claude-3-5-sonnet-20241022': { in: 3.00, out: 15.00 },
    'claude-sonnet-4-5-20250929': { in: 6.00, out: 21.00 }, // Estimated Premium Pricing
    'claude-3-haiku-20240307': { in: 0.25, out: 1.25 },
    'gemini-1.5-flash': { in: 0.075, out: 0.30 },
    'gemini-flash-latest': { in: 0.075, out: 0.30 }, // Same as 1.5 Flash
    'gemini-2.0-flash-exp': { in: 0, out: 0 }, // Free during experimental phase
    'gemini-2.0-flash': { in: 0.10, out: 0.40 },
};

// Fixed costs
const EXA_SEARCH_COST = 0.0005; // ~$0.50 per 1k searches
const SUPADATA_COST = 0; // Free (Credit based)


export async function logUsage(params: {
    provider: UsageProvider;
    model: string;
    tokensIn?: number;
    tokensOut?: number;
    feature: UsageFeature;
    userId?: string;
}) {
    const { provider, model, tokensIn = 0, tokensOut = 0, feature, userId } = params;

    let cost = 0;

    if (provider === 'exa') {
        cost = EXA_SEARCH_COST;
    } else if (provider === 'supadata') {
        cost = SUPADATA_COST;
    } else if (PRICING[model as keyof typeof PRICING]) {
        const prices = PRICING[model as keyof typeof PRICING];
        cost = (tokensIn / 1_000_000) * prices.in + (tokensOut / 1_000_000) * prices.out;
    } else {
        // Fallback or unknown model
        console.warn(`Unknown model for pricing: ${model}`);
    }

    // Insert log
    const { error } = await supabase.from('api_usage_logs').insert({
        provider,
        model,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost,
        feature,
        user_id: userId === 'anon' ? null : userId // Handle 'anon' user
    });

    if (error) {
        console.error('Failed to log API usage:', error);
        return { success: false, cost: 0 };
    } else {
        return { success: true, cost };
    }
}
