import { useEffect, useRef, useCallback, useState } from 'react';
import { useIsTouchDevice } from '@/hooks/use-mobile';
import { Character, Background, CHARACTER_EMOJI, LEVEL_CONFIGS, BG_COLORS } from '@/lib/gameTypes';
import { playCollect, playHit, playWin } from '@/lib/gameAudio';

interface Props {
  level: number;
  character: Character;
  background: Background;
  hearts: number;
  hasShield: boolean;
  gems: number;
  onComplete: (gemsCollected: number) => void;
  onPause: () => void;
}

interface Obstacle {
  distance: number;
  gapX: number;
  gapWidth: number;
  oscillating: boolean;
  baseGapX: number;
  oscillateSpeed: number;
  oscillateRange: number;
}

interface GemItem {
  distance: number;
  x: number;
  collected: boolean;
}

const CW = 800;
const CH = 600;
const ROAD_L = 140;
const ROAD_W = 520;
const ROAD_R = ROAD_L + ROAD_W;
const PLAYER_SCREEN_Y = CH - 100;
const PLAYER_W = 36;
const PLAYER_H = 36;

export default function GameCanvas({ level, character, background, hearts: initHearts, hasShield: initShield, gems: startGems, onComplete, onPause }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    playerX: CW / 2,
    speed: 0,
    distance: 0,
    keys: { up: false, down: false, left: false, right: false },
    hearts: initHearts,
    shieldActive: initShield,
    shieldTimer: initShield ? 25 * 60 : 0, // frames (60fps * 25s)
    gemsCollected: 0,
    obstacles: [] as Obstacle[],
    gems: [] as GemItem[],
    finished: false,
    hitCooldown: 0,
    frame: 0,
    startCountdown: 180, // 3 seconds
  });

  const config = LEVEL_CONFIGS[level - 1];
  const colors = BG_COLORS[background];

  // Generate level
  useEffect(() => {
    const s = stateRef.current;
    s.playerX = CW / 2;
    s.speed = 0;
    s.distance = 0;
    s.hearts = initHearts;
    s.shieldActive = initShield;
    s.shieldTimer = initShield ? 25 * 60 : 0;
    s.gemsCollected = 0;
    s.finished = false;
    s.hitCooldown = 0;
    s.frame = 0;
    s.startCountdown = 180;

    // Generate obstacles
    const obs: Obstacle[] = [];
    for (let i = 0; i < config.numObstacles; i++) {
      const dist = ((config.trackLength - 400) / (config.numObstacles + 1)) * (i + 1) + 200;
      const gapX = ROAD_L + 20 + Math.random() * (ROAD_W - config.gapWidth - 40);
      const isOsc = i < config.oscillatingCount && i % 2 === 0;
      obs.push({
        distance: dist,
        gapX,
        gapWidth: config.gapWidth,
        oscillating: isOsc,
        baseGapX: gapX,
        oscillateSpeed: 0.02 + Math.random() * 0.02,
        oscillateRange: 40 + Math.random() * 40,
      });
    }
    s.obstacles = obs;

    // Generate gems
    const gms: GemItem[] = [];
    for (let i = 0; i < config.numGems; i++) {
      const dist = ((config.trackLength - 200) / (config.numGems + 1)) * (i + 1) + 100;
      const x = ROAD_L + 40 + Math.random() * (ROAD_W - 80);
      gms.push({ distance: dist, x, collected: false });
    }
    s.gems = gms;
  }, [level, initHearts, initShield, config]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = stateRef.current.keys;
      if (e.key === 'ArrowUp') { k.up = true; e.preventDefault(); }
      if (e.key === 'ArrowDown') { k.down = true; e.preventDefault(); }
      if (e.key === 'ArrowLeft') { k.left = true; e.preventDefault(); }
      if (e.key === 'ArrowRight') { k.right = true; e.preventDefault(); }
      if (e.key === 'Escape' || e.key === 'p') onPause();
    };
    const up = (e: KeyboardEvent) => {
      const k = stateRef.current.keys;
      if (e.key === 'ArrowUp') k.up = false;
      if (e.key === 'ArrowDown') k.down = false;
      if (e.key === 'ArrowLeft') k.left = false;
      if (e.key === 'ArrowRight') k.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [onPause]);

  const restart = useCallback(() => {
    const s = stateRef.current;
    s.playerX = CW / 2;
    s.speed = 0;
    s.distance = 0;
    s.hearts = initHearts;
    s.shieldActive = initShield;
    s.shieldTimer = initShield ? 25 * 60 : 0;
    s.gemsCollected = 0;
    s.hitCooldown = 0;
    s.startCountdown = 120;
    s.finished = false;
    // Regenerate obstacles
    s.obstacles.forEach((o) => {
      if (o.oscillating) o.gapX = o.baseGapX;
    });
    s.gems.forEach((g) => { g.collected = false; });
  }, [initHearts, initShield]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf: number;

    const loop = () => {
      const s = stateRef.current;
      s.frame++;

      // Countdown
      if (s.startCountdown > 0) {
        s.startCountdown--;
        render(ctx, s);
        raf = requestAnimationFrame(loop);
        return;
      }

      if (s.finished) { raf = requestAnimationFrame(loop); return; }

      // Update
      const { keys } = s;
      if (keys.up) s.speed = Math.min(s.speed + 0.12, config.maxSpeed);
      else if (keys.down) s.speed = Math.max(s.speed - 0.2, 0);
      else s.speed = Math.max(s.speed - 0.03, 0);

      if (keys.left) s.playerX = Math.max(s.playerX - 4.5, ROAD_L + PLAYER_W / 2);
      if (keys.right) s.playerX = Math.min(s.playerX + 4.5, ROAD_R - PLAYER_W / 2);

      s.distance += s.speed;

      // Shield timer
      if (s.shieldActive && s.shieldTimer > 0) {
        s.shieldTimer--;
        if (s.shieldTimer <= 0) s.shieldActive = false;
      }

      if (s.hitCooldown > 0) s.hitCooldown--;

      // Oscillating obstacles
      s.obstacles.forEach((o) => {
        if (o.oscillating) {
          o.gapX = o.baseGapX + Math.sin(s.frame * o.oscillateSpeed) * o.oscillateRange;
          o.gapX = Math.max(ROAD_L + 10, Math.min(o.gapX, ROAD_R - o.gapWidth - 10));
        }
      });

      // Collision with obstacles
      if (s.hitCooldown <= 0) {
        for (const o of s.obstacles) {
          const oScreenY = PLAYER_SCREEN_Y - (o.distance - s.distance);
          if (Math.abs(oScreenY - PLAYER_SCREEN_Y) < 15) {
            const px = s.playerX;
            const inGap = px > o.gapX + 8 && px < o.gapX + o.gapWidth - 8;
            if (!inGap && !s.shieldActive) {
              playHit();
              s.hearts--;
              if (s.hearts <= 0) {
                restart();
                break;
              } else {
                s.hitCooldown = 60;
              }
            }
          }
        }
      }

      // Gem collection
      for (const g of s.gems) {
        if (g.collected) continue;
        const gScreenY = PLAYER_SCREEN_Y - (g.distance - s.distance);
        if (Math.abs(gScreenY - PLAYER_SCREEN_Y) < 25) {
          const dx = Math.abs(g.x - s.playerX);
          if (dx < 30) {
            g.collected = true;
            s.gemsCollected++;
            playCollect();
          }
        }
      }

      // Win check
      if (s.distance >= config.trackLength) {
        s.finished = true;
        playWin();
        setTimeout(() => onComplete(s.gemsCollected), 1200);
      }

      render(ctx, s);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [config, restart, onComplete]);

  const render = (ctx: CanvasRenderingContext2D, s: typeof stateRef.current) => {
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, CH);
    grad.addColorStop(0, colors.top);
    grad.addColorStop(1, colors.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH);

    // Draw background decorations
    drawBgDecorations(ctx, s.distance, background);

    // Road
    ctx.fillStyle = colors.road;
    ctx.fillRect(ROAD_L, 0, ROAD_W, CH);

    // Road edges
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ROAD_L, 0); ctx.lineTo(ROAD_L, CH);
    ctx.moveTo(ROAD_R, 0); ctx.lineTo(ROAD_R, CH);
    ctx.stroke();

    // Center dashes
    ctx.strokeStyle = colors.roadLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([30, 20]);
    ctx.lineDashOffset = (s.distance * 2) % 50;
    ctx.beginPath();
    ctx.moveTo(CW / 2, 0); ctx.lineTo(CW / 2, CH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Finish line
    const finishScreenY = PLAYER_SCREEN_Y - (config.trackLength - s.distance);
    if (finishScreenY > -30 && finishScreenY < CH + 30) {
      const sqSize = 20;
      for (let x = ROAD_L; x < ROAD_R; x += sqSize) {
        for (let row = 0; row < 2; row++) {
          const isWhite = ((x - ROAD_L) / sqSize + row) % 2 === 0;
          ctx.fillStyle = isWhite ? '#fff' : '#222';
          ctx.fillRect(x, finishScreenY + row * sqSize - sqSize, sqSize, sqSize);
        }
      }
    }

    // Start line
    const startScreenY = PLAYER_SCREEN_Y - (0 - s.distance);
    if (startScreenY > -30 && startScreenY < CH + 30) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(ROAD_L, startScreenY - 3, ROAD_W, 6);
      ctx.font = 'bold 16px Fredoka, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('START', CW / 2, startScreenY - 10);
    }

    // Obstacles (lasers)
    for (const o of s.obstacles) {
      const sy = PLAYER_SCREEN_Y - (o.distance - s.distance);
      if (sy < -30 || sy > CH + 30) continue;

      // Laser beam glow
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 15;

      ctx.fillStyle = `rgba(255, 40, 40, ${0.7 + Math.sin(s.frame * 0.1) * 0.3})`;
      // Left beam
      if (o.gapX > ROAD_L) {
        ctx.fillRect(ROAD_L, sy - 5, o.gapX - ROAD_L, 10);
      }
      // Right beam
      const rightStart = o.gapX + o.gapWidth;
      if (rightStart < ROAD_R) {
        ctx.fillRect(rightStart, sy - 5, ROAD_R - rightStart, 10);
      }

      ctx.shadowBlur = 0;

      // Laser emitters
      ctx.fillStyle = '#ff6666';
      ctx.fillRect(ROAD_L - 8, sy - 8, 12, 16);
      ctx.fillRect(ROAD_R - 4, sy - 8, 12, 16);
    }

    // Gems
    for (const g of s.gems) {
      if (g.collected) continue;
      const sy = PLAYER_SCREEN_Y - (g.distance - s.distance);
      if (sy < -20 || sy > CH + 20) continue;
      
      ctx.save();
      ctx.translate(g.x, sy);
      ctx.rotate(s.frame * 0.05);
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 12;
      // Diamond shape
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(10, 0);
      ctx.lineTo(0, 12);
      ctx.lineTo(-10, 0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Player
    ctx.save();
    ctx.translate(s.playerX, PLAYER_SCREEN_Y);

    // Shield effect
    if (s.shieldActive) {
      ctx.strokeStyle = `rgba(0, 220, 255, ${0.4 + Math.sin(s.frame * 0.1) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowColor = '#00dcff';
      ctx.shadowBlur = 15;
    }

    // Hit flash
    if (s.hitCooldown > 0 && s.hitCooldown % 10 < 5) {
      ctx.globalAlpha = 0.4;
    }

    ctx.font = `${PLAYER_H}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CHARACTER_EMOJI[character], 0, 0);
    ctx.restore();

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CW, 50);

    ctx.font = 'bold 18px Fredoka, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Hearts
    let hx = 15;
    for (let i = 0; i < s.hearts; i++) {
      ctx.fillStyle = '#ff4444';
      ctx.fillText('❤️', hx, 25);
      hx += 30;
    }

    // Gems
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`💎 ${startGems + s.gemsCollected}`, hx + 10, 25);

    // Shield timer
    if (s.shieldActive) {
      const secs = Math.ceil(s.shieldTimer / 60);
      ctx.fillStyle = '#00dcff';
      ctx.fillText(`🛡️ ${secs}s`, hx + 100, 25);
    }

    // Level
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(`Level ${level}`, CW / 2, 25);

    // Progress bar
    ctx.textAlign = 'right';
    const progress = Math.min(s.distance / config.trackLength, 1);
    ctx.fillStyle = '#555';
    ctx.fillRect(CW - 170, 15, 120, 16);
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(CW - 170, 15, 120 * progress, 16);
    ctx.fillStyle = '#fff';
    ctx.font = '12px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(progress * 100)}%`, CW - 110, 25);

    // Pause hint
    ctx.textAlign = 'right';
    ctx.font = '12px Fredoka, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('ESC to pause', CW - 10, 45);

    // Countdown overlay
    if (s.startCountdown > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, CW, CH);
      ctx.font = 'bold 80px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      const num = Math.ceil(s.startCountdown / 60);
      ctx.fillText(num > 0 ? `${num}` : 'GO!', CW / 2, CH / 2);
    }

    // Finish overlay
    if (s.finished) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, CW, CH);
      ctx.font = 'bold 48px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#4caf50';
      ctx.fillText('🏆 Level Complete!', CW / 2, CH / 2);
    }
  };

  const isMobile = useIsTouchDevice();

  const touchStart = (key: 'up' | 'down' | 'left' | 'right') => {
    stateRef.current.keys[key] = true;
  };
  const touchEnd = (key: 'up' | 'down' | 'left' | 'right') => {
    stateRef.current.keys[key] = false;
  };

  const DPadButton = ({ label, dir, className }: { label: string; dir: 'up' | 'down' | 'left' | 'right'; className?: string }) => (
    <button
      className={`w-16 h-16 rounded-2xl bg-primary/30 border-2 border-primary/50 text-foreground text-2xl font-bold flex items-center justify-center active:bg-primary/60 select-none touch-none ${className ?? ''}`}
      onTouchStart={(e) => { e.preventDefault(); touchStart(dir); }}
      onTouchEnd={(e) => { e.preventDefault(); touchEnd(dir); }}
      onMouseDown={() => touchStart(dir)}
      onMouseUp={() => touchEnd(dir)}
      onMouseLeave={() => touchEnd(dir)}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-2 gap-3">
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        className="rounded-2xl border-2 border-border shadow-2xl max-w-full"
        style={{ imageRendering: 'auto' }}
      />
      {isMobile && (
        <div className="flex items-center gap-8 pb-2">
          {/* Left side: Up/Down */}
          <div className="flex flex-col items-center gap-1">
            <DPadButton label="▲" dir="up" />
            <DPadButton label="▼" dir="down" />
          </div>
          {/* Right side: Left/Right */}
          <div className="flex items-center gap-1">
            <DPadButton label="◀" dir="left" />
            <DPadButton label="▶" dir="right" />
          </div>
          {/* Pause button */}
          <button
            className="w-12 h-12 rounded-xl bg-muted border-2 border-border text-muted-foreground text-lg font-bold flex items-center justify-center active:bg-accent select-none touch-none"
            onTouchStart={(e) => { e.preventDefault(); onPause(); }}
            onClick={onPause}
          >
            ⏸
          </button>
        </div>
      )}
    </div>
  );
}

