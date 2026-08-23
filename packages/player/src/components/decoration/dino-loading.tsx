import React, { useEffect, useRef } from 'react';

// Svg Shapes with `fill-rule="evenodd"` to dynamically punch out the transparent eye
const DINO_STAND = "M44 0h44v14H82v6h6v12H76v2h12v12H76v14H64v6H52v28H40V66H28v28H16V66H4V38h12V24h12V12h16z M48 12h8v8h-8z";
const DINO_RUN_1 = "M44 0h44v14H82v6h6v12H76v2h12v12H76v14H64v6H52v28H40V66H28v14H16V66H4V38h12V24h12V12h16z M48 12h8v8h-8z";
const DINO_RUN_2 = "M44 0h44v14H82v6h6v12H76v2h12v12H76v14H64v6H52v14H40V66H28v28H16V66H4V38h12V24h12V12h16z M48 12h8v8h-8z";
const CACTUS_SHAPE = "M6 0h8v40H6z M0 10h6v4H0z M14 15h6v4h-6z M4 5h4v10H4z M12 10h4v10h-4z";
const CLOUD_SHAPE = "M10 4h10V2H10v2zm10-2h10V0H20v2zm10 0h10v2H30V2zM6 6h4V4H6v2zM2 8h4V6H2v2zM0 10h2V8H0v2zM0 13h46v-3H0v3z";

type GameObject = {
  element: HTMLDivElement;
  x: number;
  width: number;
  speed?: number;
};

interface DinoLoadingProps {
  className?: string;
}

