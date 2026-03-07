import React from "react";
import { siGithub, siGithubsponsors } from "simple-icons";

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

/** Simple Icons entries rendered as filled SVG paths */
const SI_LINKS = [
  {
    label: "GitHub",
    href: "https://github.com/Void-n-Null/proseus",
    icon: siGithub,
    color: "#ffffff",
    bg: "#24292e",
  },
  {
    label: "GitHub Sponsors",
    href: "https://github.com/sponsors/Void-n-Null",
    icon: siGithubsponsors,
    color: "#ffffff",
    bg: `#${siGithubsponsors.hex}`,
  },
] as const;

/** Community link uses a Lucide icon instead */
const COMMUNITY_LINK = {
  label: "Community",
  href: "https://discord.gg/dURy5kKqbr",
  color: "#ffffff",
  bg: "#222222",
} as const;

export default function DiscordFrameShell({
  children,
  style,
  topBar,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  topBar?: React.ReactNode;
}) {
  return (
    <div
      className="font-body text-foreground h-dvh relative"
      style={{
        ...style,
        background: "var(--color-surface, #1e2124)",
        paddingTop: GUTTER_TOP,
        paddingLeft: GUTTER_LEFT,
      }}
    >
      {/* ── Server rail (left gutter) ── */}
      <div
        className="discord-server-rail absolute top-0 left-0 flex flex-col items-center gap-2 py-4 pt-8 overflow-y-auto overflow-x-hidden"
        style={{ width: GUTTER_LEFT, height: "100%" }}
      >
        {/* Home / DM button */}
        <button
           className="discord-server-btn discord-server-btn--home group relative flex items-center justify-center rounded-[12px] transition-all duration-200"
          style={{ width: 40, height: 40, background: "var(--color-discord-server-btn, #36393f)" }}
          aria-label="Home"
        >
          <div>P</div>
        </button>

        {/* Separator */}
        <div
          className="discord-server-separator"
          style={{
            width: 32,
            height: 1,
            borderRadius: 1,
            background: "var(--color-discord-server-separator,rgba(255, 255, 255, 0.05))",
          }}
        />

        {/* Simple Icons server buttons */}
        {SI_LINKS.map(({ label, href, icon, color, bg }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="discord-server-btn group relative flex items-center justify-center rounded-[10px] transition-all duration-200"
            style={{
              width: 40,
              height: 40,
              background: bg,
              color: color,
            }}
            aria-label={label}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d={icon.path} />
            </svg>
          </a>
        ))}

        {/* Community */}
        <a
          href={COMMUNITY_LINK.href}
          target="_blank"
          rel="noopener noreferrer"
          className="discord-server-btn group relative flex items-center justify-center rounded-[10px] transition-all duration-200"
          style={{
            width: 40,
            height: 40,
            background: COMMUNITY_LINK.bg,
            color: COMMUNITY_LINK.color,
          }}
          aria-label={COMMUNITY_LINK.label}
        >
          <img
            src="/icons/discord-chat.svg"
            alt=""
            aria-hidden="true"
            style={{ width: 32, height: 32, display: "block" }}
          />
        </a>

        {/* Add server button */}
        <button
          className="discord-server-btn discord-server-btn--add group relative flex items-center justify-center rounded-[10px] transition-all duration-200"
          style={{
            width: 40,
            height: 40,
            background: "var(--color-discord-server-btn, #36393f)",
            color: "var(--color-discord-server-btn-accent, #3ba55c)",
          }}
          aria-label="Add a Server"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M13 5h-2v6H5v2h6v6h2v-6h6v-2h-6V5Z" fill="currentColor" />
          </svg>
        </button>

        {/* Explore button */}
        <button
          className="discord-server-btn discord-server-btn--explore group relative flex items-center justify-center rounded-[10px] transition-all duration-200"
          style={{
            width: 40,
            height: 40,
            background: "var(--color-discord-server-btn, #36393f)",
            color: "var(--color-discord-server-btn-accent, #3ba55c)",
          }}
          aria-label="Explore Servers"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2Zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8Z"
              fill="currentColor"
            />
            <path
              d="m16.154 7.846-5.846 2.308L8 15.999l5.846-2.308 2.308-5.845Zm-3.462 5.462a1.003 1.003 0 0 1-1.385 0 .98.98 0 0 1 0-1.384.98.98 0 0 1 1.385 0 .98.98 0 0 1 0 1.384Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      {topBar && (
        <div
          className="absolute top-0 right-0"
          style={{ left: GUTTER_LEFT, height: GUTTER_TOP }}
        >
          {topBar}
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="bg-background h-full flex flex-col overflow-hidden rounded-tl-xl border-l border-t border-white/5">
        {children}
      </div>
    </div>
  );
}
