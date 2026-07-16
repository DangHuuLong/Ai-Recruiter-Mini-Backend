// Round-robins through a provider's configured API keys — used both to
// spread load across keys and, in MultiProviderCompletionService, to
// continue a truncated response using a different key than the one that
// got cut off.
export class KeyRotator {
  private index = 0;

  constructor(private readonly keys: string[]) {}

  hasKeys(): boolean {
    return this.keys.length > 0;
  }

  size(): number {
    return this.keys.length;
  }

  next(): string {
    if (this.keys.length === 0) {
      throw new Error('No API keys configured for this provider');
    }
    const key = this.keys[this.index % this.keys.length];
    this.index += 1;
    return key;
  }
}
