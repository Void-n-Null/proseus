/**
 * Markdown rendering pipeline for Proseus.
 *
 * Single module, single configuration. Used by both streaming mode
 * (ref-based innerHTML writes via rAF) and normal mode (React render
 * of finalized `node.message`). Same parser, same options, same HTML
 * output — the finalization transition is visually seamless.
 *
 * Pipeline:
 *   Streaming: remend(text) → marked.parse() → DOMPurify.sanitize()
 *   Finalized: marked.parse(text) → DOMPurify.sanitize()
 *
 * Dependencies:
 *   - marked (~15kB gz)        — markdown → HTML
 *   - marked-highlight (~1kB)  — code block highlighting extension
 *   - remend (~4kB gz)         — auto-close unterminated markdown for streaming
 *   - DOMPurify (~7kB gz)      — HTML sanitization
 *   - highlight.js/lib/core    — syntax highlighting (lazy language loading)
 */

import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import remend from 'remend';
import DOMPurify, { type Config as PurifyConfig } from 'dompurify';
import hljs from 'highlight.js/lib/core';

// ---------------------------------------------------------------------------
// Lazy language loading for highlight.js
// ---------------------------------------------------------------------------

/** Languages currently registered with highlight.js. */
const registeredLanguages = new Set<string>();

/** In-flight language imports (deduped). */
const pendingImports = new Map<string, Promise<void>>();

/**
 * Map of supported language aliases → highlight.js module paths.
 * Only languages listed here will attempt to load. Everything else
 * renders as plain text in code blocks — which is fine.
 */
const LANGUAGE_MAP: Record<string, string> = {
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  python: 'python',
  py: 'python',
  json: 'json',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  html: 'xml',
  xml: 'xml',
  css: 'css',
};

/**
 * Attempt to register a language grammar if not already loaded.
 * Returns `true` if the language is ready for synchronous highlighting.
 * Kicks off an async import if not yet loaded — the next render cycle
 * will pick it up. The user sees unhighlighted code for one frame at most.
 */
function ensureLanguage(lang: string): boolean {
  const resolved = LANGUAGE_MAP[lang.toLowerCase()];
  if (!resolved) return false;
  if (registeredLanguages.has(resolved)) return true;

  // Kick off async load if not already in flight
  if (!pendingImports.has(resolved)) {
    const importPromise = loadLanguage(resolved);
    pendingImports.set(resolved, importPromise);
  }

  return false;
}

/**
 * Loaders for each supported highlight.js grammar.
 *
 * We use explicit static import expressions (one per language) so the
 * bundler can resolve them into separate chunks. A fully dynamic
 * `import(\`highlight.js/lib/languages/${name}\`)` path would prevent
 * the bundler from knowing which modules to split.
 */
const LANGUAGE_LOADERS: Record<string, () => Promise<{ default: any }>> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  json: () => import('highlight.js/lib/languages/json'),
  bash: () => import('highlight.js/lib/languages/bash'),
  xml: () => import('highlight.js/lib/languages/xml'),
  css: () => import('highlight.js/lib/languages/css'),
};

/** Dynamic import + registration for a single language grammar. */
async function loadLanguage(name: string): Promise<void> {
  try {
    const loader = LANGUAGE_LOADERS[name];
    if (!loader) return;
    const module = await loader();
    hljs.registerLanguage(name, module.default);
    registeredLanguages.add(name);
  } catch {
    // Language failed to load — not critical, code renders unstyled.
  } finally {
    pendingImports.delete(name);
  }
}

// ---------------------------------------------------------------------------
// YouTube embed support
// ---------------------------------------------------------------------------

/**
 * Extract a YouTube video ID from common URL formats.
 * Returns null if the URL isn't a recognized YouTube link.
 */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    // youtube.com/watch?v=ID
    if (
      (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') &&
      u.pathname === '/watch'
    ) {
      return u.searchParams.get('v');
    }
    // youtube.com/embed/ID
    if (
      (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') &&
      u.pathname.startsWith('/embed/')
    ) {
      return u.pathname.split('/')[2] || null;
    }
    // youtu.be/ID
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

/** Render a YouTube thumbnail card with play button overlay. */
function youtubeCard(videoId: string, href: string, text: string): string {
  const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const escaped = href.replace(/"/g, '&quot;');
  const label = text || 'YouTube video';
  return (
    `<a class="yt-embed" href="${escaped}" target="_blank" rel="noopener noreferrer" title="${label}">` +
      `<span class="yt-embed-thumb" style="background-image:url('${thumb}')">` +
        `<span class="yt-embed-play">&#9654;</span>` +
      `</span>` +
      (text && text !== href
        ? `<span class="yt-embed-title">${text}</span>`
        : '') +
    `</a>`
  );
}

// ---------------------------------------------------------------------------
// Custom renderer — YouTube detection for links and images
// ---------------------------------------------------------------------------

const renderer = {
  link({ href, text }: { href: string; text: string }): string | false {
    if (!href) return false;
    const videoId = extractYouTubeId(href);
    if (videoId) return youtubeCard(videoId, href, text);
    // Fall through to default renderer
    return false;
  },
  image({ href, text }: { href: string; text: string }): string | false {
    if (!href) return false;
    const videoId = extractYouTubeId(href);
    if (videoId) return youtubeCard(videoId, href, text || '');
    // Fall through to default renderer
    return false;
  },
};

// ---------------------------------------------------------------------------
// Configure marked — single instance, one-time setup
// ---------------------------------------------------------------------------

const marked = new Marked(
  { gfm: true, breaks: false },
  { renderer },
  markedHighlight({
    highlight(code: string, language: string) {
      const lang = language?.trim();
      if (!lang) return code;

      // If the grammar is loaded, highlight synchronously.
      // Otherwise, return raw code and kick off async load for next render.
      if (ensureLanguage(lang)) {
        const resolved = LANGUAGE_MAP[lang.toLowerCase()];
        if (resolved) {
          try {
            return hljs.highlight(code, { language: resolved }).value;
          } catch {
            return code;
          }
        }
      }

      return code;
    },
  }),
);

// ---------------------------------------------------------------------------
// DOMPurify configuration
// ---------------------------------------------------------------------------

/** Allow highlight.js span classes and standard markdown output. */
const PURIFY_CONFIG: PurifyConfig = {
  // Allow all standard HTML elements that marked produces,
  // plus span (used by highlight.js for syntax tokens).
  USE_PROFILES: { html: true },
  // Allow class attributes (needed for hljs-* classes on spans)
  ADD_ATTR: ['class', 'target', 'rel'],
  // Links should open in new tab
  ADD_TAGS: [],
  // Ensure we get a plain string, not TrustedHTML
  RETURN_TRUSTED_TYPE: false,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render finalized markdown to sanitized HTML.
 *
 * Used for persisted messages (normal React render mode).
 * No remend needed — the markdown is complete.
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
}

/**
 * Render streaming markdown to sanitized HTML.
 *
 * Used during rAF flushes (ref-based DOM writes).
 * Runs remend first to auto-close unterminated syntax so partial
 * markdown doesn't flash raw characters.
 */
export function renderStreamingMarkdown(text: string): string {
  if (!text) return '';
  const completed = remend(text);
  const html = marked.parse(completed, { async: false }) as string;
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
}
