# Study Games — Implementation Plan

## Architecture

All games share a common data source and engine.

### Data Source
```
Flashcard { id, noteId, front, back }
```
- `front` = term / question
- `back` = definition / answer
- Games read existing flashcards from IndexedDB (same collection used by FlashcardsView)
- Zero additional AI calls — games are pure client-side logic

### Shared Hooks & Utilities
```
src/lib/games/
  types.ts          — GameResult, GameHighScore, GameConfig shared types
  utils.ts          — shuffle, pickWrongAnswers, levenshtein, lerp, clamp
  useGameLoop.ts    — requestAnimationFrame loop with delta time
  useFlashcards.ts  — fetch cards from DB for a note/folder, filter by mastery
  scoring.ts        — streak multiplier, combo system, score persistence
```

### Persistent State
- High scores stored in IndexedDB keyed by `noteId + gameId`
- Games read card mastery from FSRS (existing study system) to weight card selection — prioritize weak cards
- Session stats (cards seen, accuracy, time played) saved after each round

### Component Pattern
Each game is a single React component in `src/components/games/`:
- Receives `cards: Flashcard[]` prop
- Manages its own game state internally
- Calls `onComplete(result: GameResult)` when done
- Renders a pause overlay, score display, and game-over screen

---

## Game 1: Scatter Match

**Mechanic:** Drag-and-drop matching. Term cards and definition cards scattered randomly across the canvas. Player drags a term card onto its matching definition card. Correct = snap together with animation + score. Wrong = cards bounce apart + shake.

**Visual Design:**
- Cards are rounded rectangles with subtle shadow, slightly tilted at random angles (like scattered Polaroids)
- Term cards: accent-colored top border. Definition cards: muted background
- On hover: card lifts (scale 1.05, shadow increases)
- Correct match: cards glow green, shrink and fly to a "matched" pile in the corner
- Wrong match: cards shake horizontally, red flash, bounce back to original position
- Background: subtle grid pattern, calming gradient

**Scoring:**
- +100 base points per match
- Combo: consecutive correct without a miss → ×2, ×3, ×4… multiplier
- Time bonus: under 30s → +500, under 60s → +200
- Wrong attempt: −25 points, resets combo

**Implementation Notes:**
- Use native HTML drag & drop API or pointer events for touch support
- Position cards randomly on mount using seeded random (so layout is reproducible)
- Ensure cards don't overlap on initial scatter (collision check)
- Spring animation for snap (requestAnimationFrame interpolation)
- Works with 6–20 card pairs

---

## Game 2: Speed Sort

**Mechanic:** Two columns — Terms on left, Definitions on right, both randomly shuffled. Player drags rows to reorder so each term aligns with its correct definition. Goal: fastest correct sort.

**Visual Design:**
- Split screen: left column (terms) labeled with accent color, right column (definitions) labeled with muted color
- Each row is a pill-shaped chip with drag handle on the left
- Dragging: row lifts with shadow, semi-transparent at original position
- Correct match: row backgrounds pulse green briefly
- Timer displayed prominently at top, ticking up
- Progress bar at bottom showing matched vs total

**Scoring:**
- Score = based entirely on time: `max(0, 10000 - timeMs)` for perfect match
- Bonus for under 15s: ×1.5 multiplier
- Wrong ordering when submitted: −200 per wrong pair
- Leaderboard shows best time

**Implementation Notes:**
- Use a sortable list library or simple index-swap dragging
- "Submit" button to check answers (not auto-checked on each drag)
- Pre-fill with 5–10 pairs
- Mobile: tap a term, then tap a definition to swap/pair

---

## Game 3: Answer Fall

**Mechanic:** Answers rain down from the top of the screen. A question/term is shown prominently at the top. Player moves a basket left/right to catch the correct answer while dodging wrong ones. Lives system — catch wrong answer = lose a life. The answers are on an apple which falls down.

