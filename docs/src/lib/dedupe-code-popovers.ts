/**
 * Hover popovers are rendered inline, one panel per hovered token. A page that
 * mentions `Grid` forty times would otherwise ship forty identical panels in
 * its HTML and again in its hydration chunk. This pass keeps one panel per
 * distinct content, moves it into a hidden store at the end of the document,
 * and points every trigger at the shared panel. The runtime already moves an
 * open panel to `document.body`, so its source position does not matter.
 */

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

interface VFileLike {
  path?: string;
}

const PANEL_CLASS = "sw-code-popover__panel";

function hasClass(node: HastNode, name: string): boolean {
  const value = node.properties?.className;
  return Array.isArray(value)
    ? value.includes(name)
    : String(value ?? "")
        .split(" ")
        .includes(name);
}

/** Panel identity: its content and attributes, without the per-position id. */
function panelKey(panel: HastNode): string {
  return JSON.stringify(panel, (key, value) =>
    key === "position" || key === "id" ? undefined : value,
  );
}

function hashIdentifier(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export function dedupeCodePopovers() {
  return (tree: HastNode, file: VFileLike): void => {
    const renamed = new Map<string, string>();
    const sharedIdByKey = new Map<string, string>();
    const store: HastNode[] = [];
    // Several documents can share one page (landing snippets, showcase setup),
    // so shared ids carry a per-document prefix.
    const prefix = `sw-popover-${hashIdentifier(file.path ?? "")}`;

    const collect = (node: HastNode): void => {
      if (!node.children) return;
      node.children = node.children.filter((child) => {
        if (child.type !== "element" || !hasClass(child, PANEL_CLASS)) return true;
        const originalId = String(child.properties?.id ?? "");
        const key = panelKey(child);
        let sharedId = sharedIdByKey.get(key);
        if (sharedId === undefined) {
          sharedId = `${prefix}-${sharedIdByKey.size}`;
          sharedIdByKey.set(key, sharedId);
          store.push({ ...child, properties: { ...child.properties, id: sharedId } });
        }
        renamed.set(originalId, sharedId);
        return false;
      });
      for (const child of node.children) collect(child);
    };

    const retarget = (node: HastNode): void => {
      const target = node.properties?.dataSwCodePopoverTrigger;
      if (typeof target === "string") {
        const sharedId = renamed.get(target);
        if (sharedId !== undefined) {
          node.properties = {
            ...node.properties,
            ariaDescribedBy: sharedId,
            dataSwCodePopoverTrigger: sharedId,
          };
        }
      }
      for (const child of node.children ?? []) retarget(child);
    };

    collect(tree);
    if (store.length === 0) return;
    retarget(tree);
    tree.children = [
      ...(tree.children ?? []),
      {
        type: "element",
        tagName: "div",
        properties: { className: ["sw-code-popover-store"], hidden: true, dataPagefindIgnore: "" },
        children: store,
      },
    ];
  };
}
