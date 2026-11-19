export interface DiffLine {
  type: "same" | "add" | "del";
  text: string;
}

/** Line-by-line diff (longest common subsequence) between two versions of some code. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");

  // Trim shared start and end so the table only covers the part that changed.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;

  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let x = n - 1; x >= 0; x--) {
    for (let y = m - 1; y >= 0; y--) {
      table[x]![y] =
        midA[x] === midB[y]
          ? table[x + 1]![y + 1]! + 1
          : Math.max(table[x + 1]![y]!, table[x]![y + 1]!);
    }
  }

  const out: DiffLine[] = a.slice(0, start).map((text) => ({ type: "same", text }));
  let x = 0;
  let y = 0;
  while (x < n && y < m) {
    if (midA[x] === midB[y]) {
      out.push({ type: "same", text: midA[x]! });
      x++;
      y++;
    } else if (table[x + 1]![y]! >= table[x]![y + 1]!) {
      out.push({ type: "del", text: midA[x++]! });
    } else {
      out.push({ type: "add", text: midB[y++]! });
    }
  }
  while (x < n) out.push({ type: "del", text: midA[x++]! });
  while (y < m) out.push({ type: "add", text: midB[y++]! });
  for (const text of a.slice(endA)) out.push({ type: "same", text });
  return out;
}
