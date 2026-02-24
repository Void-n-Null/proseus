import React from "react";

/**
 * Discord Frame Shell
 *
 * Simulates Discord's app chrome — a dark gutter on the top (toolbar area)
 * and left (server/channel rail). The actual app content is inset inside a
 * rounded container with the normal `bg-background`.
 *
 * Only rendered on desktop when the discord template is active.
 * On mobile this component is never mounted — App.tsx skips it.
 */

const GUTTER_TOP = 32;
const GUTTER_LEFT = 72;

export default function DiscordFrameShell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="font-body text-foreground h-dvh"
      style={{
        ...style,
        background: "var(--color-surface, #1e2124)",
        paddingTop: GUTTER_TOP,
        paddingLeft: GUTTER_LEFT,
      }}
    >
      <div className="bg-background h-full flex flex-col overflow-hidden rounded-tl-xl border-l border-t border-white/5">
        {children}
      </div>
    </div>
  );
}
