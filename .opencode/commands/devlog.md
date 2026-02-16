---
description: "Write a devlog entry for the current session in its own file"
---

You are writing a development log entry. Your job is to analyze the current session's work and produce a high-quality devlog entry.

## Step 1: Determine the file

Each coding session gets its own devlog file, even if multiple sessions happen on the same day. Devlogs live in the `devlogs/` directory at the project root.

1. Run `date '+%b%d'` to get the date portion (e.g., `Feb16`).
2. List existing files in `devlogs/` to find any that start with today's date prefix (e.g., `DevLog_Feb16*.md`).
3. Determine the session number:
   - If no files exist for today, this is session 1 → `DevLog_Feb16_1.md`
   - If `DevLog_Feb16_1.md` exists, this is session 2 → `DevLog_Feb16_2.md`
   - Continue incrementing for each subsequent session.
4. Create the new file at `devlogs/DevLog_<date>_<N>.md` with a top-level heading: `# DevLog — <full date>, Session <N>` (e.g., `# DevLog — February 16th, 2026, Session 1`).

**Never append to an existing devlog file.** Every session is a separate file. This keeps sessions cleanly separated for review, even when you have a morning session and an evening session on the same day.

## Step 2: Gather context

Before writing, understand what was accomplished. Do ALL of the following:

1. Run `git diff --stat HEAD~5..HEAD` and `git log --oneline -20` to see recent commits and what files changed
2. Read any files that were significantly modified in the session
3. If the user provides `$ARGUMENTS`, treat that as additional context or a summary of what they worked on
4. Check the current state of the codebase — what's been added, refactored, fixed, or designed

## Step 3: Write the entry

Append a new session block to the devlog file. Use this structure:

```
---

## <time> — <session theme in 3-6 words>

<Opening paragraph: 2-4 sentences establishing what the session was about and why it mattered. State the problem or objective directly. No hedging, no "I think" — you know what you built and why.>

### <Subsection per major change or decision>

<For each significant piece of work, write 1-3 paragraphs explaining:
- What the problem was (be specific — name the files, the functions, the failure mode)
- What the solution is and why this approach was chosen over alternatives
- Any non-obvious implementation details worth recording>

### What got done

<Dense bulleted list. Each bullet: **Bold feature name**: terse technical description with specific values, file names, and measurements. Use em-dashes to separate concepts. This section is a changelog you can scan in 30 seconds.>

### Notes

<1-2 paragraphs of engineering reflection. What design principle does this session reinforce? What architectural decision was validated or invalidated? What's the next logical step? Write with conviction — this is your professional record of what you learned.>
```

## Writing style

You are writing as a senior engineer documenting their own work with clarity and confidence. The voice should be:

- **Direct and declarative.** "The old approach failed because X. The fix is Y." Not "I was thinking maybe we could try..."
- **Technically precise.** Name the files, the functions, the line counts, the millisecond improvements. Vague statements are useless in a devlog.
- **Opinionated about architecture.** If a design decision was made, explain why it's the right one. If something was refactored, explain what was wrong with the old approach. Don't equivocate.
- **Honest about tradeoffs.** If something is a temporary solution, say so and say why. If a bug was caused by a bad earlier decision, own it and explain the correction.
- **Narrative but efficient.** Each subsection tells a short story — problem, investigation, solution — but doesn't waste words. Every sentence earns its place.
- **Professional confidence, not arrogance.** You're documenting engineering decisions for your future self and your team. Write like someone who respects the reader's time and intelligence.

Do NOT:
- Use emojis
- Write vague summaries ("improved performance", "cleaned up code", "various fixes")
- Hedge with "maybe", "I think", "probably", "might"
- Skip implementation details — the whole point is capturing what was actually done
- Write in third person — this is first person, present tense where possible
- Add filler or pleasantries — get to the substance immediately

## Step 4: Confirm

After writing, show the user the entry you produced and tell them the file path.
