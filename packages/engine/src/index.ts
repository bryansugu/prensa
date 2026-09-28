export { analyzeDocument, pickSamplePages, type AnalysisContext, type AnalyzeOptions } from "./analyze";
export { initCodecs, type CodecModules } from "./codecs";
export {
  compressPdf,
  openDocument,
  PasswordRequiredError,
  buildSaveOptions,
  type CompressOptions,
  type CompressOutput,
} from "./compress";
export { composeDocument, type ComposeOptions, type ComposeOutput, type ComposeSource } from "./compose";
export { estimateAll, estimateImage } from "./estimate";
export { smartParams } from "./smart";
export { compressToTarget } from "./target";
export type { ImageOutcome } from "./images/process";
export { loadMupdf, type Mu, type PDFDocument } from "./mupdf";