**Visual Design:**
- Dark background with subtle stars/particles
- Question displayed in a banner at the top with glow effect
- Falling answers: colored orbs/pills — correct one is subtly highlighted (maybe slightly larger or has a faint glow, but not obvious unless paying attention)
- Player basket: a bucket/container at the bottom with physics-y bounce
- Lives shown as hearts at top-right
- Speed increases every 5 correct catches
- Wrong answers that hit the ground: shatter particle effect
- Correct answer caught: burst of sparkles + score popup (+150, +300 with combo)

**Scoring:**
- +100 per correct catch
- Streak: 5 in a row → +200, 10 → +300, 15 → +500
- Wrong catch: −1 life (3 lives total), reset streak
- Bonus items occasionally fall: ⭐ (2× next catch), 🛡️ (shield — next wrong catch ignored), ⏰ (+5s slow motion)

**Implementation Notes:**
- requestAnimationFrame game loop
- Spawn rate: starts every 2s, decreases to 0.8s at max speed
- Wrong answers: pick 2–3 from other random flashcards
- Object pooling for falling items (create, recycle, not garbage collect)
- Touch: tap left/right halves of screen. Desktop: arrow keys or A/D

---

## Game 4: Gate Runner

**Mechanic:** Side-scrolling runner (like Temple Run but 2D). The character runs automatically. Gates appear ahead — 2 to 4 lanes. A question is shown above the gates. Each gate has a different answer text on it. Player switches lanes (A/D or arrow keys) to run through the correct gate. Wrong gate = stumble/slow down or lose a life.

**Visual Design:**
- Side-scrolling parallax background (3 layers: sky, mountains/buildings, ground)
- Character: simple running sprite (stick figure or capsule shape with running animation — leg cycle)
- Lanes: 2–4 horizontal tracks with lane dividers
- Gates: archway structures with answer text displayed on the crossbar
- Question banner scrolls with the screen, pinned to top
- Correct gate: character bursts through with green particles, speed boost
- Wrong gate: character bounces off with red flash, brief stun, speed reset
- Distance counter and speed indicator at top
- Ground scrolls with hash marks for speed perception

**Game State:**
- 3 lives (hearts at top-left)
- Speed increases over distance (meter at top shows current speed tier)
- Every 500m: lane count increases (2→3→4 lanes)
- Questions cycle every ~200m of running

**Scoring:**
- +10 per meter traveled
- Correct gate: +200 bonus
- Consecutive correct: combo multiplier on distance points
- Power-up gates occasionally appear: 🚀 (speed burst, invincible for 2 gates), 💎 (2× points for 10s), ❤️ (extra life)

