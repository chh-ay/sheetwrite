import { speedStoryHtml, speedStoryUrl } from "virtual:speed-story";

import { useStaticMarkup } from "../lib/static-markup.js";

/** The host's id, so hydration reads the prerendered story back from the page. */
const HOST_ID = "speed-story";

/**
 * The speed story on a React page: the markup the docs generator built from
 * the committed captures, the same markup the Render page carries. It ships in
 * the page, not in the script (see useStaticMarkup), and needs no client code:
 * the switch and disclosures are form controls and `<details>`.
 */
export default function SpeedupBars() {
  const html = useStaticMarkup(HOST_ID, speedStoryHtml, speedStoryUrl);
  return (
    <div
      className="speed-story-host"
      // Built at docs generation from committed captures; every text value is escaped.
      dangerouslySetInnerHTML={{ __html: html ?? "" }}
      id={HOST_ID}
    />
  );
}
