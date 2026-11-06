/**
 * The speed story on a React page: the HTML the docs generator built from the
 * committed captures, the same markup the Render page carries. It needs no
 * client code: the switch and disclosures are form controls and `<details>`.
 */
export function SpeedupBars({ html }: Readonly<{ html: string }>) {
  return (
    <div
      className="speed-story-host"
      // Built at docs generation from committed captures; every text value is escaped.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
