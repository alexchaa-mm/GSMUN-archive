import './styles.css';
import { GameApp } from './game/GameApp';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) {
  throw new Error('Missing #game-canvas element.');
}

const game = await GameApp.create(canvas);
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
