import { useState, useEffect, useCallback } from 'react';
import { Character, Background, Screen, BACKGROUNDS, CHARACTER_EMOJI, CHARACTER_NAMES, shuffleArray, GameSave } from '@/lib/gameTypes';
import { playSelect, playWin } from '@/lib/gameAudio';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import CharacterSelect from './CharacterSelect';
import GameStore from './GameStore';
import GameCanvas from './GameCanvas';
import { UnlockCheckout } from './UnlockCheckout';
import { useUnlock } from '@/hooks/useUnlock';

const SAVE_KEY = 'laser-dash-save';

function loadSave(): GameSave | null {
  try {
    const d = localStorage.getItem(SAVE_KEY);
    return d ? JSON.parse(d) : null;
  } catch { return null; }
}

function saveSave(s: GameSave) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

async function syncProgressToDb(userId: string, gems: number, level: number) {
  const { data } = await supabase
    .from('profiles')
    .select('gems, highest_level')
    .eq('user_id', userId)
    .single();

  if (data) {
    const updates: Record<string, number> = {};
    if (gems > data.gems) updates.gems = gems;
    if (level > data.highest_level) updates.highest_level = level;
    if (Object.keys(updates).length > 0) {
      await supabase.from('profiles').update(updates).eq('user_id', userId);
    }
  }
}

