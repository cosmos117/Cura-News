import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDetailedText } from "../src/utils/formatDetailedText.js";

test("detailed text formatter repairs spacing and sentence-safe paragraphs", async () => {
  const result = formatDetailedText(
    "The RSS (RSS)concluded its celebrations. It has grown rapidly while one\nof the 32 organisations it inspired expanded over the last decade. Its legacy remains contested among scholars and policymakers. Supporters cite service and reach. Critics cite exclusion and narrow leadership. The debate continues across conferences and journals. Reformers argue the network should widen its base before it plans its next cycle of expansion. Others insist that the original mission still binds the group. Both sides agree that the numbers now matter more than the arguments. Whatever the committee decides, the outcome will shape how the organisation is remembered by the people who built it.",
  );
  assert.equal(result.valid, true);
  assert.match(result.text, /\(RSS\) concluded/);
  assert.equal(result.paragraphs.length, 2);
  result.paragraphs.forEach((paragraph) => assert.match(paragraph, /[.!?]["'»”’)\]]?$/));
});

test("detailed text formatter preserves decimals and abbreviations", async () => {
  const result = formatDetailedText(
    "The report cites Rs.5.2 crore and 3.5% growth in the eastern districts. U.S. officials referred to e.g. No. 1 priorities in the review meeting. A. P. J. Abdul Kalam remains widely remembered across the country. The audit team said the figure was provisional. Officials said the final number would be published next quarter. Two departments confirmed the same total independently. The commission noted that early estimates had ranged widely. Many analysts had warned that the collection cycle was incomplete. The ministry published the underlying data alongside the statement. The final tally nonetheless matched the lower projection. The regional offices had reported a similar pattern earlier.",
  );
  assert.equal(result.valid, true);
  assert.match(result.text, /Rs\.5\.2 crore/);
  assert.match(result.text, /3\.5%/);
  assert.match(result.text, /U\.S\./);
  assert.match(result.text, /e\.g\./);
  assert.match(result.text, /No\. 1/);
  assert.match(result.text, /A\. P\. J\. Abdul Kalam/);
});

test("detailed text formatter rejects truncated output", async () => {
  assert.deepEqual(formatDetailedText("The final sentence is incomplete"), {
    valid: false,
    reason: "truncated",
  });
});

test("detailed text formatter rejects a narrative outside the word budget", async () => {
  const result = formatDetailedText("A short sentence. Another one.");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "detailed must be 90-130 words (got 5)");
});

test("detailed text formatter trims an over-long narrative at a sentence boundary", async () => {
  const sentence = "The committee reviewed the proposal in detail and asked the ministry for more data on costs.";
  const long = `${Array(5).fill(sentence).join(" ")}

${Array(5).fill(sentence).join(" ")}`;
  const result = formatDetailedText(long);
  assert.equal(result.valid, true, result.reason);
  assert.ok(result.wordCount <= 130 && result.wordCount >= 90, `${result.wordCount} words`);
  assert.equal(result.paragraphs.length, 2);
  assert.match(result.text, /costs\.$/, "ends on a complete sentence");
});
