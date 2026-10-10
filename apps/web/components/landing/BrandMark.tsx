interface BrandMarkProps {
  size: number;
  gradientId: string;
  className?: string;
}

export function BrandMark({
  size,
  gradientId,
  className,
}: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="2"
          y1="2"
          x2="22"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF9A62" />
          <stop offset="1" stopColor="#FF5B2E" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.6 21 6.8v10.4l-9 5.2-9-5.2V6.8l9-5.2Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M12 6.1 17.1 9v6L12 17.9 6.9 15V9L12 6.1Z"
        stroke="rgba(255,255,255,0.42)"
        strokeWidth="1.2"
      />
    </svg>
  );
}
