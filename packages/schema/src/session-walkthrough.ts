export * as SessionWalkthrough from "./session-walkthrough"

import { Schema } from "effect"

const Text = Schema.String.check(Schema.isPattern(/\S/))

export class Entry extends Schema.Class<Entry>("SessionWalkthrough.Entry")({
  file: Text,
  whatChanged: Text,
  whyChanged: Text,
  concepts: Schema.Array(Text),
}) {}
