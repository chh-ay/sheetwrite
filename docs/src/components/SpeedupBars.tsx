import story from "../generated/landing-story.json";

/**
 * The speed story on a React page: the HTML the docs generator built from the
 * committed captures, the same markup the Render page carries. Pages load this
 * component lazily, so the markup is fetched with it and not with the page. It
 * needs no client code: the switch and disclosures are form controls and
 * `<details>`.
 */
export default function SpeedupBars() {
  return (
    <div
      className="speed-story-host"
      // Built at docs generation from committed captures; every text value is escaped.
      dangerouslySetInnerHTML={{ __html: story.html }}
    />
  );
}