function drawBgDecorations(ctx: CanvasRenderingContext2D, distance: number, bg: Background) {
  const offset = (distance * 0.3) % 300;
  ctx.globalAlpha = 0.3;
  
  switch (bg) {
    case 'desert':
      for (let i = 0; i < 5; i++) {
        const x = (i % 2 === 0) ? 40 + i * 20 : CW - 60 - i * 15;
        const y = (i * 150 + offset) % (CH + 50) - 25;
        // Cactus
        ctx.fillStyle = '#2d5a1e';
        ctx.fillRect(x - 4, y, 8, 30);
        ctx.fillRect(x - 12, y + 8, 8, 4);
        ctx.fillRect(x + 4, y + 14, 8, 4);
      }
      break;
    case 'jungle':
      for (let i = 0; i < 6; i++) {
        const x = (i % 2 === 0) ? 20 + i * 18 : CW - 40 - i * 12;
        const y = (i * 120 + offset) % (CH + 40) - 20;
        ctx.fillStyle = '#1a6b2a';
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'sky':
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) {
        const x = (i * 200 + offset * 0.5) % (CW + 100) - 50;
        const y = 80 + i * 120;
        ctx.beginPath();
        ctx.arc(x, y, 25, 0, Math.PI * 2);
        ctx.arc(x + 20, y - 5, 20, 0, Math.PI * 2);
        ctx.arc(x + 40, y, 22, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'park':
      for (let i = 0; i < 5; i++) {
        const x = (i % 2 === 0) ? 50 + i * 15 : CW - 70 - i * 10;
        const y = (i * 140 + offset) % (CH + 60) - 30;
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(x - 3, y, 6, 25);
        ctx.fillStyle = '#2d8a2e';
        ctx.beginPath();
        ctx.arc(x, y - 5, 18, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'underwater':
      ctx.fillStyle = '#4fc3f7';
      for (let i = 0; i < 8; i++) {
        const x = 30 + (i * 110) % CW;
        const y = (i * 90 + offset * 1.5) % (CH + 40) - 20;
        ctx.beginPath();
        ctx.arc(x, y, 5 + (i % 3) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }
  ctx.globalAlpha = 1;
}
