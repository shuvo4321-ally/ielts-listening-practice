# IELTS Listening Practice

An interactive IELTS **Listening** practice page that reads every recording aloud using your browser's built-in voices. It works like a walkthrough book: you answer a question, then open the fold under it to see the answer, the exact words in the script that give it away, and how to deal with similar questions.

**Open it:** https://shuvo4321-ally.github.io/ielts-listening-practice/

## What's inside

| Tab | What it is |
|---|---|
| **1 Technique** | Ten short lessons with drills: predicting the answer, signpost words, spelling and number dictation, spotting distractors, and word limits. |
| **2 Full test** | One complete 40-question test in four parts, laid out like the real exam: form, notes, map, multiple choice, matching and table. Press "Mark the test" to see your score, an indicative band and which questions to review. |
| **3 Patterns** | 24 question patterns, each with its own short recording and questions. The answer fold for each question shows the evidence (yellow), the trap (pink) and the paraphrase (green) in the transcript. |
| **4 Toolkit** | Letters that sound alike, numbers, times and dates, commonly misspelled words, signpost words, and a raw score to band table. |

## Using it

- Play a recording with ▶. Use the **Voice** panel to choose a voice and a practice speed (0.8× to 1.2×). The full test always plays at 1×.
- Answers stay folded until you tap them.
- Your answers are saved in this browser only. Nothing is sent anywhere.
- The voices come from your device. Chrome and Edge on desktop sound best; on phones the voices depend on the system.

## Rebuilding the page

`index.html` is generated from the files in `src/`:

```bash
cd src
python build.py
```

`build.py` checks the content before writing the page. Every highlighted phrase has to appear word for word in its script, the full test has to be numbered exactly 1 to 40, and every gap needs a question. If any check fails, the page is not written.

| File | Contents |
|---|---|
| `src/content_test.py` | The full 40-question test |
| `src/content_patterns.py` | The 24 patterns and the technique drills |
| `src/shell.html` | Page layout and styles |
| `src/app.js` | Speech, marking, answer folds and views |

## Note

All scripts and questions here are original practice material written for this project. They are not official IELTS papers. IELTS is a registered trademark of the British Council, IDP: IELTS Australia and Cambridge University Press & Assessment, which are not connected with this project.
