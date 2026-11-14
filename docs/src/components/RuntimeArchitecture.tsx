import { ArchitectureFigure } from "../art/blueprint-figures.js";

/** Runtime ownership › Architecture at a glance: who owns what, and what flows each way. */
export default function RuntimeArchitecture() {
  return (
    <figure class="sw-art-figure">
      <ArchitectureFigure />
      <figcaption>
        Ownership moves down through narrow contracts; events and resolved windows move up.
      </figcaption>
    </figure>
  );
}
