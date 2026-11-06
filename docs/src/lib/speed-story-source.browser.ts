/** Browser side of `virtual:speed-story` (see speed-story-markup.ts): the story's asset URL. */
import url from "../generated/landing-story.html?url";

/** The browser reads the prerendered story from the page, never from its script. */
export const speedStoryHtml: string | null = null;

/** Where the browser fetches the story after a client-side navigation. */
export const speedStoryUrl: string | null = url;
