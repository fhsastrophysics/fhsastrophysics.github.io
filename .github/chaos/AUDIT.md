# Chaos audit, November 24, 2026

A seeded random user plus one test per bug, run in headless Chromium and WebKit on 12 emulated devices.
This folder is under `.github/` because GitHub Pages never serves that directory (checked: 404 live).

## Run it

```
cd .github/chaos
npm i && npx playwright install chromium-headless-shell webkit     # first time only
npm test                                                            # everything: tests, then the monkey
node run.mjs tests --only "photo"                                   # tests whose name matches
node run.mjs monkey --seed 100 --seeds 4 --steps 150                # more random runs
node run.mjs monkey --seed 100 --seeds 1 --engine webkit --profile iphone     # replay one
node run.mjs tests --root /path/to/another/copy                     # same checks on another copy of the site
node shots.mjs ../.. out/shots                                      # screenshots of every page and viewer at 15 sizes
```

A failing run prints its seed and last actions, and saves the whole trace and a screenshot in `out/`.
Choices depend on what is on screen, so a replay can drift if the page is slower or faster that time; the trace file has the exact actions.
Nothing leaves the machine: other sites are blocked (Google Fonts is fetched once and cached), new tabs, mail links and the sign-up form are recorded and never followed.

## Result

| | live site (8e9414b) | this branch |
|---|---|---|
| Tests | 170 of 274 pass | 278 of 278, twice in a row (4 tests were added after the live count) |
| Monkey | 0 of 24 runs clean (seed 10) | 48 of 48 clean on the final code (seeds 61-62). Earlier builds of the branch: 48/48 on seeds 31-32, 41-42 and 51-52. A third full pass on the final code was cut short |

## Bugs fixed

Severity: A = a visitor loses the page, a tap or their place. B = wrong or cut-off content. C = keyboard, screen reader, rare browsers.

| # | Sev | Where | Bug | Root cause | Fix | Test |
|---|---|---|---|---|---|---|
| 1 | B | phone, all | About slid off its left margin; the home hero slid up under the menu and stayed there. Reproduced with `scrollIntoView`, the call find-in-page and assistive tech make; Tab and drag-select did not trigger it | `overflow:hidden` boxes still scroll when something inside is brought into view, and nothing scrolls them back | `overflow:clip` on every page and the hero (hidden kept as fallback), `flow-root` to keep the margins | "in-page find / scrollIntoView", rule `inner-scroll` |
| 2 | A | all | Change page while a scroll is still gliding (Space, PageDown, End): the new page opens part-way down, or past its end in empty sky | the glide survived the jump to top; `scroll-behavior:smooth` on `html` made more glides | removed that rule; the router holds a new page at its top until the glide dies or the person scrolls | "a scroll still gliding", rule `scrolled-past-end` (monkey seed 12) |
| 3 | A | desktop | A second link clicked during the light-speed jump was ignored | `transitioning` lock dropped the click for 1.35 s | the jump retargets before its swap and restarts after it | "the last link clicked wins" |
| 4 | A | desktop | Back during the jump was undone half a second later | the jump's timers were never cancelled | one `jump` object, cancelled whenever history moves | "Back during the light-speed jump wins" |
| 5 | A | all | Open a meeting link, go elsewhere within 0.4 s: the preview opened over the wrong page and rewrote the address | an unguarded timer | one timer, checked against the address and page when it fires | "leaving a meeting link" |
| 6 | A | phone | Tap the menu while a meeting link loads: menu and preview open on top of each other | menu and viewers locked the page separately | one `refreshPageLock()` reads the real state; opening a viewer closes the menu | "opening the menu while a meeting link is loading" |
| 7 | A | all | Close a viewer and quickly open another: the second vanished | `history.back()` is asynchronous and popped the new one | closing is instant; anything that would touch history waits for the pop | "double Escape / Escape-then-reopen" |
| 8 | A | all | One exception at start-up (an odd browser, no canvas) left a blank site | every part ran in a row before the router, with no guard | each part is guarded; canvas and IntersectionObserver failures handled | "broken browser: ..." |
| 9 | A | all | No JavaScript, or `app.js` not loading: blank sky | every page starts `display:none` | `<noscript>` style and an `onerror` class show the pages | "without JavaScript" |
| 10 | B | all | A meeting link opened over another preview changed the address but not the preview | the handler skipped when a preview was open | `syncToUrl()` always shows the meeting in the address | "a meeting link opened while another" (seeds 1, 10, 11) |
| 11 | B | all | Forward could never get past an old photo or atlas entry | the router bounced back off those entries | entries say what they show, so Forward and reload reopen it | "Back and Forward step through" |
| 12 | B | phone | "Meeting Archive" cut off at 320 px | the title was one unbreakable line | letters group into words, words wrap | "nothing is cut off at any width" |
| 13 | B | phone | Under 320 px, or with large text: club name under the menu button, hero and cards off the right edge; menu button outside its margin at 320 px | fixed minimum widths; px breakpoints ignore text size | sizes shrink below 340 px, hero column can shrink, nav breakpoints in em | same, at 260, 280 px and 150% text |
| 14 | B | phone | Small tap targets on Join and FAQ (35 to 42 px) | neighbouring hit areas overlapped | spaced to 44 px or more (Join is 24 px longer on touch, FAQ 11 px) | "touch targets are at least 44px" |
| 15 | B | all | A photo that fails to load left an empty viewer | no error handler; the image stays at opacity 0 | falls back to the thumbnail, then its description | "a photo that fails to load" |
| 16 | B | all | "Copied" was shown even when copying failed | the toast ran on failure too | shows the address itself instead | "copy button says it copied only when it did" |
| 17 | B | phone | Touching a link to a taller page lengthened the page under the finger | the pre-built page overflowed | `.router` clips | "iOS rule" |
| 18 | C | all | Holding Enter on a card opened and closed its viewer over and over, filling history | key repeat pressed the close button focus had moved to | repeats of Enter and Space on controls are ignored | "holding Enter" |
| 19 | C | all | The invisible Back-to-top button took keyboard focus | opacity 0 only | `visibility:hidden` while hidden; using it moves focus to the page | "an invisible Back-to-top" |
| 20 | C | all | Keyboard focus lost after a link inside a page, "See all photos", or closing the menu | focused element disappeared | focus goes to the new heading, the first new photo, the menu button | three focus tests |
| 21 | C | all | Titles read letter by letter by screen readers | a span per letter | the heading carries its own label | "screen readers hear" |
| 22 | C | desktop | Alt/Cmd+arrow in the photo viewer also changed the photo | modifiers not checked | ignored with a modifier | "arrow keys with a modifier" |
| 23 | C | desktop | Astronaut stayed "grabbed" after a cancelled drag | only `pointerup` was handled | `pointercancel` and `blur` too | "the astronaut lets go" |
| 24 | C | all | `#about`, `#//team`, `#/team?x` went Home; `#Meeting-...` not recognised | strict parsing | forgiving parsing | "loose and broken addresses" |
| 25 | C | all | Em dash in photo descriptions | copy rule missed an alt text | comma | "no em dashes" |
| 26 | C | touch laptop | Dragging a link in WebKit left a pre-built page in the layout | no pointerup or pointercancel after a native drag | dropped on dragstart, and a press expires by itself | "a press on a link that never ends" (seeds 2, 11, 12) |