export const DinoLoading: React.FC<DinoLoadingProps> = ({ className = "w-full max-w-[600px] h-[200px]" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dinoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const dino = dinoRef.current;
    if (!container || !dino) return;

    let isJumping = false;
    let gameSpeed = 4;

    // Physics
    let dinoY = 0;
    let velocityY = 0;
    const gravity = 0.6;
    const jumpStrength = 10;
    const floorY = 0;

    // Entity trackers
    const obstacles: GameObject[] = [];
    const clouds: GameObject[] = [];
    const bumps: GameObject[] = [];

    let animationFrameId: number;
    let obstacleTimer: ReturnType<typeof setTimeout>;
    let cloudTimer: ReturnType<typeof setTimeout>;
    let bumpTimer: ReturnType<typeof setTimeout>;

    // Start dino running natively
    dino.classList.add('running');

    function createObstacle() {
      if (!container) return;
      const cw = container.clientWidth;
      
      const obstacle = document.createElement('div');
      obstacle.className = 'absolute bottom-0 text-muted-foreground';
      const scale = 0.8 + Math.random() * 0.4;
      obstacle.style.transform = `scale(${scale})`;
      obstacle.style.transformOrigin = 'bottom';
      obstacle.style.left = `${cw}px`;
      
      obstacle.innerHTML = `<svg width="20" height="40" viewBox="0 0 20 40" class="fill-current"><path d="${CACTUS_SHAPE}"/></svg>`;
      container.appendChild(obstacle);

      obstacles.push({ element: obstacle, x: cw, width: 20 * scale });

      const nextTime = 1000 + Math.random() * 2000;
      obstacleTimer = setTimeout(createObstacle, nextTime);
    }

    function createCloud() {
      if (!container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      
      const cloud = document.createElement('div');
      cloud.className = 'absolute text-muted-foreground opacity-40';
      
      // Randomize height heavily to prevent visual stacking
      const top = 10 + Math.random() * (ch * 0.5); 
      cloud.style.top = `${top}px`;
      cloud.style.left = `${cw}px`;
      
      cloud.innerHTML = `<svg width="46" height="13" viewBox="0 0 46 13" class="fill-current"><path d="${CLOUD_SHAPE}"/></svg>`;
      container.appendChild(cloud);

      clouds.push({
        element: cloud,
        x: cw,
        width: 46,
        // Give clouds variable parallax speeds so they don't lock together
        speed: gameSpeed * 0.2 + (Math.random() * 0.5), 
      });

      const nextTime = 2000 + Math.random() * 3000;
      cloudTimer = setTimeout(createCloud, nextTime);
    }

    function createGroundBump() {
      if (!container) return;
      const cw = container.clientWidth;
      
      const bump = document.createElement('div');
      bump.className = 'absolute bottom-[-2px] bg-muted-foreground rounded-full';
      bump.style.width = `${4 + Math.random() * 10}px`;
      bump.style.height = '2px';
      bump.style.left = `${cw}px`;
      
      container.appendChild(bump);

      bumps.push({ element: bump, x: cw, width: 10 });

      const nextTime = 200 + Math.random() * 800;
      bumpTimer = setTimeout(createGroundBump, nextTime);
    }

    function jump() {
      if (isJumping) return;
      isJumping = true;
      dino?.classList.remove('running');
      dino?.classList.add('jump');
      velocityY = jumpStrength;
    }

    function checkAutoJump() {
      if (obstacles.length === 0) return;

      const dinoLeftEdge = 50;
      const dinoWidth = 44;
      const dinoRightEdge = dinoLeftEdge + dinoWidth;

      let closestObstacle: GameObject | null = null;

      for (const obs of obstacles) {
        if (obs.x + obs.width > dinoLeftEdge) {
          if (!closestObstacle || obs.x < closestObstacle.x) {
            closestObstacle = obs;
          }
        }
      }

      if (closestObstacle) {
        const distanceToObstacle = closestObstacle.x - dinoRightEdge;
        const framesToPeak = jumpStrength / gravity;
        const jumpThreshold = framesToPeak * gameSpeed * 0.65;

        if (distanceToObstacle < jumpThreshold && !isJumping) {
          jump();
        }
      }
    }

    function update() {
      // Dino Physics
      if (isJumping && dino) {
        dinoY += velocityY;
        velocityY -= gravity;

        if (dinoY <= floorY) {
          dinoY = floorY;
          isJumping = false;
          velocityY = 0;
          dino.classList.remove('jump');
          dino.classList.add('running');
        }
        dino.style.bottom = `${dinoY}px`;
      }

      // Move entities
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.x -= gameSpeed;
        obs.element.style.left = `${obs.x}px`;
        if (obs.x < -50) {
          obs.element.remove();
          obstacles.splice(i, 1);
        }
      }

      for (let i = clouds.length - 1; i >= 0; i--) {
        const cloud = clouds[i];
        cloud.x -= cloud.speed || 1;
        cloud.element.style.left = `${cloud.x}px`;
        if (cloud.x < -60) {
          cloud.element.remove();
          clouds.splice(i, 1);
        }
      }

      for (let i = bumps.length - 1; i >= 0; i--) {
        const bump = bumps[i];
        bump.x -= gameSpeed;
        bump.element.style.left = `${bump.x}px`;
        if (bump.x < -20) {
          bump.element.remove();
          bumps.splice(i, 1);
        }
      }

      checkAutoJump();

      if (gameSpeed < 8) gameSpeed += 0.001;

      animationFrameId = requestAnimationFrame(update);
    }

    // Staggered Init to prevent bunching
    obstacleTimer = setTimeout(createObstacle, 1000);
    cloudTimer = setTimeout(createCloud, 400);
    bumpTimer = setTimeout(createGroundBump, 100);
    update();

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(obstacleTimer);
      clearTimeout(cloudTimer);
      clearTimeout(bumpTimer);
      
      obstacles.forEach((obs) => obs.element.remove());
      clouds.forEach((cloud) => cloud.element.remove());
      bumps.forEach((bump) => bump.element.remove());
    };
  }, []);

  return (
    <div className={`flex flex-col justify-center items-center overflow-hidden font-press-start ${className}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        .font-press-start { font-family: 'Press Start 2P', monospace; }
        
        /* CSS-Only Run Animation Logic */
        .dino-stand, .dino-run-1, .dino-run-2 { display: none; }
        
        /* State: Jumping / Standing */
        .dino.jump .dino-stand, 
        .dino:not(.running):not(.jump) .dino-stand { display: block; }
        
        /* State: Running Keyframes */
        @keyframes runState1 { 0%, 49.99% { display: block; opacity: 1; } 50%, 100% { display: none; opacity: 0; } }
        @keyframes runState2 { 0%, 49.99% { display: none; opacity: 0; } 50%, 100% { display: block; opacity: 1; } }
        
        .dino.running .dino-run-1 { display: block; animation: runState1 0.3s infinite; }
        .dino.running .dino-run-2 { display: block; animation: runState2 0.3s infinite; }

        .loading-dots::after {
          content: '';
          animation: dots 1.5s steps(4, end) infinite;
        }
        @keyframes blink-custom { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes dots { 0%, 20% { content: ''; } 40% { content: '.'; } 60% { content: '..'; } 80%, 100% { content: '...'; } }
      `}</style>

      {/* Game Window - Fills the parent className layout constraints */}
      <div
        ref={containerRef}
        className="relative w-full flex-1 min-h-[120px] border-b-2 border-muted-foreground overflow-hidden"
      >
        {/* The Dino Character Box */}
        <div ref={dinoRef} className="dino absolute bottom-0 left-[50px] w-[44px] h-[47px] text-muted-foreground">
          {/* SVG states baked in so we can toggle them cheaply using CSS class on the wrapper */}
          <svg className="dino-stand fill-current" viewBox="0 0 88 94"><path fillRule="evenodd" clipRule="evenodd" d={DINO_STAND}/></svg>
          <svg className="dino-run-1 fill-current" viewBox="0 0 88 94"><path fillRule="evenodd" clipRule="evenodd" d={DINO_RUN_1}/></svg>
          <svg className="dino-run-2 fill-current" viewBox="0 0 88 94"><path fillRule="evenodd" clipRule="evenodd" d={DINO_RUN_2}/></svg>
        </div>
      </div>

      <div
        className="mt-6 text-sm tracking-widest text-foreground"
        style={{ animation: 'blink-custom 1.5s infinite' }}
      >
        LOADING<span className="loading-dots"></span>
      </div>
    </div>
  );
};

