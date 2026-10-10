import { useState, type ReactNode } from "react";

/** Join class names, skipping falsy values. Typed alternative to ad-hoc string concat. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ShellProps = Readonly<{ children: ReactNode }>;

export function Shell({ children }: ShellProps): React.JSX.Element {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1080px] flex-1 px-4 pb-16 sm:px-7 sm:pb-24">
      {children}
    </div>
  );
}

type BrandProps = Readonly<{ tag: string; href?: string }>;

export function Brand({ tag, href = "/claim" }: BrandProps): React.JSX.Element {
  return (
    <a href={href} className="flex min-w-0 items-center gap-2" aria-label="shhhhhcat home">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-brand-deep font-display text-base font-bold text-white"
      >
        S
      </span>
      <span className="hidden min-w-0 truncate font-display text-lg font-bold tracking-tight min-[400px]:inline">
        shhhhhcat
      </span>
      <small className="flex-none rounded-full border border-line bg-card px-2.5 py-1 font-mono text-[10px] tracking-[1.5px] text-mut">
        {tag}
      </small>
    </a>
  );
}

type LiveBadgeProps = Readonly<{ tone?: "ok" | "warn"; children: ReactNode }>;

export function LiveBadge({ tone = "ok", children }: LiveBadgeProps): React.JSX.Element {
  const ok = tone === "ok";
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 font-mono text-[11px]",
        ok
          ? "border-ok/35 bg-ok/10 text-ok"
          : "border-warn/35 bg-warn/10 text-warn"
      )}
    >
      <i
        aria-hidden="true"
        className={cn(
          "h-[7px] w-[7px] animate-pulse rounded-full",
          ok ? "bg-ok" : "bg-warn"
        )}
      />
      {children}
    </span>
  );
}

export interface NavLinkItem {
  href: string;
  label: string;
}

type SiteHeaderProps = Readonly<{
  tag: string;
  links: readonly NavLinkItem[];
  badge: ReactNode;
  badgeTone?: "ok" | "warn";
}>;

export function SiteHeader({ tag, links, badge, badgeTone = "ok" }: SiteHeaderProps): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <header className="sticky top-0 z-40 -mx-4 border-b border-line bg-base/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-none sm:px-0 sm:py-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Brand tag={tag} />
        </div>
        {/* Desktop nav */}
        <nav className="hidden min-w-0 flex-none items-center gap-2 md:flex" aria-label="Primary">
          {links.map((l) => (
            <a
              key={l.href + l.label}
              href={l.href}
              className="rounded-[9px] border border-transparent px-3 py-2 font-mono text-xs whitespace-nowrap text-mut transition hover:border-line hover:bg-card hover:text-ink"
            >
              {l.label}
            </a>
          ))}
          <LiveBadge tone={badgeTone}>{badge}</LiveBadge>
        </nav>
        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((v: boolean) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="grid h-11 w-11 flex-none place-items-center rounded-[10px] border border-line bg-card font-mono text-lg text-ink transition hover:border-brand md:hidden"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>
      {/* Mobile dropdown */}
      {open && (
        <nav className="grid min-w-0 gap-2 pt-3 md:hidden" aria-label="Mobile">
          {links.map((l) => (
            <a
              key={l.href + l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 min-w-0 items-center rounded-[10px] border border-line bg-card px-4 py-2.5 font-mono text-xs break-words text-ink transition hover:border-brand"
            >
              {l.label}
            </a>
          ))}
          <div className="flex min-w-0 justify-start">
            <LiveBadge tone={badgeTone}>{badge}</LiveBadge>
          </div>
        </nav>
      )}
    </header>
  );
}

type ToastProps = Readonly<{ message: string }>;

export function Toast({ message }: ToastProps): React.JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed bottom-5 left-1/2 z-60 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 translate-y-5 rounded-[10px] border border-line bg-card2 px-5 py-3 text-center font-mono text-xs text-ink opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.5)] transition-all duration-200",
        message !== "" && "translate-y-0 opacity-100"
      )}
    >
      {message}
    </div>
  );
}

type FieldLabelProps = Readonly<{ htmlFor?: string; children: ReactNode }>;

export function FieldLabel({ htmlFor, children }: FieldLabelProps): React.JSX.Element {
  return (
    <label
      htmlFor={htmlFor}
      className="mt-2 font-mono text-[10px] tracking-[1.4px] text-faint"
    >
      {children}
    </label>
  );
}

type TextInputProps = Readonly<{
  id: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}>;

export function TextInput({
  id,
  value,
  placeholder,
  onChange,
}: TextInputProps): React.JSX.Element {
  return (
    <input
      id={id}
      type="text"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      className="h-[50px] w-full min-w-0 rounded-[10px] border border-line bg-deep px-3.5 font-mono text-[13px] text-ink outline-none transition focus:border-brand focus:ring-[3px] focus:ring-brand/20"
    />
  );
}

type MessageProps = Readonly<{ tone: "" | "error" | "success"; text: string }>;

export function FormMessage({ tone, text }: MessageProps): React.JSX.Element {
  return (
    <p
      role="status"
      className={cn(
        "min-h-[22px] px-4 text-[12.5px] leading-relaxed break-words sm:px-[22px]",
        tone === "error" && "text-bad",
        tone === "success" && "text-ok",
        tone === "" && "text-mut"
      )}
    >
      {text}
    </p>
  );
}
