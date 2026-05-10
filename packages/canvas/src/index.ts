/**
 * @novelcut/canvas
 *
 * DAG canvas for storyboard editing. Built on @xyflow/react.
 *
 * Node kinds:
 *   - chapter       (source novel chapter — read-only origin)
 *   - event         (extracted story event)
 *   - episode       (a planned episode unit)
 *   - script        (the script for an episode)
 *   - shot          (a single shot, image-prompt + video-prompt seeds)
 *   - asset:char    (character reference sheet)
 *   - asset:scene   (location reference)
 *   - asset:prop    (prop / costume reference)
 *   - image         (generated still)
 *   - video         (generated clip)
 *
 * Edge kinds:
 *   - derives_from  (causal lineage in the pipeline)
 *   - references    (a shot referencing an asset)
 */
export { default as StoryboardCanvas } from "./StoryboardCanvas.js";
export type { CanvasNode, CanvasEdge, NodeKind, EdgeKind } from "./types.js";
