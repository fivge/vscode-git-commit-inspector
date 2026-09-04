export class LatestRequest {
  private value = 0;

  public next(): number {
    this.value += 1;
    return this.value;
  }

  public isCurrent(request: number): boolean {
    return request === this.value;
  }

  public invalidate(): void {
    this.value += 1;
  }
}
