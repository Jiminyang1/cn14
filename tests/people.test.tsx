// 右下角「人际关系」：一生里每个年纪都画得出来，该出现的人都在
import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as E from '../src/engine';
import { People } from '../src/ui/Sidebar';

test('people panel renders at every age and lists partner, kids and the childhood friend once they exist', () => {
  for (const seed of [11, 2024, 31337, 777, 90210, 5, 42]) {
    E.birth(seed, { headless: true });
    const L = E.S;
    while (L.phase === 'life') {
      E.runHeadlessYear();
      if (L.phase !== 'life') break;
      const html = renderToStaticMarkup(<People />);
      expect(html).toContain('家里');
      if (L.fam.partner?.alive) expect(html).toContain(L.fam.partner.name);
      for (const k of L.fam.kids) expect(html).toContain(k.name);
      if (L.ppl?.pal) expect(html).toContain(L.ppl.pal.name);
    }
  }
});
