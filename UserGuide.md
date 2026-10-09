# Fantastic Four OpenCode User Guide

## Progressive debugging hints

The debugging-hint commands let a student ask for help without immediately receiving a complete solution. They are opt-in: normal OpenCode prompts continue to behave normally.

### Use the feature

1. Start OpenCode and describe the problem with `/debug-hint <problem>`.
2. OpenCode responds with `Hint 1 — Conceptual`, which identifies the relevant concept or class of defect.
3. If more help is needed, run `/debug-hint <problem>` again in the same conversation. The response advances to `Hint 2 — Targeted`, which points to a narrow code area or diagnostic experiment.
4. Run the command a third time for `Hint 3 — Specific`, which explains the faulty behavior and the requirement a correction must satisfy without supplying that correction.
5. At any point, run `/debug-solution <problem>` to explicitly request the root cause and a complete, actionable correction.

Keep related hint requests in the same conversation because OpenCode uses the earlier messages to choose the next level and avoid repeating information. If the initial problem lacks essential context, OpenCode asks a focused diagnostic question; that question does not consume a hint level.

Example:

```text
/debug-hint My loop returns the wrong total for an empty input array
/debug-hint My loop returns the wrong total for an empty input array
/debug-solution My loop returns the wrong total for an empty input array
```

### User-test the feature

Use a small reproducible bug and check the following behavior in one conversation:

- The first three `/debug-hint` responses are labeled Conceptual, Targeted, and Specific in order.
- Each later hint adds information rather than repeating the earlier hint.
- None of the hint responses contains corrected code, exact replacement text, a patch, or file edits.
- A fourth hint request offers `/debug-solution` instead of inventing another level.
- `/debug-solution` provides a complete correction only after the student explicitly requests it.
- A normal prompt outside these commands is not restricted to hint-only behavior.

Model output can vary, so manual user testing checks the response behavior. The automated contract tests are in `packages/opencode/test/command/debugging.test.ts`. They verify the three-level progression instructions, conversation-aware level selection, non-repetition rule, solution boundary, missing-context behavior, explicit solution escape hatch, command names, and argument forwarding. Together, these tests cover the deterministic command contract while the manual steps cover the model's observable response to that contract.
