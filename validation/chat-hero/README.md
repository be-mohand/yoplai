# E2E: Chat "new chat hero" (real app)

Date: 2026-09-13. Isolated gateway/web on 127.0.0.1:4100/3101, own YOPLAI_HOME.

- 77-real-dark-sugg.png: dark hero, 2 suggestion cards; rail pill/grid x=423..1107;
  pill->slot gap 28px by design (slot top 6px + zone padding 22px).
- 78-real-dark-note.png: dark hero, no suggestions -> note rendered, color #8a8a8a (AA).
- 71/72 (light): hero centered, avatar 72px r20, one-liner 28px, note #6b6b6b,
  pill/suggestions/composer same rail (mock parity per vision review).
- 73-real-mid.png: mid-slide frame, rail locked, hero fading.
- 75-real-sent2.png: composer docked after send; transcript blank due to known
  pre-existing gateway issue (failed run drops session entry; simple history then
  returns empty). Gateway-side, deferred.

Slide trace (real app): 651,663,667,668,668... smooth, no jump (~200ms).
Unit: 432 web tests pass; tsc + eslint clean.
