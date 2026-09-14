# Gundam Card Game Trainer

An unofficial, fan-made trainer for the Gundam Card Game (Bandai). It teaches the rules by making you play them on a live board, then coaches you through practice games against a bot.

Not affiliated with or endorsed by Bandai. Card names and text are Bandai's property; this project stores only card metadata and never card art.

## What it does

- **Learn**: eight hands-on lessons. Each step highlights the relevant board zone and most steps set a task you must perform (deploy this, pair that, block, play an Action command) before you can continue. Every lesson ends with a quiz that cites the Comprehensive Rules.
- **Practice**: full games against a heuristic bot using the ST01 (Heroic Beginnings) and ST02 (Wings of Advance) starter decks. The Coach panel comments on the live position: lethal checks, free kills, missed links, unspent Resources, dangerous blockers, burst risk. Each End Turn produces a review of what you missed. Undo is available as a training aid.
- **Drills & Glossary**: ten-question rules drills and a glossary of every keyword and timing icon.
- **Skill tracker**: records the first time you demonstrate each mechanic (link unit, blocker, action-step command, burst, etc.).
- **Visible opponent**: the Trainer Bot plays one move at a time (speed: slow / normal / fast / instant) with a speech bubble giving its reasoning for each move, block, and action-step play. Its reasoning is also written to the log.
- **Animations**: deploy pop-in, attack lunge, hit shake with floating damage numbers, destruction fade, shield-break flash, and event toasts for kills, shields, bursts, and links.
- **Drag and drop**: drag a Unit from hand into your Battle Area, a Base onto your Base slot, a Pilot onto a Unit, a Command onto its target, or a Unit onto an enemy Unit / their Shield Area to attack. Clicking still works everywhere (a click opens the card's action sheet). Pointer events, so it works with mouse and touch.
- **Board layout** follows the official play sheet: Shield Area (Base + Shields) in the left column, Battle Area centre, Deck top-right, Resource Deck + Resource Area in front, Trash bottom-right; the opponent's side is rotated 180°.

## Rules coverage

The engine implements Comprehensive Rules v1.9.0 (September 2026) for the two starter decks:

- Setup: 50-card deck, 10 Resources, 6 Shields, EX Base, EX Resource for Player Two, mulligan.
- Turn: Start (active step) → Draw → Resource → Main → End (Repair, hand limit 10, cleanup).
- Main phase: Level and cost, deploying Units/Bases (6-Unit and 1-Base limits), pairing Pilots and Commands-as-Pilots, Link Units, Main commands, Activate·Main effects.
- Battle: attack → block → action → damage → end. Blocker, action-step Action commands (both players, alternating), First Strike ordering, simultaneous damage, Base and Shield damage, Burst, Breach, direct damage win.
- Every card effect in ST01 and ST02, including tokens (White Base, Corsica Base), EX Resource placement, Peaceful Timbre, Suletta's resource refund, Heavyarms splash, Zechs draw.

Simplifications: the End-Phase action step is skipped (no card in these decks uses it). EX Resources are spent only after regular Resources.

References live in `docs/`: the comprehensive rules text and the official rules FAQ (via the community gcg-api dataset).

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npx tsx scripts/sim.ts 300        # AI vs AI: no crashes, stuck states or card leaks
npx tsx scripts/lesson-test.ts    # scripted human decision paths through the lessons
```

## Layout

- `src/game/types.ts` — state model
- `src/game/cards.ts` — card database and deck lists
- `src/game/engine.ts` — rules engine
- `src/game/ai.ts` — Trainer Bot
- `src/game/coach.ts` — coaching heuristics, turn review, skill tracker
- `src/learn/lessons.ts` — curriculum, sandbox boards, quizzes
- `src/ui/` — React screens
