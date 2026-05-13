import React from 'react';

export function MemoLabIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" className={className}>
      <mask id="flask-mask">
        <rect width="100" height="100" fill="white" />
        <text 
          x="50" 
          y="93" 
          fontFamily="system-ui, sans-serif" 
          fontWeight="900" 
          fontSize="52" 
          textAnchor="middle" 
          letterSpacing="-1" 
          fill="black"
        >
          m
        </text>
      </mask>
      <g mask="url(#flask-mask)">
        <rect x="32" y="4" width="36" height="8" rx="4" />
        <rect x="38" y="12" width="24" height="22" />
        <path d="M 38 34 L 62 34 L 92 84 C 95 89 92 96 86 96 L 14 96 C 8 96 5 89 8 84 Z" />
      </g>
    </svg>
  );
}