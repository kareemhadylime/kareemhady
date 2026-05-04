interface FmplusLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function FmplusLogo({ size = 'md', className = '' }: FmplusLogoProps) {
  const sizes = {
    sm: { fontSize: 18, plusSize: 22, height: 24 },
    md: { fontSize: 26, plusSize: 32, height: 34 },
    lg: { fontSize: 36, plusSize: 44, height: 46 },
    xl: { fontSize: 56, plusSize: 68, height: 72 },
  } as const;
  const s = sizes[size];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 110 ${s.height}`}
      height={s.height}
      className={className}
      role="img"
      aria-label="FM+"
    >
      {/* "FM" wordmark — navy in light, slate-100 in dark */}
      <text
        x="0"
        y={s.fontSize * 0.78}
        fontFamily="'Cormorant Garamond', Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize={s.fontSize}
        letterSpacing="0.04em"
        className="fill-[#1E2D4A] dark:fill-slate-100"
      >
        FM
      </text>
      {/* "+" mark — always gold (brand mark) */}
      <text
        x={s.fontSize * 1.5}
        y={s.fontSize * 0.78}
        fontFamily="'Cormorant Garamond', Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize={s.plusSize}
        className="fill-[#D4A93A]"
      >
        +
      </text>
    </svg>
  );
}
