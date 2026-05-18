import { useMemo, type CSSProperties } from "react";

// One burst = a fan of small hearts that float up from the bottom of the
// slide and fade out off-screen. Each particle's trajectory is randomized
// at mount-time and frozen for the burst's lifetime (useMemo) so React
// doesn't restart the CSS animation on parent re-renders.
//
// Lifetime: parent (ActionStack) removes the burst from state ~2.6s after
// spawn; the CSS animation completes a hair earlier so particles fade to
// 0 before unmount avoids a visible pop.
interface HeartBurstProps {
    seed?: number;
    count?: number;
}

interface Particle {
    id: number;
    xStart: number; // vw, starting horizontal position within layer
    xEnd: number; // px, horizontal drift to apply over the rise
    rise: number; // vh, vertical travel distance
    duration: number; // ms
    delay: number; // ms
    scaleStart: number;
    scaleEnd: number;
    rotStart: number;
    rotEnd: number;
    size: number; // px
}

function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function buildParticles(count: number): Particle[] {
    return Array.from({ length: count }, (_, i) => ({
        id: i,
        xStart: rand(15, 85),
        xEnd: rand(-80, 80),
        rise: rand(85, 115),
        duration: rand(1800, 2400),
        delay: rand(0, 280),
        scaleStart: rand(0.45, 0.75),
        scaleEnd: rand(0.85, 1.25),
        rotStart: rand(-25, 25),
        rotEnd: rand(-45, 45),
        size: rand(18, 32),
    }));
}

const HEART_PATH =
    "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

export function HeartBurst({ count = 14 }: HeartBurstProps) {
    const particles = useMemo(() => buildParticles(count), [count]);

    return (
        <>
            {particles.map((p) => {
                const style: CSSProperties = {
                    left: `${p.xStart}vw`,
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    // CSS variables consumed by @keyframes binge-heart-rise
                    ["--binge-burst-x-end" as string]: `${p.xEnd}px`,
                    ["--binge-burst-rise" as string]: `${p.rise}vh`,
                    ["--binge-burst-duration" as string]: `${p.duration}ms`,
                    ["--binge-burst-delay" as string]: `${p.delay}ms`,
                    ["--binge-burst-scale-start" as string]: `${p.scaleStart}`,
                    ["--binge-burst-scale-end" as string]: `${p.scaleEnd}`,
                    ["--binge-burst-rot-start" as string]: `${p.rotStart}deg`,
                    ["--binge-burst-rot-end" as string]: `${p.rotEnd}deg`,
                };
                return (
                    <span
                        key={p.id}
                        className="binge-heart-particle"
                        style={style}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            width="100%"
                            height="100%"
                            fill="currentColor"
                            aria-hidden="true"
                        >
                            <path d={HEART_PATH} />
                        </svg>
                    </span>
                );
            })}
        </>
    );
}