export default function Game() {
  const { user, signOut } = useAuth();
  const { unlocked, refresh: refreshUnlock } = useUnlock();
  const [showCheckout, setShowCheckout] = useState(false);
  const [screen, setScreen] = useState<Screen>('title');
  const [character, setCharacter] = useState<Character | null>(null);
  const [level, setLevel] = useState(1);
  const [gems, setGems] = useState(0);
  const [hearts, setHearts] = useState(1);
  const [hasShield, setHasShield] = useState(false);
  const [heartBought, setHeartBought] = useState(false);
  const [shieldBought, setShieldBought] = useState(false);
  const [backgrounds, setBackgrounds] = useState<Background[]>(() => shuffleArray([...BACKGROUNDS]));
  const [hasSave, setHasSave] = useState(false);

  // Load saved state from DB on mount
  useEffect(() => {
    const s = loadSave();
    if (s) setHasSave(true);

    if (user) {
      supabase
        .from('profiles')
        .select('gems, highest_level')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data && !s) {
            // If no local save, restore gems from DB
            setGems(data.gems);
          }
        });
    }
  }, [user]);

  // Handle return from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      const tryRefresh = (n = 0) => {
        refreshUnlock();
        if (n < 6) setTimeout(() => tryRefresh(n + 1), 1000);
      };
      tryRefresh();
      window.history.replaceState({}, '', window.location.pathname);
      setShowCheckout(false);
    }
  }, [refreshUnlock]);

  const resumeGame = useCallback(() => {
    const s = loadSave();
    if (s) {
      setCharacter(s.character);
      setLevel(s.level);
      setGems(s.gems);
      setBackgrounds(s.backgrounds);
      setHearts(1);
      setHasShield(false);
      setHeartBought(false);
      setShieldBought(false);
      setScreen('store');
    }
  }, []);

  const startNew = useCallback(() => {
    clearSave();
    setLevel(1);
    setGems(0);
    setHearts(1);
    setHasShield(false);
    setBackgrounds(shuffleArray([...BACKGROUNDS]));
    setScreen('select');
  }, []);

  const handleCharacterSelect = useCallback((c: Character) => {
    setCharacter(c);
    setScreen('store');
  }, []);

  const handleLevelComplete = useCallback((gemsCollected: number) => {
    const newGems = gems + gemsCollected + 10;
    setGems(newGems);
    if (level >= 5) {
      setScreen('gameComplete');
      clearSave();
      if (user) syncProgressToDb(user.id, newGems, level);
    } else {
      setScreen('levelComplete');
      saveSave({ character: character!, level: level + 1, gems: newGems, backgrounds });
      if (user) syncProgressToDb(user.id, newGems, level);
    }
  }, [gems, level, character, backgrounds, user]);

  const handleNextLevel = useCallback(() => {
    // Gate: after completing level 2, require unlock to play level 3+
    if (level >= 2 && !unlocked) {
      setShowCheckout(true);
      return;
    }
    setLevel((l) => l + 1);
    setHearts(1);
    setHasShield(false);
    setHeartBought(false);
    setShieldBought(false);
    setScreen('store');
  }, [level, unlocked]);

  const handlePause = useCallback(() => {
    if (character) {
      saveSave({ character, level, gems, backgrounds });
    }
    setScreen('paused');
  }, [character, level, gems, backgrounds]);

  const handleBuyHeart = useCallback(() => {
    if (gems >= 20) { setGems((g) => g - 20); setHearts(2); setHeartBought(true); }
  }, [gems]);

  const handleBuyShield = useCallback(() => {
    if (gems >= 30) { setGems((g) => g - 30); setHasShield(true); setShieldBought(true); }
  }, [gems]);

  const renderScreen = () => {
  // Title Screen
  if (screen === 'title') {
    const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Racer';
    const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-background relative">
        {/* User info + sign out */}
        <div className="absolute top-4 right-4 flex items-center gap-3">
          {avatarUrl && (
            <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full border-2 border-primary" />
          )}
          <span className="text-sm text-muted-foreground">{displayName}</span>
          <button
            onClick={async () => { await signOut(); }}
            className="text-xs px-3 py-1.5 rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign Out
          </button>
        </div>

        <h1 className="game-title">Laser Dash</h1>
        <p className="text-xl text-muted-foreground text-center max-w-md">
          Race through 5 epic levels, dodge deadly lasers, collect gems, and become the ultimate champion! 🏆
        </p>
        <div className="flex flex-col gap-4 mt-4">
          <button onClick={() => { playSelect(); startNew(); }} className="game-btn">
            🎮 New Game
          </button>
          {hasSave && (
            <button onClick={() => { playSelect(); resumeGame(); }} className="game-btn-secondary">
              ▶️ Continue
            </button>
          )}
        </div>
        <div className="mt-8 text-sm text-muted-foreground text-center space-y-1">
          <p>⬆️ Accelerate &nbsp; ⬇️ Brake &nbsp; ⬅️➡️ Steer</p>
          <p>ESC to Pause</p>
        </div>
      </div>
    );
  }

  if (screen === 'select') {
    return <CharacterSelect onSelect={handleCharacterSelect} />;
  }

  if (screen === 'store') {
    return (
      <GameStore
        gems={gems}
        level={level}
        onBuyHeart={handleBuyHeart}
        onBuyShield={handleBuyShield}
        onContinue={() => { playSelect(); setScreen('playing'); }}
        heartBought={heartBought}
        shieldBought={shieldBought}
      />
    );
  }

  if (screen === 'playing' && character) {
    return (
      <GameCanvas
        level={level}
        character={character}
        background={backgrounds[level - 1]}
        hearts={hearts}
        hasShield={hasShield}
        gems={gems}
        onComplete={handleLevelComplete}
        onPause={handlePause}
      />
    );
  }

  if (screen === 'paused') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-background">
        <h2 className="game-title text-4xl">⏸ Paused</h2>
        <p className="text-muted-foreground">Level {level} • 💎 {gems} Gems</p>
        <div className="flex flex-col gap-4">
          <button onClick={() => { playSelect(); setScreen('playing'); }} className="game-btn">
            ▶️ Resume
          </button>
          <button onClick={() => { playSelect(); setScreen('title'); }} className="game-btn-secondary">
            🏠 Main Menu
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'levelComplete') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-background">
        <h2 className="game-title text-4xl">🎉 Level {level} Complete!</h2>
        <div className="text-6xl float-animation">{CHARACTER_EMOJI[character!]}</div>
        <p className="text-2xl text-accent font-bold">+10 Gems Earned! 💎</p>
        <p className="text-lg text-muted-foreground">Total: 💎 {gems} Gems</p>
        <button onClick={() => { playSelect(); handleNextLevel(); }} className="game-btn-accent">
          ➡️ Next Level
        </button>
      </div>
    );
  }

  if (screen === 'gameComplete') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6 bg-background">
        <h1 className="game-title">🏆 Champion!</h1>
        <div className="text-8xl float-animation">{CHARACTER_EMOJI[character!]}</div>
        <p className="text-2xl text-foreground font-bold">
          You completed all 5 levels with {CHARACTER_NAMES[character!]}!
        </p>
        <p className="text-xl text-accent font-bold">💎 {gems} Total Gems</p>
        <button onClick={() => { playSelect(); startNew(); }} className="game-btn">
          🔄 Play Again
        </button>
      </div>
    );
  }

  return null;
  };

  return (
    <>
      {renderScreen()}
      {showCheckout && user && (
        <UnlockCheckout
          userId={user.id}
          customerEmail={user.email ?? undefined}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </>
  );
}
