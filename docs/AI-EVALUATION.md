# AI evaluation and product research plan

## Evaluation question
When an accessibility rule fails, does AI add meaningful, correct, actionable guidance beyond standard axe descriptions — without inventing evidence?

## Inputs and fixtures
Start with the five synthetic issue types in `server/demo.js` (form label, button name, alternative text, contrast, headings). Expand to 20+ intentionally inaccessible fixtures hosted on an authorized development domain. Keep explicit ground truth for target selector, rule, diagnosis, expected remediation, and user impact.

## Evaluation rubric (0–2 per dimension)
| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Evidence grounding | Invents issue | Partly grounded | Accurately cites supported issue |
| Technical correctness | Incorrect fix | Partial fix | Valid fix for context |
| Accessibility impact | Wrong/missing | General | Specific and accurate |
| Clarity | Unusable jargon | Adequate | Clear next step |
| Verification | No instructions | Vague | Includes practical verification |

A human reviewer should blind-score AI outputs and a non-AI baseline. Track issue-level exact-match IDs, unsupported claims count, rubric distribution, request latency and per-scan API usage. Reject ungrounded content. Record key prompt iterations with examples instead of claiming improvement without evidence.

## UX evaluation
Ask participants to complete four tasks: select the most urgent finding, explain the issue to a nontechnical teammate, identify HTML evidence, and record how a fix was verified. Note success, hesitation, interpretation of score, and misunderstanding of automated vs AI-generated results. Recruit accessibility specialists if possible. Test keyboard/screen-reader use of AccessBloom itself.

## Known limitations
- axe cannot detect all accessibility defects; no conformance certification.
- Dynamic state, authentication and complex interactions are out of scope for single-page automated scans.
- The heuristic score intentionally overweights critical issues; it is not a WCAG measurement.
- Real browser scanning and live OpenAI generation require deployment, browser binaries and a provider key.
- The synthetic demonstration does not represent independent real-world testing.
