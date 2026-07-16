function collectKeys(prefix: string): string[] {
  return [1, 2, 3, 4]
    .map((n) => process.env[`${prefix}_${n}`])
    .filter((key): key is string => Boolean(key));
}

export const llmProvidersConfig = () => ({
  llmProviders: {
    gemini: {
      apiKeys: collectKeys('GEMINI_API_KEY'),
      embeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001',
    },
    gpt: {
      apiKeys: collectKeys('GPT_API_KEY'),
      model: process.env.GPT_MODEL ?? 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
    },
    groq: {
      apiKeys: collectKeys('GROQ_API_KEY'),
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      baseUrl: 'https://api.groq.com/openai/v1',
    },
    cerebras: {
      apiKeys: collectKeys('CEREBRAS_API_KEY'),
      model: process.env.CEREBRAS_MODEL ?? 'gpt-oss-120b',
      baseUrl: 'https://api.cerebras.ai/v1',
    },
  },
});
