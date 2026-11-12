import { parseCellReference } from "./cell-reference.js";
import { MAIN_NAMESPACES } from "./format.js";
import { OpcPackage, type OpcRelationship, relationshipTypeMatches } from "./opc.js";
import { readerFailure, displayText } from "./reader-values.js";
import { emitWarning, type XlsxCodecContext } from "./resources.js";
import { assertXmlRoot, xmlAttribute, xmlChild, xmlChildren } from "./xml.js";

export function parseComments(
  packageFile: OpcPackage,
  sheetPart: string,
  relationships: readonly OpcRelationship[],
  context: XlsxCodecContext,
): { comments: { row: number; col: number; text: string }[]; present: boolean } {
  const relationship = relationships.find(
    (candidate) => relationshipTypeMatches(candidate.type, "comments") && !candidate.external,
  );
  if (!relationship) return { comments: [], present: false };
  const root = packageFile.readXml(relationship.target);
  assertXmlRoot(root, "comments", MAIN_NAMESPACES, relationship.target);
  const list = xmlChild(root, "commentList");
  if (!list) return { comments: [], present: true };
  const comments = xmlChildren(list, "comment").map((comment) => {
    const reference = xmlAttribute(comment, "ref");
    if (!reference) return readerFailure(`comment in ${sheetPart} has no cell reference`);
    const address =
      parseCellReference(reference) ?? readerFailure(`cell reference ${reference} is invalid`);
    const text = xmlChild(comment, "text") ?? comment;
    if (xmlChildren(text, "r").length > 0) {
      emitWarning(context, {
        code: "rich-text",
        message: "Comment rich text formatting was flattened",
        part: relationship.target,
        cell: reference,
      });
    }
    return { ...address, text: displayText(text) };
  });
  return { comments, present: true };
}
