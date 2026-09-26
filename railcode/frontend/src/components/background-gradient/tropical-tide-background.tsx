"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface TropicalTideBackgroundProps {
  className?: string;
  children?: React.ReactNode;
}

export function TropicalTideBackground({ className, children }: TropicalTideBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    // Soft tropical palette
    const colors = [
      { r: 255, g: 183, b: 171 }, // coral
      { r: 255, g: 212, b: 183 }, // peach
      { r: 143, g: 222, b: 239 }, // seafoam
      { r: 107, g: 195, b: 231 }, // ocean blue
      { r: 82, g: 160, b: 210 }, // deep teal
    ];

    interface ColorBlob {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      color: { r: number; g: number; b: number };
    }

    const blobs: ColorBlob[] = colors.map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 200 + Math.random() * 300,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    function draw(time: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      // Base gradient
      const base = ctx.createLinearGradient(0, 0, 0, h);
      base.addColorStop(0, "#fef6ee");
      base.addColorStop(0.5, "#e8f8fc");
      base.addColorStop(1, "#d4f0f7");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      // Animated blobs
      for (const blob of blobs) {
        blob.x += blob.vx;
        blob.y += blob.vy;

        if (blob.x < -blob.r) blob.x = w + blob.r;
        if (blob.x > w + blob.r) blob.x = -blob.r;
        if (blob.y < -blob.r) blob.y = h + blob.r;
        if (blob.y > h + blob.r) blob.y = -blob.r;

        const gradient = ctx.createRadialGradient(
          blob.x, blob.y, 0,
          blob.x, blob.y, blob.r
        );
        const { r, g, b } = blob.color;
        gradient.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
        gradient.addColorStop(0.6, `rgba(${r},${g},${b},0.2)`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle warm glow overlay
      const glow = ctx.createRadialGradient(w * 0.7, h * 0.3, 0, w * 0.7, h * 0.3, w * 0.6);
      glow.addColorStop(0, "rgba(255, 220, 180, 0.15)");
      glow.addColorStop(1, "rgba(255, 220, 180, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className={cn("relative min-h-screen overflow-hidden", className)}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: "block" }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