**Implementation Notes:**
- Canvas-based rendering with requestAnimationFrame
- Gate spawning: pre-generate next 3–5 gates, keep pool ahead of player
- Collision detection: simple AABB (character bounding box vs gate opening)
- Mobile: swipe up/down to change lanes. Desktop: A/D or ←→
- Generate wrong answers from same flashcard set (pick other cards' answers)

---

## Game 5: Hangman

**Mechanic:** Classic hangman using flashcard terms as the hidden word. The definition/back of the card is shown as the clue. Player guesses letters one at a time. Wrong guess = draw a body part. 6 wrong guesses = game over.

**Visual Design:**
- Clean, dark theme with chalkboard aesthetic
- Gallows drawn with SVG/CSS (not a real person — use a stick figure or build a snowman that melts)
- Word display: underscore lines with correctly guessed letters filled in (typewriter font)
- Clue displayed above: "Definition: …" in italic
- Letter buttons: on-screen keyboard grid (A–Z), guessed letters grayed out
- Wrong guesses shown in a "graveyard" row
- Celebration animation on correct word: confetti or letters bounce
- Mobile-friendly: large tap targets for letter buttons

**Scoring:**
- +100 per letter in the word if solved
- Bonus for few wrong guesses: 0 wrong = ×3, 1 wrong = ×2, 2 wrong = ×1.5
- Bonus for solving quickly (under 30s = +200)
- Wrong answer (ran out of guesses): 0 points, show correct answer

**Implementation Notes:**
- Filter flashcards to only use ones where `front` is a single word or short phrase (≤20 chars) and contains only letters
- Normalize: strip accents, convert to uppercase, ignore spaces/hyphens in display
- Keyboard support: physical keyboard letter keys work too
- Track which cards were used to avoid repeats within a session

---

## Game 6: Castle Siege

**Mechanic:** Side-view castle assault. Player's army is on the left, enemy castle on the right. A flashcard question is shown at the top with 4 answer buttons. Rapid-fire: click the correct answer to spawn a knight/soldier who charges toward the enemy castle. Each correct answer = one soldier spawned. The enemy castle also spawns defenders at a steady rate who march left toward your castle. Soldiers from both sides collide in the middle and fight (cancel each other out). Goal: overwhelm the enemy castle by landing enough soldiers on it while preventing enemy soldiers from reaching yours.

This is fundamentally a **rapid-fire answer quiz** wrapped in a castle battle — the faster and more accurately you answer, the more soldiers you spawn. The battle visuals provide motivation and feedback proportional to your quiz performance.

**Adaptive Difficulty:**
The game tracks the player's recent answer speed and accuracy and adjusts enemy spawn rate to keep the game winnable but challenging:
- Track rolling average of last 5 answer times and accuracy
- If player accuracy < 60%: slow down enemy spawn rate, show slightly easier cards (higher mastery or shorter answers)
- If player accuracy > 90%: increase enemy spawn rate, mix in harder cards
- If player is answering very fast (<2s avg): increase spawn cap so they can build a bigger army
- "Comeback mechanic": if player's castle HP drops below 30%, enemy spawn rate drops 40% for 15s
- Minimum enemy spawn interval: 2.5s (never faster than this, so it's always possible)

**Visual Design:**
- Side-view battlefield with parallax background (sky, distant mountains, battlefield ground)
- Player's castle: on the far left, stone walls with HP bar above, flag waving
- Enemy castle: on the far right, darker stone, larger, with HP bar above, menacing flag
- Ground: dirt/grass with subtle terrain variation
- Soldiers (player): blue/white knights with simple sword-and-shield sprite, run right when spawned
- Soldiers (enemy): red/dark knights, run left when spawned
- Collision zone: center of screen. When opposing soldiers meet → brief sword-clash animation → both vanish with particle burst
- Surviving soldiers: reach the enemy castle → attack animation (slash at wall) → enemy HP decreases
- Enemy soldiers reaching player castle: attack animation → player HP decreases
- Question panel: floating card at top-center, 4 answer buttons below it, large and easy to click
- Correct answer: button flashes green, soldier spawns from player castle with charge animation + war horn sound cue
- Wrong answer: button flashes red, brief stun (0.5s cooldown before next question appears)
- Power-ups occasionally appear on the battlefield (click to collect):
  - ⚔️ Cavalry: next 3 correct answers spawn double soldiers
  - 🛡️ Shield Wall: enemy spawn rate halved for 10s
  - 🔥 Fire Arrow: instantly damages enemy castle for 5 HP
  - 💀 Plague: kills all enemy soldiers currently on the field

**Game State:**
- Player castle HP: 100
- Enemy castle HP: 100
- Each soldier that reaches a castle deals 5 damage
- Enemy spawn rate: starts at 1 soldier every 4s, adapts based on player performance
- Player spawns: 1 soldier per correct answer (no cooldown beyond the time it takes to read and click)
- Wrong answers: 1s cooldown before next question (to prevent random clicking)
- Skips allowed: "Skip" button for 1s penalty (for questions player genuinely doesn't know)
- Battlefield soldier cap: 20 per side (prevents visual clutter)
- 5 waves. Between waves: 5s breather, castle HP partially regenerates (+10 HP), question difficulty adjusts

**Scoring:**
- +100 per correct answer
- Enemy castle HP depleted: +2000 wave bonus, advance to next wave
- Player castle HP remaining: ×20 bonus at game end
- Speed bonus per question: answer in <2s → +50, <1s → +100
- Accuracy bonus at end: (correct / total) × 1000
- Combo: 5 consecutive correct → soldier spawn ×2 for next spawn
- Game clear (destroy enemy castle in all 5 waves): +5000

**Implementation Notes:**
- Canvas-based with requestAnimationFrame
- Soldier movement: simple linear interpolation between spawn point and target castle (or collision point)
- Collision: when player soldier x ≥ enemy soldier x (they meet), both removed with animation
- Answer buttons: DOM elements overlaid on canvas for accessibility and easy click handling
- Soldier sprites: simple colored rectangles with a sword line (or emoji: ⚔️ 🛡️)
- Adaptive logic: store recent answers in a ring buffer, recalculate difficulty every 5 answers
- Castle HP bars: thick colored bars with smooth CSS/Canvas transition on damage
- Screen shake on castle hit
- Particle effects: dust clouds at collision zone, sparks at castle hits, confetti on wave clear

---

## Game 7: Flappy Study

**Mechanic:** Flappy Bird clone. The bird flies through vertical gaps between pipes. Each gap has an answer label. A question is shown at the top. Only fly through the gap with the correct answer. Wrong gap = game over.

**Visual Design:**
- Side-scrolling, sky blue gradient background with clouds
- Bird: simple round character with wing animation (CSS rotation or sprite)
- Pipes: coming from top and bottom, labeled with answer text (one answer per gap pair)
- Question displayed in a banner at top of screen
- Score counter (pairs passed) in top-right
- Tap/click to flap (simple physics: gravity + impulse)

**Game State:**
- Question changes every 3–5 pipe pairs passed
- Pipe pairs: 2–3 choices shown (2–3 gaps stacked vertically, but only one is passable at a time)
- Actually simpler: each pipe pair is just one gap. Randomly, the correct or wrong answer is on it. If wrong answer → bird must dodge by going over/under? No, that changes Flappy Bird too much.
- Better approach: 2–3 parallel pipe sets (lanes). Question at top. Each lane's gap has a different answer. Player must navigate to the correct lane's gap. Tap to flap vertically as usual, but also slight horizontal control (or the bird auto-drifts and you time the flap to choose height/lane).

- Even simpler: Each pipe pair has ONE answer on it. 50% chance it's the correct answer for the current question. If correct → fly through it. If wrong → must fly OVER or UNDER the pipes entirely (dodge). This preserves classic Flappy Bird feel while adding the quiz element.

**Scoring:**
- +1 per pipe pair passed (classic Flappy scoring)
- Correct answer gap: +5 bonus
- Dodge wrong answer: +3 bonus
- Streak of correct choices: combo multiplier

**Implementation Notes:**
- Canvas-based with simple physics (gravity = 0.5px/frame², flap = −8px velocity)
- Pipe generation: fixed horizontal spacing, random vertical gap position
- Answer labels rendered on pipe faces
- Mobile-first: tap anywhere to flap

---

## Game 8: Pac-Card

**Mechanic:** Pac-Man style maze. Player controls a character through a maze. Pellets (dots) are scattered throughout. Each pellet has a flashcard answer on it. A question is shown at the top. Eat the pellet with the correct answer. Ghosts (3–4) chase the player. Power pellets (flashcard category matches) make ghosts vulnerable — eat them for bonus.

**Visual Design:**
- Top-down maze view, dark background with neon-colored walls
- Player character: yellow circle with mouth animation (CSS or canvas)
- Pellets: small colored dots with tiny text labels (or color-coded by topic)
- Ghosts: colored with simple eye animation, each labeled with a topic/category
- Question displayed in top banner
- Score, lives, and current question shown in HUD
- Power pellet: large flashing dot
- Eat animation: pellets disappear with particle burst

**Game State:**
- 3 lives (lose life on ghost collision)
- Maze: predefined layout (or procedurally generated)
- Question changes after each correct pellet eaten
- Wrong pellet: no penalty but no points either (ghosts become slightly faster for 3s)
- Power pellet: appears after 5 correct answers. Eating it makes ghosts run away (vulnerable for 8s). Eating a ghost = +500 points.
- New question appears when current question is answered correctly

**Scoring:**
- Correct pellet: +100
- Wrong pellet: +0
- Ghost eaten: +500
- Power pellet: +200
- Clear all correct pellets in a maze: +1000 bonus, new maze generated
- Lives remaining bonus at game over

**Implementation Notes:**
- Canvas-based with tile map for maze
- Ghost AI: simple chase/patrol behavior (Blinky = chase, Pinky = ambush, Inky = random, Clyde = shy)
- Player movement: arrow keys or swipe. Continuous movement (no grid snap — smooth)
- Collision: circle-rect for walls, circle-circle for pellets/ghosts
- Maze generation: use a simple recursive backtracker or predefine 3–5 layouts
- Answer labels: render on pellets using fillText. Keep pellets large enough to read (or show label on hover/proximity)

---

## Game 9: Asteroids

**Mechanic:** Classic Asteroids shooter. Player controls a spaceship that can rotate and thrust. Asteroids float across the screen, each labeled with a flashcard answer. A question is shown at top. Shoot the asteroid with the correct answer. Wrong asteroids break into smaller, faster pieces when shot. Large asteroids = slow, medium = faster, small = very fast. Ship can also be hit by asteroids.

**Visual Design:**
- Black space background with starfield (parallax scrolling dots)
- Ship: simple triangular ship with thruster flame animation
- Asteroids: irregular polygon shapes (generated with random vertices), rocky texture via shading, labeled with answer text
- Correct answer asteroid: subtly highlighted (faint glow or different rock color — copper/gold tint)
- Shots: small bright dots with trail
- Explosions: particle burst (correct = colorful, wrong = red/orange)
- Question banner at top, score + lives bottom-left

**Game State:**
- 3 lives
- Asteroids spawn in waves. Wave 1: 3 large asteroids. Each wave: +2 more
- Large asteroid → breaks into 2 medium → each breaks into 2 small
- Question changes every 15s or after correct asteroid destroyed
- Wrong asteroid shot: still breaks apart, but spawns an extra small fast asteroid as "penalty debris"
- Ship has brief invulnerability after losing a life (3s, blinking)

**Controls:**
- ↑ or W: thrust
- ← → or A D: rotate
- Space: shoot
- Mobile: virtual joystick (left half = rotate, right half = thrust + auto-shoot)

**Scoring:**
- Correct large asteroid: +200
- Correct medium: +350
- Correct small: +500
- Wrong asteroid: +50 (any size, but you created more danger)
- Wave clear bonus: wave# × 300
- Accuracy bonus at end: (correct shots / total shots) × 500

**Implementation Notes:**
- Canvas-based with vector math for ship physics (velocity, acceleration, rotation, friction)
- Screen wrapping (objects exiting one side enter opposite)
- Asteroid shapes: generate random polygon vertices on spawn
- Collision: circle-circle simplified (bounding radius)
- Answer labels: render centered on each asteroid. Scale text down for small asteroids (may become unreadable — that's fine, adds challenge)

---

## Game 10: Lane Dodge

**Mechanic:** 3–4 vertical lanes. Obstacles scroll down from top toward the player at the bottom. Each obstacle row has a question shown, and each lane has a different answer. Player must move to the lane with the correct answer to be safe. Standing in a wrong-answer lane when obstacles reach you = hit.

**Visual Design:**
- Top-down perspective (like looking down a road)
- 3–4 lanes with dashed lane dividers
- Player: character/icon at the bottom, slides between lanes
- Obstacles: blocks/walls with answer labels, scrolling downward
- Question displayed in a banner at the top (stays fixed)
- Safe lane: subtly highlighted or the obstacle has a break in it
- Hit animation: screen shake, red flash, character knocked back
- Speed lines on lane dividers to convey motion

**Game State:**
- 3 lives (or health bar with 5 HP, each hit = 1 damage)
- Obstacle rows spawn every 2–3 seconds, speed increases over time
- Question changes with each new row of obstacles
- Between rows: 1s breather to reposition
- Power-ups occasionally appear in lanes: ❤️ (heal), ⭐ (invincible for 2 rows), 🐢 (slow down obstacles for 5s)

**Controls:**
- ← → or A/D: move between lanes
- Mobile: tap left/right side of screen, or swipe
- The player occupies exactly one lane at a time, snaps to lane center

**Scoring:**
- +100 per row survived
- Consecutive survivals: combo multiplier
- Power-up collected: +50
- Perfect run (no hits for 10 rows): +1000 bonus
- Score multiplier increases with speed tier

**Implementation Notes:**
- CSS-based or Canvas. CSS is simpler — absolutely positioned divs animated with `transform: translateY()`
- Obstacle spawning: pre-generate 5 rows ahead, recycle off-screen rows
- Lane snapping: animate `left` or `transform` with CSS transition (0.1s ease-out)
- Wrong answers: pick from other flashcards' backs
- The correct lane has a "gap" in the obstacle (the obstacle is shorter or has an opening) — all other lanes have full-wall obstacles

---

## Game 11: Flashcard Tetris

**Mechanic:** Tetris with a twist. Blocks fall as usual, but each block has a flashcard term written on it. To clear/place the block faster (or to rotate it), the player must type the correct definition. Typing the definition correctly instantly hard-drops the block. Wrong definition = block speeds up.

**Visual Design:**
- Classic Tetris layout: tall playfield on left, info panel on right
- Blocks: standard Tetromino shapes (I, O, T, S, Z, J, L) with flashcard terms rendered on each cell
- Block colors: distinct per shape, semi-transparent so text is readable
- Question panel on right: shows "Type the definition of: [TERM]" with a text input below
- Next piece preview at top-right
- Score, level, lines cleared in info panel
- Line clear: standard Tetris flash animation
- Term changes each time a new piece spawns

**Game State:**
- Standard Tetris mechanics: blocks fall at speed based on level, player moves left/right, rotates, soft/hard drops
- On each new piece: a random flashcard term is assigned and displayed
- Typing the correct definition: piece instantly hard-drops to the bottom (like a super power)
- Typing wrong: piece drops 3 rows instantly (punishment — less time to position)
- Lines clear normally (no flashcard requirement to clear)
- Level up every 10 lines, speed increases
- Game over when blocks stack to top

**Controls:**
- ← →: move piece
- ↑: rotate
- ↓: soft drop
- Space: hard drop
- Type in the text input: submit definition (Enter to submit)
- Mobile: on-screen buttons + text input

**Scoring:**
- Standard Tetris scoring for line clears (single: 100×level, double: 300×level, triple: 500×level, Tetris: 800×level)
- Correct definition typed: +200 bonus
- Wrong definition: −50
- Each piece placed: +10
- Bonus for using the answer mechanic (rather than just playing Tetris): streak bonus

**Implementation Notes:**
- Canvas-based for the playfield
- Tetromino rotation uses SRS (Super Rotation System) simplified
- Text rendering: use a smaller font to fit terms on blocks (abbreviate if needed)
- Text input is a real `<input>` element overlaid or below the canvas
- Filter cards to terms ≤15 characters for readability on blocks

---

## Game 12: Hot Potato

**Mechanic:** A flashcard is the "hot potato." A timer counts down (fuse burning). Player must type the correct answer before the timer reaches zero. Correct answer → potato passes to next card, timer resets slightly faster. Wrong answer → timer jumps down (lose 2 seconds). Survive as many rounds as possible.

**Visual Design:**
- Central "potato" visual: a bomb or potato with a burning fuse animation
- Fuse: line that shortens as timer counts down, with spark particles at the tip
- Card display: question shown above the potato
- Text input: large, centered below the potato
- Timer: circular countdown ring around the potato, or a progress bar
- Background: warm colors (orange/red gradient), intensifies as timer gets low
- Screen shake when time is almost up (<3s)
- Explosion animation on game over: potato explodes with particles
- Correct answer: potato bounces, green flash, new card slides in
- Wrong answer: red flash, potato shakes, timer jumps
- Round counter and score in corners

**Game State:**
- Start: 10s per round
- Each correct answer: timer resets to `max(3, 10 - roundNumber * 0.3)` seconds
- Each wrong answer: timer loses 2s immediately
- Streak bonus: 5 correct in a row → +3s bonus added to next round
- Game over when timer hits 0

**Scoring:**
- +100 per correct answer
- Streak multiplier: ×1 for 1–4, ×2 for 5–9, ×3 for 10–14, ×4 for 15+
- Speed bonus: answer in under 2s → +50 extra
- No cap on rounds — pure endurance

**Implementation Notes:**
- Use `setInterval` for timer countdown (100ms granularity)
- Text input auto-focuses each round
- Fuzzy matching: accept answers within Levenshtein distance of 2 (for typos), case-insensitive
- "Pass" button: skip a card at cost of −3s (strategic for hard cards)
- Animate potato using CSS transforms (bounce, shake, explode)

---

## Game 13: Jeopardy Board

**Mechanic:** Classic Jeopardy! game board. Categories are flashcard topics/groups. Point values: 100–500. Player picks a tile, sees the "answer" (definition), and must respond with the "question" (term). Daily Doubles hidden. Final Jeopardy at the end.

**Visual Design:**
- Blue gradient background with subtle grid pattern
- Board: 6 columns (categories) × 5 rows (point values 100/200/300/400/500)
- Category headers: styled as Jeopardy-style banners with category name
- Tiles: blue with gold text, clickable/hoverable
- Revealed tiles: faded/dimmed
- Question modal: large card showing the clue text, 10s countdown timer bar
- Response area: text input styled as "What is…?" with auto-prefill
- Score display: player score in top-left, changes animate (count up/down)
- Daily Double: tile has special glow, wager prompt before reveal
- Final Jeopardy: dramatic music-like animation (screen dims, category revealed, wager entry, then clue)

**Game State:**
- 6 categories, 5 questions each = 30 total clues (need 30 flashcards minimum)
- Categories can be auto-generated from flashcard groups or manual
- Daily Double: 1–2 hidden on the board. Player can wager up to their current score (or max of the highest point value if score is 0)
- Final Jeopardy: after all 30 clues or a "Final Jeopardy" button. One final clue, wager-based scoring
- Timer: 10s per regular clue, 15s for Daily Double, 30s for Final Jeopardy

**Scoring:**
- Correct: +point value
- Wrong: −point value
- Daily Double: correct adds wager, wrong subtracts wager
- Final Jeopardy: wager-based
- No partial credit

**Implementation Notes:**
- Pure React component, no canvas needed
- Category assignment: group flashcards by topic (from note titles or manual tags) or auto-split
- If fewer than 6 natural categories, pad with "Mixed" columns
- Point values adjustable: Easy (100–300) or Hard (200–1000) modes
- Mobile: responsive board, tiles stack on small screens
- Sound effects: correct/wrong dings, timer tick (optional, web audio API)

---

## Game 14: City Defender (Reworked City Builder)

**Mechanic:** You're the mayor of a city under constant threat. The city has buildings, walls, and citizens. Disasters strike randomly — fires, floods, earthquakes, monster attacks. Each disaster targets a specific building. To stop it, you must answer a flashcard correctly. Correct = disaster neutralized, building saved. Wrong or too slow = building takes damage or is destroyed.

Not just "answer to build" — you're actively defending. The city is already built (or builds passively over time). Your job is to protect it.

**Visual Design:**
- Side-view or isometric cityscape (think SimCity meets tower defense)
- Buildings: variety of types — houses, school, hospital, factory, power plant, skyscraper — each with health bars
- Walls: perimeter wall around city sections with HP
- Citizens: tiny dots walking around (cosmetic, flee during disasters)
- Sky: changes with time of day and weather (storms = more disasters)
- Disasters:
  - 🔥 Fire: flames spread on a building. Click the building, then answer to send fire trucks
  - 🌊 Flood: water rises from one side. Answer to deploy sandbags/pumps
  - 🦖 Monster: giant creature approaches from the edge. Answer to fire missiles/activate defenses
  - ⚡ Lightning: strikes a building. Answer quickly or it explodes
  - 🦠 Plague: green cloud spreads. Answer to deploy medical team
- Alert system: siren + red pulsing border when disaster strikes
- Resources: earn coins from saved buildings, spend on upgrades (faster fire trucks, stronger walls, auto-turrets)
- Mini-map in corner showing city layout and active threats

**Game Flow:**
1. City starts with 5–8 buildings and basic walls (pre-built, not built by player)
2. Every 30–60s: a disaster strikes a random building
3. Building flashes red, disaster animation starts (fire spreads, water rises, monster walks)
4. Player clicks the affected building
5. Flashcard question appears (definition shown, must type term)
6. Correct: disaster stops, building saved, +coins, citizens cheer
7. Wrong or timeout (10–15s): building takes damage. After 2–3 hits, building destroyed
8. Between disasters: short calm period. Spend coins on repairs/upgrades
9. New buildings are constructed automatically over time (population growth)
10. Game ends when all buildings destroyed or player survives 20 waves

**Upgrades (spend coins):**
- 🔧 Repair: restore a damaged building (+50 coins)
- 🧱 Reinforce: building takes 3 hits instead of 2 (+100 coins)
- 🚒 Fast Response: +5s to disaster timer (+150 coins)
- 🤖 Auto-Turret: automatically shoots 1 disaster without a question (+300 coins, one-time use)
- 🏥 Hospital: heals nearby buildings slowly (passive, +500 coins)
- 🛡️ Force Field: protects one building from next disaster (+200 coins)

**Scoring:**
- Building saved: +500
- Disaster survived: +100 per wave
- Perfect save (no damage): ×2 for that disaster
- All buildings intact at end: +5000 bonus
- Citizens alive multiplier (based on buildings remaining)

**Implementation Notes:**
- Canvas-based city rendering with building sprites (simple rectangles with details)
- Disaster animations: particle effects for fire, blue overlay for flood, shaking for earthquake
- Building click detection: point-in-rect
- Timers managed per-disaster
- Flashcard overlay: modal-like card that appears over the city, pauses disaster timer briefly
- City layout: pre-defined or procedurally placed buildings with roads between them
- Buildings auto-repair slowly over time if Hospital is built
- This is the most complex game — save for later in the build order

---

## Build Order (Recommended)

| Phase | Games | Effort |
|---|---|---|
| **1. Foundation** | Shared utils, types, `useGameLoop`, `useFlashcards`, scoring persistence | Setup |
| **2. Quick Wins** | Hangman, Hot Potato, Speed Sort | 1 day each |
| **3. Arcade Core** | Answer Fall, Gate Runner, Lane Dodge | 2 days each |
| **4. Retro Series** | Flappy Study, Pac-Card, Asteroids, Flashcard Tetris | 2–3 days each |
| **5. Premium** | Scatter Match, Jeopardy Board | 2–3 days each |
| **6. Flagship** | Castle Siege, City Defender | 3–4 days each |

---

## Games Rail Tab

Add a "Games" tab to NoteView and FolderView rails. The games picker shows a grid of game cards (like an arcade menu). Each game card shows:
- Game icon/emoji
- Name
- High score (if any)
- "Play" button

Clicking a game launches it full-screen (overlay or new route) with the note's/folder's flashcards as the data source.

Route pattern: `/notes/:id/games/:gameId` or use a modal overlay.
