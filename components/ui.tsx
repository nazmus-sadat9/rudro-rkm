import { useState, type ReactNode } from "react";

/** Join class names, skipping falsy values. Typed alternative to ad-hoc string concat. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ShellProps = Readonly<{ children: ReactNode }>;

export function Shell({ children }: ShellProps): React.JSX.Element {
  return <div className="ob-shell">{children}</div>;
}

type BrandProps = Readonly<{ tag: string; href?: string }>;

export function Brand({ tag, href = "/claim" }: BrandProps): React.JSX.Element {
  return (
    <a href={href} className="ob-brand" aria-label="Oblyx home">
      <span aria-hidden="true" className="ob-orb">
        O
      </span>
      <span className="ob-wordmark">Oblyx</span>
      <small className="ob-tag">{tag}</small>
    </a>
  );
}

type LiveBadgeProps = Readonly<{ tone?: "ok" | "warn"; children: ReactNode }>;

export function LiveBadge({ tone = "ok", children }: LiveBadgeProps): React.JSX.Element {
  return (
    <span className={cn("ob-badge", tone === "ok" ? "ob-badge--ok" : "ob-badge--warn")}>
      <i aria-hidden="true" className="ob-dot" />
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
    <header className="ob-header">
      <div className="ob-header-row">
        <div className="ob-header-brand">
          <Brand tag={tag} />
        </div>
        {/* Desktop nav */}
        <nav className="ob-nav-desktop" aria-label="Primary">
          {links.map((l) => (
            <a key={l.href + l.label} href={l.href} className="ob-nav-link">
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
          className="ob-menu-btn"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>
      {/* Mobile dropdown */}
      {open && (
        <nav className="ob-nav-mobile" aria-label="Mobile">
          {links.map((l) => (
            <a
              key={l.href + l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="ob-nav-mobile-link"
            >
              {l.label}
            </a>
          ))}
          <div>
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
      className={cn("ob-toast", message !== "" && "ob-toast--show")}
    >
      {message}
    </div>
  );
}

type FieldLabelProps = Readonly<{ htmlFor?: string; children: ReactNode }>;

export function FieldLabel({ htmlFor, children }: FieldLabelProps): React.JSX.Element {
  return (
    <label htmlFor={htmlFor} className="ob-label">
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
      className="ob-input"
    />
  );
}

type MessageProps = Readonly<{ tone: "" | "error" | "success"; text: string }>;

export function FormMessage({ tone, text }: MessageProps): React.JSX.Element {
  return (
    <p
      role="status"
      className={cn(
        "ob-msg",
        tone === "error" && "ob-msg--error",
        tone === "success" && "ob-msg--success"
      )}
    >
      {text}
    </p>
  );
}
