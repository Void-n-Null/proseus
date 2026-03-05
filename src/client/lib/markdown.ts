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
  const label = escapeHtml(text || 'YouTube video');
  return (
    `<a class="yt-embed" href="${escaped}" target="_blank" rel="noopener noreferrer" title="${label}">` +
      `<span class="yt-embed-thumb" style="background-image:url('${thumb}')">` +
        `<span class="yt-embed-play">&#9654;</span>` +
      `</span>` +
      (text && text !== href
        ? `<span class="yt-embed-title">${escapeHtml(text)}</span>`
        : '') +
    `</a>`
  );
}

/** Escape text before inserting into an HTML attribute/body. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Direct image URL extensions that should be embeddable. */
const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|avif|bmp)(?:$|\?)/i;

/** Best-effort HTTPS upgrade for known hosts that support it. */
function normalizeImageUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'http:' && url.hostname === 'files.catbox.moe') {
      url.protocol = 'https:';
      return url.toString();
    }
  } catch {
    // Keep original URL if parsing fails.
  }
  return rawUrl;
}

/** Return true for links that should be rendered as inline images. */
function isEmbeddableImageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.hostname === 'files.catbox.moe') return true;
    return IMAGE_EXTENSIONS.test(url.pathname + url.search);
  } catch {
    return false;
  }
}

/** Render a standard markdown image with safe defaults. */
function imageTag(href: string, altText: string, title?: string | null): string {
  const src = normalizeImageUrl(href).replace(/"/g, '&quot;');
  const alt = escapeHtml(altText || 'Image');
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<img src="${src}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer"${titleAttr}>`;
}

// ---------------------------------------------------------------------------
// Custom renderer — YouTube detection for links and images
// ---------------------------------------------------------------------------

const renderer = {
  link({ href, text }: { href?: string; text?: string }): string | false {
    if (!href) return false;
    const label = text ?? '';
    const videoId = extractYouTubeId(href);
    if (videoId) return youtubeCard(videoId, href, label);
    const shouldAutoEmbedImage = isEmbeddableImageUrl(href) && (!label || label === href);
    if (shouldAutoEmbedImage) return imageTag(href, 'Image');
    // Fall through to default renderer
    return false;
  },
  image({
    href,
    text,
    title,
  }: {
    href?: string;
    text?: string;
    title?: string | null;
  }): string | false {
    if (!href) return false;
    const videoId = extractYouTubeId(href);
    if (videoId) return youtubeCard(videoId, href, text ?? '');
    return imageTag(href, text ?? 'Image', title);
  },
};

// ---------------------------------------------------------------------------
// Configure marked — single instance, one-time setup
// ---------------------------------------------------------------------------

const marked = new Marked(
  { gfm: true, breaks: true },
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
  // Explicitly permit image tags/attrs used by markdown output.
  ADD_TAGS: ['img'],
  // Allow classes, links, and safe image attributes.
  ADD_ATTR: ['class', 'target', 'rel', 'src', 'alt', 'title', 'loading', 'decoding', 'referrerpolicy'],
  // Ensure we get a plain string, not TrustedHTML
  RETURN_TRUSTED_TYPE: false,
};

const URL_ATTRS = ["href", "src", "xlink:href", "action", "formaction", "poster"] as const;

function isUnsafeUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("javascript:") || normalized.startsWith("vbscript:");
}

function hardenSanitizedHtml(html: string): string {
  if (!html || typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const stack = [...Array.from(doc.body.children)];
  while (stack.length > 0) {
    const element = stack.pop();
    if (!element) continue;

    for (const attr of [...element.attributes]) {
      if (/^on/i.test(attr.name)) {
        element.removeAttribute(attr.name);
        continue;
      }

      if (
        (URL_ATTRS as readonly string[]).includes(attr.name.toLowerCase()) &&
        isUnsafeUrl(attr.value)
      ) {
        element.removeAttribute(attr.name);
      }
    }

    stack.push(...Array.from(element.children));
  }

  return doc.body.innerHTML;
}

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
  const sanitized = DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
  return hardenSanitizedHtml(sanitized);
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
  const sanitized = DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
  return hardenSanitizedHtml(sanitized);
}
