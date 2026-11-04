import { useEffect, useRef } from 'react';

/**
 * Procedural HTML5 Canvas Fire & Ember Simulation
 * Real burning fire effect with particle physics, fluid tongues of flame,
 * rising ember sparks, and luminous additive blending without any icons or emojis.
 */
export default function FireCanvas({
  height = 140,
  intensity = 1.0, // 0.5 (calm) to 1.5 (blazing)
  className = '',
  showEmbers = true,
}) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.offsetWidth);
    let h = (canvas.height = height);

    // Particle pools
    const flameCount = Math.floor(65 * intensity);
    const emberCount = showEmbers ? Math.floor(45 * intensity) : 0;

    const flames = [];
    const embers = [];

    // Helper: spawn a flame particle
    const createFlame = (initial = false) => {
      const spreadX = Math.random() * width;
      const size = (Math.random() * 26 + 18) * intensity;
      const maxLife = Math.random() * 45 + 35;
      const life = initial ? Math.random() * maxLife : 0;
      return {
        x: spreadX,
        y: h - (initial ? (life / maxLife) * (h * 0.7) : Math.random() * 8),
        vx: (Math.random() - 0.5) * 0.9,
        vy: -(Math.random() * 2.2 + 1.8) * intensity,
        size,
        currentSize: size,
        life,
        maxLife,
        swaySpeed: Math.random() * 0.08 + 0.04,
        swayOffset: Math.random() * Math.PI * 2,
      };
    };

    // Helper: spawn an ember (spark)
    const createEmber = (initial = false) => {
      const maxLife = Math.random() * 90 + 50;
      const life = initial ? Math.random() * maxLife : 0;
      return {
        x: Math.random() * width,
        y: h - (initial ? (life / maxLife) * h : Math.random() * 12),
        vx: (Math.random() - 0.5) * 1.4,
        vy: -(Math.random() * 2.8 + 2.0) * intensity,
        size: Math.random() * 2.2 + 1.0,
        life,
        maxLife,
        seed: Math.random() * 100,
        color:
          Math.random() > 0.4
            ? 'rgba(255, 215, 0, ' // Gold
            : Math.random() > 0.5
            ? 'rgba(255, 120, 20, ' // Bright orange
            : 'rgba(255, 60, 20, ', // Fiery red
      };
    };

    // Initialize pools
    for (let i = 0; i < flameCount; i++) flames.push(createFlame(true));
    for (let i = 0; i < emberCount; i++) embers.push(createEmber(true));

    let isVisible = true;
    const handleVisibility = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      h = canvas.height = height;
    };
    window.addEventListener('resize', handleResize);

    let time = 0;

    const render = () => {
      if (!isVisible) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      time += 0.03;
      ctx.clearRect(0, 0, width, h);

      // --- 1. Base Ambient Glow ---
      const baseGrad = ctx.createLinearGradient(0, h, 0, h - 45);
      baseGrad.addColorStop(0, `rgba(255, 80, 0, ${0.35 * intensity})`);
      baseGrad.addColorStop(0.5, `rgba(255, 30, 0, ${0.15 * intensity})`);
      baseGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, h - 45, width, 45);

      // --- 2. Render Flames (Lighter Composite) ---
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < flames.length; i++) {
        const p = flames[i];
        p.life++;

        if (p.life >= p.maxLife) {
          flames[i] = createFlame(false);
          continue;
        }

        const progress = p.life / p.maxLife; // 0 to 1
        const alpha = Math.sin(progress * Math.PI) * (1 - progress * 0.4);

        // Movement with natural flame swaying
        p.x += p.vx + Math.sin(time + p.swayOffset) * 0.6;
        p.y += p.vy;
        p.currentSize = p.size * (1 - progress * 0.75);

        if (p.currentSize <= 0.5) continue;

        // Radial fire gradient: White -> Yellow -> Vivid Orange -> Deep Crimson -> Fade
        const grad = ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          p.currentSize,
        );

        const r1 = Math.min(1, alpha * 0.95);
        const r2 = Math.min(1, alpha * 0.85);
        const r3 = Math.min(1, alpha * 0.55);
        const r4 = Math.min(1, alpha * 0.2);

        grad.addColorStop(0, `rgba(255, 255, 225, ${r1})`);
        grad.addColorStop(0.2, `rgba(255, 205, 10, ${r2})`);
        grad.addColorStop(0.55, `rgba(255, 80, 0, ${r3})`);
        grad.addColorStop(0.85, `rgba(220, 20, 0, ${r4})`);
        grad.addColorStop(1, 'rgba(30, 0, 0, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.currentSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- 3. Render Embers / Flying Sparks ---
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.life++;

        if (e.life >= e.maxLife || e.y < -10) {
          embers[i] = createEmber(false);
          continue;
        }

        const progress = e.life / e.maxLife;
        const alpha = (1 - progress) * (0.6 + Math.sin(time * 8 + e.seed) * 0.35);

        e.x += e.vx + Math.sin(e.y * 0.04 + e.seed) * 1.1;
        e.y += e.vy;

        ctx.fillStyle = `${e.color}${Math.max(0, Math.min(1, alpha))})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * (1 - progress * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('resize', handleResize);
    };
  }, [height, intensity, showEmbers]);

  return (
    <canvas
      ref={canvasRef}
      className={`fire-canvas ${className}`}
      style={{
        display: 'block',
        width: '100%',
        height: `${height}px`,
        pointerEvents: 'none',
      }}
    />
  );
}

