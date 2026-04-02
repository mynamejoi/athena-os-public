
export type LLMProvider = 'anthropic';

interface GenerateOptions {
    provider?: LLMProvider;
    system?: string;
    prompt: string;
    messages?: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export async function generateCompletion({
    provider = 'anthropic',
    system,
    prompt,
    messages,
    model,
    temperature = 0.7,
    maxTokens = 2048,
}: GenerateOptions) {

    let modelInstance;

    switch (provider) {
        case 'anthropic':
            const { getAnthropic } = await import('./claude');
            const anthropic = await getAnthropic();

            const anthropicMessages = messages && messages.length > 0
                ? messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
                : [{ role: 'user' as const, content: prompt }];

            const anthropicResponse = await anthropic.messages.create({
                model: model || 'claude-sonnet-4-5-20250929',
                max_tokens: maxTokens,
                messages: anthropicMessages,
                system: system,
                temperature,
            });
            return anthropicResponse.content[0].type === 'text' ? anthropicResponse.content[0].text : '';
    }
}
