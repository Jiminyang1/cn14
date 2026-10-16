// 起名字。

import { ETH_NAMES, GIVEN, SURNAMES } from './data';
import { chance, pick, wpick } from './rng';

// ===== 名字 =====
export function makeName(sex, eth, surname?) {
  if (ETH_NAMES[eth] && (eth !== '蒙古族' || chance(0.5))) return { full: pick(ETH_NAMES[eth][sex]), sur: '' };
  const sur = surname || wpick(SURNAMES);
  return { full: sur + pick(GIVEN[sex]), sur };
}
