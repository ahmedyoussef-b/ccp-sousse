// Project shims to suppress third-party and dynamic import typing errors
declare module 'heic-convert';
declare module 'libheif-js';
declare module 'libheif-js/*';
declare module 'sharp';
declare module 'jimp';
declare module 'heic-convert';
declare module '*.wasm';

declare const existingPrep: any;

declare namespace NodeJS {
  interface Global {
    [key: string]: any;
  }
}

declare var existingPrep: any;

globalThis.existingPrep = globalThis.existingPrep || ({} as any);
