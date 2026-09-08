import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════
   CyberCommand primitives — Double-Bezel architecture + motion
   ═══════════════════════════════════════════════════════════════ */

/* ── Reveal: IntersectionObserver entry choreography ──
   Never scroll-listener based. Fades up + de-blurs on enter. */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
  style,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: any;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn('reveal', className)}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </Tag>
  );
}

/* ── Eyebrow: microscopic pill badge preceding headings ── */
export function Eyebrow({
  children,
  className,
  dot,
}: {
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span className={cn('eyebrow', className)}>
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] shadow-[0_0_8px_rgba(139,92,246,0.9)]" />
      )}
      {children}
    </span>
  );
}

/* ── GlassCard: Double-Bezel nested enclosure ──
   Outer shell (bezel) → inner core (bezel-inner) */
export function GlassCard({
  children,
  className,
  innerClassName,
  hover,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  hover?: boolean;
}) {
  return (
    <div className={cn('bezel', className)}>
      <div className={cn('bezel-inner', hover && 'surface-hover', innerClassName)}>
        {children}
      </div>
    </div>
  );
}

/* ── PillButton: nested button-in-button with trailing island ──
   Use with an arrow / icon island to get magnetic hover physics. */
export function PillButton({
  children,
  icon,
  href,
  onClick,
  type,
  variant = 'primary',
  disabled,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  href?: string;
  onClick?: (e?: any) => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'ghost' | 'danger' | 'soft';
  disabled?: boolean;
  className?: string;
}) {
  const base = cn(
    'btn-island px-6 py-3 text-sm',
    variant === 'primary' &&
      'bg-[#8b5cf6] text-white shadow-[0_10px_30px_-12px_rgba(139,92,246,0.7),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-[#7c3aed]',
    variant === 'ghost' &&
      'bg-white/[0.04] text-foreground border border-white/10 hover:bg-white/[0.08]',
    variant === 'danger' &&
      'bg-[#ef4444] text-white shadow-[0_10px_30px_-14px_rgba(239,68,68,0.7),inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-[#dc2626]',
    variant === 'soft' &&
      'bg-[#8b5cf6]/10 text-[#a78bfa] border border-[#8b5cf6]/30 hover:bg-[#8b5cf6]/20',
    disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
    className
  );

  const island = icon && (
    <span
      className={cn(
        'island w-8 h-8 rounded-full',
        variant === 'primary' && 'bg-black/20 text-white',
        variant === 'danger' && 'bg-black/20 text-white',
        variant === 'soft' && 'bg-[#8b5cf6]/20 text-[#c4b5fd]',
        variant === 'ghost' && 'bg-white/10 text-foreground'
      )}
    >
      {icon}
    </span>
  );

  const inner = (
    <>
      <span>{children}</span>
      {island}
    </>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={base}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled} className={base}>
      {inner}
    </button>
  );
}

/* ── StatCard: asymmetric bento stat tile ── */
export function StatTile({
  label,
  value,
  icon,
  tone = 'default',
  sub,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: 'default' | 'accent' | 'warn' | 'danger' | 'cyan';
  sub?: string;
}) {
  const tones: Record<string, string> = {
    default: 'text-[#e6e6f0]',
    accent: 'text-[#a78bfa]',
    warn: 'text-[#fbbf24]',
    danger: 'text-[#f87171]',
    cyan: 'text-[#22d3ee]',
  };
  const iconTones: Record<string, string> = {
    default: 'text-[#8b8b9e] bg-white/[0.04] border-white/10',
    accent: 'text-[#a78bfa] bg-[#8b5cf6]/12 border-[#8b5cf6]/30',
    warn: 'text-[#fbbf24] bg-[#f59e0b]/12 border-[#f59e0b]/30',
    danger: 'text-[#f87171] bg-[#ef4444]/12 border-[#ef4444]/30',
    cyan: 'text-[#22d3ee] bg-[#06b6d4]/12 border-[#06b6d4]/30',
  };
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          'w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0',
          iconTones[tone]
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className={cn('text-3xl font-semibold tracking-tight leading-none', tones[tone])}>
          {value}
        </div>
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground mt-1.5">
          {label}
        </div>
        {sub && <div className="text-xs text-muted-foreground/70 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

/* ── PageHeader: consistent head block across screens ── */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8">
      <div>
        {eyebrow && <Eyebrow dot className="mb-4">{eyebrow}</Eyebrow>}
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-2 max-w-xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}
