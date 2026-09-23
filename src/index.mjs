import { pathToFileURL } from "node:url";

export function bootMessage() {
  return "Games skeleton ready. See docs/product.md for what ships next.";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(bootMessage());
}
