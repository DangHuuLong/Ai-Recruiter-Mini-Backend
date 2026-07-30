// Round-robins through a provider's configured API keys to spread load
// and to resume a truncated response on a different key.
export class KeyRotator {
  private index = 0;

  constructor(private readonly keys: string[]) {}

  // Checked by GeminiEmbeddingService/MultiProviderCompletionService before attempting a call.
  hasKeys(): boolean {
    return this.keys.length > 0;
  }

  // Used by callers to bound their retry-across-keys loop.
  size(): number {
    return this.keys.length;
  }

  // Returns the next key in round-robin order; called once per attempt in the retry loops above.
  next(): string {
    if (this.keys.length === 0) {
      throw new Error('No API keys configured for this provider');
    }
    const key = this.keys[this.index % this.keys.length];
    this.index += 1;
    return key;
  }
}
