'use client';

import { useEffect, useState } from 'react';

interface MetricCardProps {
  title: string;
  value: number;
  suffix?: string;
  variant: 'purple' | 'green' | 'yellow' | 'red';
  icon: React.ReactNode;
}

export default function MetricCard({ title, value, suffix = '', variant, icon }: MetricCardProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    // Animate counter
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplayValue(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className={`glass-card p-6 metric-gradient-${variant} animate-fade-in`}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-none flex items-center justify-center"
          style={{
            background: variant === 'purple' ? 'rgba(139, 92, 246, 0.15)' :
                         variant === 'green' ? 'rgba(16, 185, 129, 0.15)' :
                         variant === 'yellow' ? 'rgba(245, 158, 11, 0.15)' :
                         'rgba(239, 68, 68, 0.15)',
            color: variant === 'purple' ? 'var(--color-accent-purple)' :
                   variant === 'green' ? 'var(--color-success)' :
                   variant === 'yellow' ? 'var(--color-warning)' :
                   'var(--color-error)',
          }}
        >
          {icon}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          {title}
        </p>
        <p className="text-3xl font-bold animate-count" style={{ color: 'var(--color-text-primary)' }}>
          {displayValue}{suffix}
        </p>
      </div>
    </div>
  );
}
