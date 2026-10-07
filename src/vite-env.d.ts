/// <reference types="vite/client" />

declare module "*.wasm?url" {
  const src: string;
  export default src;
}

declare module "*.wasm" {
  const src: string;
  export default src;
}
