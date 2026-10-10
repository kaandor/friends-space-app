import { Children, isValidElement, useState, type CSSProperties, type ReactNode } from "react";

type TooltipSide = "top" | "bottom" | "left" | "right";

function positionStyle(side: TooltipSide): CSSProperties {
  const base: CSSProperties = { position: "absolute", zIndex: 60, pointerEvents: "none", whiteSpace: "normal", textAlign: "left", maxWidth: 230 };
  switch (side) {
    case "top": return { ...base, bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" };
    case "bottom": return { ...base, top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" };
    case "left": return { ...base, right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" };
    case "right": return { ...base, left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" };
  }
}

function Tooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const parts = Children.toArray(children).filter(isValidElement);
  const trigger = parts.find((part) => (part as { type?: unknown }).type === TooltipTrigger);
  const content = parts.find((part) => (part as { type?: unknown }).type === TooltipContent);
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {trigger}
      {open && content}
    </span>
  );
}

function TooltipTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  if (asChild) return <>{children}</>;
  return <span>{children}</span>;
}

function TooltipContent({
  children,
  className,
  side = "top",
}: {
  children: ReactNode;
  className?: string;
  side?: TooltipSide;
}) {
  return (
    <span className={className} role="tooltip" style={positionStyle(side)}>
      {children}
    </span>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent };