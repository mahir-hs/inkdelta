// A small word-level diff, the same idea Inkdelta uses on real documents:
// find the longest run of words two versions share, and call everything else added or removed.

/** Returns a list of { t: "eq" | "del" | "ins", text } in reading order. */
export function diffWords(before, after) {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);

  // longest common subsequence table
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const ops = [];
  const push = (t, word) => {
    const last = ops[ops.length - 1];
    if (last && last.t === t) last.text += " " + word;
    else ops.push({ t, text: word });
  };
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push("eq", a[i]); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) push("del", a[i++]);
    else push("ins", b[j++]);
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("ins", b[j++]);
  return ops;
}

/** Words added, words removed, and how many separate changes (a removal next to an addition is one change). */
export function tally(ops) {
  let added = 0, removed = 0, changes = 0, inChange = false;
  for (const op of ops) {
    const words = op.text.split(" ").length;
    if (op.t === "eq") { inChange = false; continue; }
    if (!inChange) { changes++; inChange = true; }
    if (op.t === "ins") added += words; else removed += words;
  }
  return { added, removed, changes };
}

/** Draw ops into an element with <del> and <ins>, using text nodes only. */
export function renderOps(element, ops) {
  element.textContent = "";
  ops.forEach((op, index) => {
    if (index > 0) element.append(" ");
    if (op.t === "eq") element.append(op.text);
    else {
      const mark = document.createElement(op.t === "del" ? "del" : "ins");
      mark.textContent = op.text;
      element.append(mark);
    }
  });
}
