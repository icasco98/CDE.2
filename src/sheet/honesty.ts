/**
 * The one line the chat adds when an answer describes a change to the plan and no action ran in that
 * message. It claims only what is certain — a command ran or it did not — and nothing about whether
 * the answer is otherwise right.
 */

export const NOTHING_PLACED = 'Nothing was placed: no command ran this message.'

/** The verbs an answer uses when it says the plan changed. */
const CHANGED =
  /\b(placed|put|moved|turned|mirrored|resized|reshaped|carved|pushed|combined|made|locked|unlocked|grouped|ungrouped|copied|cut|restored|opened|added|gave|sent back|took back)\b/i

/** The words that make such a verb a proposal or a question instead of a report. */
const OFFERED = /\b(would|shall|should|could|can|may|want me to|i'?ll|i will|going to|if you)\b/i

/**
 * Whether the answer tells the owner the plan changed. An offer or a question does not, so "shall I
 * put the diwaniya on the corner" is left alone.
 */
export const claimsChange = (text: string): boolean => {
  const said = text.trim()
  return !!said && CHANGED.test(said) && !OFFERED.test(said)
}
