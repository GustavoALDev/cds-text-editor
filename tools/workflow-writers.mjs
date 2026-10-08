// Ajudantes dos testes dos workflows com escrita (visual-update.yml e perf-baseline.yml).

/** Corpos dos `run:` (uma linha ou bloco `|`) de um workflow, com a linha de início. */
export function runBodies(yaml) {
  const lines = yaml.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (m[2] === '|' || m[2] === '>') {
      const indent = m[1].length;
      const body = [];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() !== '' && l.search(/\S/) <= indent) break;
        body.push(l);
      }
      out.push({ line: i + 1, body: body.join('\n') });
    } else {
      out.push({ line: i + 1, body: m[2] });
    }
  }
  return out;
}
