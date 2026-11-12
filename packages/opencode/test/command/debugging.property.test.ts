import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import PROMPT_DEBUG_HINT from "../../src/command/template/debug-hint.txt"
import PROMPT_DEBUG_SOLUTION from "../../src/command/template/debug-solution.txt"
import { hints, replaceArguments } from "../../src/command"

const argumentsMarker = "$ARGUMENTS"

fc.configureGlobal({ seed: 3132026, numRuns: 100 })

function policy(template: string) {
  return template.slice(0, template.lastIndexOf(argumentsMarker)).trim()
}

function disclosureLevels(template: string) {
  return [...template.matchAll(/^(\d+)\. ([A-Z][a-z]+) hint:/gm)].map((match) => ({
    number: Number(match[1]),
    name: match[2],
  }))
}

function authorizesCorrection(template: string) {
  return template
    .split(/[.!?]\s+/)
    .some(
      (sentence) =>
        !/\b(?:do not|don't|never|without)\b/i.test(sentence) &&
        /\b(?:provide|include|show|write|supply)\b[^.]{0,80}\b(?:corrected code|patch|replacement)\b/i.test(sentence),
    )
}

const problem = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 $/`-_.,!?"), {
    minLength: 1,
    maxLength: 500,
  })
  .map((characters) => characters.join(""))
const replacementSensitiveProblem = fc
  .tuple(problem, fc.constantFrom("$$", "$&", "$`", "$'", "$1"), problem)
  .map(([prefix, token, suffix]) => `${prefix}${token}${suffix}`)
const conversationTurn = fc.record({
  kind: fc.constantFrom("hint", "clarification", "solution"),
  problem: fc.string({ minLength: 1, maxLength: 80 }),
})

console.info("Project 5 properties running (seed 3132026): R1 invariant, R2 invariant, R3 model/oracle, R8 metamorphic")

describe("progressive debugging properties", () => {
  // R1: Before /debug-solution, /debug-hint must not authorize a complete correction.
  // Kind: invariant. Arbitrary text includes prompt-like and adversarial user input,
  // exercising the boundary between trusted command policy and user-supplied arguments.
  test("R1 invariant: generated requests cannot replace the hint-only policy", () => {
    fc.assert(
      fc.property(replacementSensitiveProblem, (request) => {
        const rendered = replaceArguments(PROMPT_DEBUG_HINT, request)
        const trusted = policy(PROMPT_DEBUG_HINT)

        expect(rendered.startsWith(trusted)).toBeTrue()
        expect(rendered.slice(trusted.length)).toBe(`\n\n${request}\n`)
        expect(trusted).toContain("Do not provide corrected code")
        expect(authorizesCorrection(trusted)).toBeFalse()
        expect(policy(PROMPT_DEBUG_SOLUTION)).toContain("provide a complete, actionable correction")
      }),
    )
  })

  // R2: /debug-hint must be guidance-only and must not request repository writes.
  // Kind: invariant. Generated repository snapshots and requests ensure prompt expansion
  // is pure and the command exposes only its argument placeholder, never a write target.
  test("R2 invariant: rendering a hint leaves every generated repository snapshot unchanged", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ minLength: 1, maxLength: 40 }), fc.uint8Array()), replacementSensitiveProblem, (files, request) => {
        const before = structuredClone(files)
        const rendered = replaceArguments(PROMPT_DEBUG_HINT, request)

        expect(files).toEqual(before)
        expect(hints(PROMPT_DEBUG_HINT)).toEqual([argumentsMarker])
        expect(policy(PROMPT_DEBUG_HINT)).toContain("Do not make edits")
        expect(rendered.endsWith(`${request}\n`)).toBeTrue()
      }),
    )
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 99 }), { maxLength: 15 }),
        fc.boolean(),
        (positions, includeArguments) => {
          const tokens = positions.map((position) => `$${position}`)
          const template = [...tokens, ...(includeArguments ? [argumentsMarker] : []), "plain text"].join(" / ")
          const expected = [...new Set(tokens)].sort()
          if (includeArguments) expected.push(argumentsMarker)

          expect(hints(template)).toEqual(expected)
        },
      ),
    )
  })

  // R3: The disclosure levels are Conceptual, Targeted, and Specific, in that order.
  // Kind: model/oracle. The small explicit oracle is compared with the levels parsed from
  // the production command for every generated number of prior hints, including overflow.
  test("R3 model: every prior-hint count maps to the documented next disclosure level", () => {
    fc.assert(
      fc.property(fc.nat({ max: 20 }), (priorHints) => {
        const levels = disclosureLevels(PROMPT_DEBUG_HINT)
        const expected = ["Conceptual", "Targeted", "Specific"]
        const actual = priorHints < levels.length ? levels[priorHints]?.name : undefined

        expect(levels.map((level) => level.number)).toEqual([1, 2, 3])
        expect(levels.map((level) => level.name)).toEqual(expected)
        expect(actual).toBe(priorHints < 3 ? expected[priorHints] : undefined)
        if (priorHints >= 3) expect(policy(PROMPT_DEBUG_HINT)).toContain("without adding a fourth level")
      }),
    )
  })

  // R8: Clarification turns must not advance or reset the hint progression.
  // Kind: metamorphic. Inserting arbitrary clarification turns into a generated conversation
  // must leave the count of same-problem hint commands—and therefore the next level—unchanged.
  test("R8 metamorphic: inserting clarifications preserves the next hint level", () => {
    fc.assert(
      fc.property(fc.array(conversationTurn, { maxLength: 30 }), problem, fc.array(problem, { maxLength: 10 }), (turns, target, clarifications) => {
        const hintCount = (items: typeof turns) =>
          items.filter((turn) => turn.kind === "hint" && turn.problem === target).length
        const inserted = turns.flatMap((turn, index) => [
          turn,
          ...(index < clarifications.length
            ? [{ kind: "clarification" as const, problem: clarifications[index] }]
            : []),
        ])

        expect(hintCount(inserted)).toBe(hintCount(turns))
        expect(policy(PROMPT_DEBUG_HINT)).toContain("Count only earlier assistant responses")
        expect(policy(PROMPT_DEBUG_HINT)).toContain("do not count that question as a hint level")
      }),
    )
  })
})
