import { playBuy, playSelect } from '@/lib/gameAudio';

interface Props {
  gems: number;
  level: number;
  onBuyHeart: () => void;
  onBuyShield: () => void;
  onContinue: () => void;
  heartBought: boolean;
  shieldBought: boolean;
}

export default function GameStore({ gems, level, onBuyHeart, onBuyShield, onContinue, heartBought, shieldBought }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-background">
      <h1 className="game-title text-4xl md:text-5xl">Power-Up Store</h1>
      <p className="text-lg text-muted-foreground">Upgrades last for Level {level} only</p>
      <div className="flex items-center gap-2 text-2xl font-bold">
        <span className="text-game-gem">💎</span>
        <span className="text-accent">{gems} Gems</span>
      </div>

      <div className="flex flex-wrap justify-center gap-6 mt-4">
        {/* Heart upgrade */}
        <div className="game-card w-64 flex flex-col items-center gap-3">
          <span className="text-5xl">❤️</span>
          <h3 className="text-xl font-bold text-foreground">Extra Heart</h3>
          <p className="text-sm text-muted-foreground text-center">Get 2 hearts! Survive one laser hit.</p>
          <p className="text-lg font-bold text-accent">💎 20 Gems</p>
          {heartBought ? (
            <span className="text-game-success font-bold">✓ Purchased</span>
          ) : (
            <button
              disabled={gems < 20}
              onClick={() => { playBuy(); onBuyHeart(); }}
              className={`game-btn text-sm ${gems < 20 ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Buy
            </button>
          )}
        </div>

        {/* Shield upgrade */}
        <div className="game-card w-64 flex flex-col items-center gap-3">
          <span className="text-5xl">🛡️</span>
          <h3 className="text-xl font-bold text-foreground">Shield</h3>
          <p className="text-sm text-muted-foreground text-center">Invincible for 25 seconds!</p>
          <p className="text-lg font-bold text-accent">💎 30 Gems</p>
          {shieldBought ? (
            <span className="text-game-success font-bold">✓ Purchased</span>
          ) : (
            <button
              disabled={gems < 30}
              onClick={() => { playBuy(); onBuyShield(); }}
              className={`game-btn text-sm ${gems < 30 ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Buy
            </button>
          )}
        </div>
      </div>

      <button onClick={() => { playSelect(); onContinue(); }} className="game-btn-accent mt-4">
        🏁 Start Level {level}
      </button>
    </div>
  );
}
