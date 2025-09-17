import { extractFromTranscript } from "../src/llm/extract";
import { writeFileSync } from "fs";

const transcript = `
Hey, I’m here for a weight-loss consult. Assigned male at birth, not pregnant. 
I’m 175 cm tall and about 98 kg. Waist is roughly 38 inches.

I’ve tried diets and the gym but nothing stuck. Been above my ideal weight for about 4–5 years.

Diet is “healthy-ish,” not following anything specific. I eat out 2–3 times a week, takeaway once or twice. I snack most days. Processed food a few times a week. Fruit and veg most days. Soft drinks 2–3 a week. I don’t smoke. Sleep is under 7 hours and I’m pretty stressed with work.

Fitness feels below average. I do around 2 hours of moderate exercise a week. My weight makes running uncomfortable—a little.

No pancreatitis, gallstones, or kidney issues. I get reflux sometimes and had high cholesterol last year. Family has diabetes; no thyroid tumors or MEN. No weight-loss surgeries. I’ve never had diabetes.

Medications: none. Allergies: penicillin.

Socially it holds me back a bit, and I think it’s hurting my health quite a lot. I’m open to tablets or injections—whatever the doctor recommends. This is very important to me.

DOB 14/03/1990. Ethnicity: Caucasian. I’m in Newtown 2042, NSW. You can send results by email; I’ll share my phone later.
`;
extractFromTranscript(transcript).then((r) => {
  console.log("Raw extracted:", r);
  writeFileSync("./test/extracted.json", JSON.stringify(r, null, 2));
  return r;
});
