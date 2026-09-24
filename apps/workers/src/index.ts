// P3/P4: Bun workers for eval fan-out + cache embedding.
// P0 placeholder — keeps workspace resolvable.
export function fanOut<T>(items: T[]): T[] {
  return items
}

if (import.meta.main) {
  console.log("breakwall workers (P0 scaffold)")
}
