export class ProviderError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
