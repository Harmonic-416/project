/**
 * The one ONNX Runtime the transcription models share (Beat This!, the
 * guitar separator, YAMNet): its WebGPU build, which runs a model on the
 * graphics card when the browser offers a real one and on the CPU
 * (WebAssembly) when it doesn't. Separating a song is heavy, so the card
 * matters: one 7.8 s window of the separator takes about 0.2 s on an RTX
 * 5090 against 7 s on the CPU, with the same result (61.5 dB apart), and a
 * 3½-minute song is tabbed in under a minute instead of six.
 *
 * The build finds its .wasm with new URL(…, import.meta.url), which Vite's
 * build emits as an asset (vite.config.js keeps the package out of dev
 * pre-bundling, which would break that URL). Loaded only with import().
 */

let runtime = null

/**
 * The browser's graphics card, or null if it has none worth using: no
 * WebGPU, or only a software adapter (SwiftShader, in VMs and on
 * blocklisted cards), which is slower than WebAssembly. This only decides
 * whether to use a card at all: ONNX Runtime's WebGPU backend opens its
 * own adapter (it ignores env.webgpu.adapter), and on a laptop with two
 * cards Chrome on Windows gives it the one Windows assigns Chrome
 * (crbug.com/369219127). `gpu` is navigator.gpu, or a stand-in in the tests.
 */
export async function graphicsCard(gpu = globalThis.navigator?.gpu) {
  if (!gpu) return null
  const adapter = await gpu.requestAdapter().catch(() => null)
  if (!adapter || (adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter)) return null
  return adapter
}

/**
 * { ort, providers, gpu }: the module, the execution providers to ask for
 * (best first), and the graphics card ({ vendor, architecture }) or null.
 */
export function loadRuntime() {
  runtime ??= (async () => {
    const ort = await import('onnxruntime-web/webgpu')
    const adapter = await graphicsCard()
    if (!adapter) return { ort, providers: ['wasm'], gpu: null }
    const { vendor = '', architecture = '' } = adapter.info ?? {}
    return { ort, providers: ['webgpu', 'wasm'], gpu: { vendor, architecture } }
  })()
  return runtime
}