The monkey also caught one mistake made during this audit: Back within 350 ms of a tap left `body.warping` set (seed 100, step 40). Covered by "Back right after a tap". Bug 2 needed a second fix: on a busy machine Chrome lands an old glide about 0.8 s late.

## Rules that keep these from coming back

1. **Clip, don't hide.** Any full-page or full-width wrapper uses `overflow:clip`. `overflow:hidden` is for small boxes that cannot overflow in a way that matters.
2. **One owner per piece of state.** History is read only in `syncToUrl()`. Page locking (inert, scroll lock) is written only in `refreshPageLock()`. Viewers open and close only through `showOverlay` / `requestClose`.
3. **Every timer is cancellable and re-checks the world when it fires.** Never assume the page is still the one that set it.
4. **`history.back()` is asynchronous.** Go through `popOwnEntry()` and `waitForPop()`.
5. **Never drop a tap or click because something is animating.** Redirect or restart.
6. **Invisible means `visibility:hidden`,** not just opacity 0, for anything focusable.
7. **When a focused thing disappears, say where focus goes.**
8. **New start-up code goes in the guarded list in `boot()`.**
9. **Touch targets: 44 px, and neighbours' hit areas must not overlap.** Grow the hit area with `::after`, not the look.
10. **No smooth scrolling on `html`.** Ask for it by name where it is wanted.
11. The existing phone rules still stand: nothing clickable becomes visible on touchstart or hover, no per-element filters or blend modes on touch, instant swap on touch.
12. **Run `npm test` before pushing,** and add a failing test before fixing any new bug.

## Not fixed, for Abir

- The FAQ says "around 1:00 PM"; the card says 12:55 PM. The page description says thirteen meetings and sixteen handouts, which is out of date.
- The browser tab title is the same on every page. Per-page titles would be new copy.
- Back always lands at the top of a page. Restoring the old scroll position would undo a choice made on purpose.
- Back with the phone menu open changes page instead of only closing the menu.
- `fhsastrophysics.github.io/meetings` (no `#`) is GitHub's own 404 page. A small `404.html` could forward it.
- The repo root is published, so `README.md` and `CLAUDE_CODE_HANDOFF.md` are public on the site.

## Not tested

No Firefox. No real iPhone or iPad, and no iOS Simulator (Xcode is not installed on this Mac). Playwright's WebKit is Safari's engine without iOS touch handling, its toolbars, or its memory limits; the tap-swallow rule is checked by emulation. Trusted swipes and pinches run in Chromium only. Screen readers were not used; only what they rely on was checked. Enlarged browser text above phone widths is fixed with em breakpoints but could not be emulated.
