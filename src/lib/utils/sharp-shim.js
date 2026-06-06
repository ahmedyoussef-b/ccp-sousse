/**
 * sharp-shim.js - Module de remplacement NO-OP pour sharp.
 * 
 * Ce shim ne charge PAS le vrai sharp (pas de require('sharp')).
 * Il est utilisé pendant le build Next.js via webpack alias pour éviter
 * que le binaire natif sharp-win32-x64.node ne déclenche ERR_DLOPEN_FAILED.
 *
 * IMPORTANT : Ce fichier doit rester SANS aucun require/import de sharp.
 */

'use strict';

function createChain() {
  const api = {
    resize:       () => api,
    extend:       () => api,
    extract:      () => api,
    trim:         () => api,
    rotate:       () => api,
    flip:         () => api,
    flop:         () => api,
    sharpen:      () => api,
    median:       () => api,
    blur:         () => api,
    flatten:      () => api,
    unflatten:    () => api,
    gamma:        () => api,
    negate:       () => api,
    normalise:    () => api,
    normalize:    () => api,
    clahe:        () => api,
    convolve:     () => api,
    threshold:    () => api,
    boolean:      () => api,
    linear:       () => api,
    recomb:       () => api,
    modulate:     () => api,
    tint:         () => api,
    greyscale:    () => api,
    grayscale:    () => api,
    pipelineColourspace: () => api,
    pipelineColorspace:  () => api,
    toColorspace: () => api,
    toColourspace: () => api,
    removeAlpha:  () => api,
    ensureAlpha:  () => api,
    extractChannel: () => api,
    joinChannel:  () => api,
    bandbool:     () => api,
    raw:          () => api,
    composite:    () => api,
    png:          () => api,
    jpeg:         () => api,
    jpg:          () => api,
    webp:         () => api,
    gif:          () => api,
    avif:         () => api,
    heif:         () => api,
    tiff:         () => api,
    withMetadata: () => api,
    withIccProfile: () => api,
    toFormat:     () => api,
    toFile:       (file, cb) => {
      if (cb) cb(null, { width: 0, height: 0, size: 0, format: 'jpeg', channels: 3 });
      return Promise.resolve({ width: 0, height: 0, size: 0, format: 'jpeg', channels: 3 });
    },
    toBuffer: (opts, cb) => {
      const info = { width: 0, height: 0, size: 0, format: 'jpeg', channels: 3, premultiplied: false };
      const buf = Buffer.alloc(0);
      if (typeof opts === 'function') { opts(null, buf, info); return; }
      if (cb) { cb(null, buf, info); return; }
      if (opts && opts.resolveWithObject) return Promise.resolve({ data: buf, info });
      return Promise.resolve(buf);
    },
    metadata: () => Promise.resolve({
      width: 0, height: 0, channels: 3, depth: 'uchar',
      format: 'jpeg', space: 'srgb', hasAlpha: false, size: 0,
    }),
    stats:    () => Promise.resolve({ channels: [], isOpaque: true, entropy: 0, sharpness: 0 }),
    limitInputPixels: () => api,
    failOn:   () => api,
    failOnError: () => api,
    sequentialRead: () => api,
    withOptions: () => api,
  };
  return api;
}

function sharp(input, options) {
  return createChain();
}

// Static methods
sharp.cache = function(opts) { return opts === false ? {} : { memory: 0, files: 0, items: 0 }; };
sharp.concurrency = function(n) { return n !== undefined ? undefined : 1; };
sharp.counters = function() { return { queue: 0, process: 0 }; };
sharp.simd = function(enable) { return false; };
sharp.format = {};
sharp.interpolators = {};
sharp.versions = { vips: '0.0.0' };
sharp.queue = { on: () => {} };
sharp.default = sharp;

module.exports = sharp;
module.exports.default = sharp;
