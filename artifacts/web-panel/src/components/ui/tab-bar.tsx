import { type ReactNode, useRef, type KeyboardEvent } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
}

interface TabBarProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  dangerIds?: string[];
  className?: string;
}

/**
 * Accessible horizontal tab list: role="tablist" / role="tab" with
 * aria-selected + arrow-key navigation. Pure UI — no layout concerns.
 */
export function TabBar({
  tabs,
  active,
  onChange,
  dangerIds = [],
  className = "",
}: TabBarProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`flex items-center gap-1.5 shrink-0 ${className}`}
    >
      {tabs.map((tab, i) => {
        const isActive = active === tab.id;
        const isDanger = dangerIds.includes(tab.id);
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              isActive
                ? isDanger
                  ? "text-destructive"
                  : "text-accent"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            }`}
          >
            {isActive && (
              <span
                className={`tab-underline ${
                  isDanger
                    ? "!bg-none !bg-destructive !shadow-none"
                    : "bg-gradient-to-r from-accent to-[#0066FF]"
                }`}
              />
            )}
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Right-aligned close/control button slot for a tab panel wrapper. */
export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      className="h-full"
    >
      {children}
    </div>
  );
}
