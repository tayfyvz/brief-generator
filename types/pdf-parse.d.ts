/**
 * pdf-parse's package entry runs demo code when bundled, so we import the
 * lib file directly — declare it with the same shape as the typed entry.
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
