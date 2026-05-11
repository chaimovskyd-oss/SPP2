let sequence = 0;

export function createId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${sequence.toString(36).padStart(4, "0")}`;
}

export function resetIdSequenceForTests(): void {
  sequence = 0;
}
