import { game, useGame } from './game/controller';
import { BirthCert } from './ui/BirthCert';
import { End } from './ui/End';
import { Home } from './ui/Home';
import { Life } from './ui/Life';
import { TipLayer } from './ui/TipLayer';

export function App() {
  useGame();
  return <>
    {game.screen === 'home' && <Home />}
    {game.screen === 'birth' && <BirthCert />}
    {game.screen === 'life' && <Life />}
    {game.screen === 'end' && <End />}
    <TipLayer />
  </>;
}
