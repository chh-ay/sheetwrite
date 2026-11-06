/** Server side of `virtual:speed-story` (see speed-story-markup.ts): the story's markup. */
import html from "../generated/landing-story.html?raw";

/** The markup to inline into the server render; none when no machine has a capture. */
export const speedStoryHtml: string | null = html === "" ? null : html;

/** The server render never fetches the story. */
export const speedStoryUrl: string | null = null;
