# vocab-quiz Project Notes

## Current shape

- React 18 + Vite + Tailwind single page app.
- The UI uses a custom Mac OS 9-inspired theme in `src/index.css` and reusable chrome/icons from `src/components/MacUI.jsx`.
- Routing uses `HashRouter`, with GitHub Pages base path `/vocab-quiz/`.
- Firebase Auth handles Google login.
- Firestore stores per-user data under `users/{uid}`:
  - `words`
  - `cycle/current`
  - `session/current`
  - `tests/{date}_{listType}`
- Excel import uses `xlsx` and expects:
  - row 1 as headers
  - column A: English word
  - column B: Korean meaning
  - columns C-G: optional examples

## Main user flows

- `WordListPage.jsx`: browse all/correct/incorrect/digested word lists, search, sort, open examples, jump to dictionary.
- `ImportPage.jsx`: import or quick-sync an Excel file; updates existing words, adds new ones, removes words missing from the Excel sheet.
- `TestPage.jsx`: start a cycle for all/correct/incorrect/digested words, enter answers, reveal meaning/examples, manually grade O/X, stop and save history.
- `HistoryPage.jsx`: browse completed test sessions and inspect each answer.
- `DictionaryPage.jsx`: opens Naver English dictionary in an iframe or external tab.

## Important behavior to preserve

- New untested words in the all-word cycle should be prioritized before previously tested words.
- Digested words should be excluded from all/correct/incorrect test cycles, but can be tested in a dedicated digested-word cycle.
- In a digested-word test, a correct answer keeps the word digested and an incorrect answer moves it to the incorrect list.
- In-progress test state is stored both in Firestore and `sessionStorage` to survive reloads.
- Test text inputs should remain at least 16px on mobile to prevent iOS focus zoom.
- If a saved test session is from a previous date, the app tries to auto-finalize it.
- Same-day tests for the same list type are merged into one `tests/{date}_{listType}` document.

## Known follow-up candidates

- Git remote currently includes an embedded personal access token; replace it with a tokenless HTTPS or SSH remote and rotate the token.
- `단어장.xlsx` is untracked. Decide whether the real workbook belongs in git.
- Production bundle is large because Firebase and `xlsx` are in the main chunk. Lazy-loading Excel import and/or dictionary can reduce the initial payload.
