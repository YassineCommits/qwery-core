import React from 'react';

export function ConnectionLines() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: 0;
          }
        }
        
        .animate-dash {
          animation: dash 2s linear infinite;
        }
        
        .animate-dash-slow {
          animation: dash 4s linear infinite;
        }
        
        .animate-dash-reverse {
          animation: dash 3s linear infinite reverse;
        }
      `}</style>

      <svg
        className="h-full w-full opacity-0 transition-opacity duration-700 group-hover:opacity-100"
        preserveAspectRatio="none"
        viewBox="0 0 400 200"
      >
        <defs>
          <linearGradient id="grid-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(251, 191, 36, 0)" />
            <stop offset="50%" stopColor="rgba(251, 191, 36, 0.3)" />
            <stop offset="100%" stopColor="rgba(251, 191, 36, 0)" />
          </linearGradient>

          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 
          Circuit Paths 
          M = Move to
          L = Line to
          The design uses orthogonal lines (90 degree turns) to mimic a PCB/Grid layout.
          Updates: Thinner strokes (1px), Round Linecaps for fluidity.
        */}

        {/* Path 1: Top Left to Center */}
        <path
          d="M -10 40 L 80 40 L 80 90 L 150 90"
          fill="none"
          stroke="rgba(251, 191, 36, 0.6)"
          strokeWidth="1"
          strokeLinecap="round"
          filter="url(#glow)"
          strokeDasharray="60 300"
          strokeDashoffset="360"
          className="animate-dash"
        />

        {/* Path 2: Bottom Left rising up */}
        <path
          d="M 20 210 L 20 140 L 100 140 L 100 110"
          fill="none"
          stroke="rgba(251, 191, 36, 0.5)"
          strokeWidth="1"
          strokeLinecap="round"
          filter="url(#glow)"
          strokeDasharray="50 300"
          strokeDashoffset="350"
          className="animate-dash-slow"
        />

        {/* Path 3: Top Right traversing left */}
        <path
          d="M 410 30 L 320 30 L 320 80 L 240 80"
          fill="none"
          stroke="rgba(251, 191, 36, 0.5)"
          strokeWidth="1"
          strokeLinecap="round"
          filter="url(#glow)"
          strokeDasharray="70 350"
          strokeDashoffset="420"
          className="animate-dash-reverse"
        />

        {/* Path 4: Bottom Right grid */}
        <path
          d="M 410 170 L 350 170 L 350 120 L 280 120"
          fill="none"
          stroke="rgba(251, 191, 36, 0.6)"
          strokeWidth="1"
          strokeLinecap="round"
          filter="url(#glow)"
          strokeDasharray="40 250"
          strokeDashoffset="290"
          className="animate-dash"
          style={{ animationDelay: '0.5s' }}
        />

        {/* Static faint grid lines to create the 'structure' */}
        <g stroke="rgba(255,255,255,0.02)" strokeWidth="0.5">
          <path d="M 80 0 L 80 200" />
          <path d="M 320 0 L 320 200" />
          <path d="M 0 90 L 400 90" />
          <path d="M 0 140 L 400 140" />
          <path d="M 350 120 L 400 120" />
          <path d="M 20 140 L 20 200" />
        </g>
      </svg>

      {/* Background Gradient Mesh */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-10"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(251, 191, 36, 0.15) 0%, transparent 60%)
          `,
        }}
      />
    </div>
  );
}
