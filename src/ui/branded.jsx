import React from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function BrandedCard({ className = "", children, ...rest }) {
  return (
    <div
      className={cx(
        "bg-[var(--surface)] rounded-3xl border border-[var(--border)] shadow-sm overflow-hidden",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function BrandedCardHeader({ className = "", children, ...rest }) {
  return (
    <div
      className={cx(
        "p-6 border-b border-[var(--line)] flex items-center justify-between",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function BrandedButton({
  variant = "primary",
  className = "",
  disabled,
  children,
  ...rest
}) {
  const base =
    "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl text-xs font-black transition-colors disabled:opacity-60";

  const variants = {
    primary:
      "bg-[rgba(63,209,255,.14)] border border-[rgba(63,209,255,.32)] text-[var(--text)] hover:bg-[rgba(63,209,255,.20)]",
    solid:
      "bg-[var(--primary)] text-[#071018] hover:bg-[var(--primaryHover)] border border-transparent",
    ghost:
      "bg-[rgba(255,255,255,.04)] border border-[var(--border)] text-[var(--text)] hover:bg-[rgba(255,255,255,.07)]",
    danger:
      "bg-[rgba(255,107,107,.14)] border border-[rgba(255,107,107,.30)] text-[var(--text)] hover:bg-[rgba(255,107,107,.20)]",
  };

  return (
    <button
      className={cx(base, variants[variant] || variants.primary, className)}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

const inputBase =
  "w-full px-4 py-3 rounded-2xl outline-none bg-[rgba(255,255,255,.04)] border border-[rgba(255,255,255,.12)] text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--focusRing)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]";

export function BrandedInput({ className = "", ...rest }) {
  return <input className={cx(inputBase, className)} {...rest} />;
}

export function BrandedTextarea({ className = "", ...rest }) {
  return <textarea className={cx(inputBase, "resize-none", className)} {...rest} />;
}

export function BrandedSelect({ className = "", ...rest }) {
  return <select className={cx(inputBase, className)} {...rest} />;
}
