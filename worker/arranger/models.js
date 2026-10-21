import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * The arranger's models, for Node: the same ones the app runs in the
 * browser (the app's own files, so both arrange alike), on the CPU with
 * ONNX Runtime's native build. Basic Pitch and TensorFlow.js come from
 * app/node_modules, so the app's code (refineWithBasicPitch.js) and this
 * file share one TensorFlow.js; run `npm --prefix app ci` first.
 *   separator  htdemucs_6s (55 MB), downloaded once into CACHE_DIR
 *   beats      Beat This! (app/public/beat-this/)
 *   basicPitch Basic Pitch (app/node_modules/@spotify/basic-pitch/model/)
 */

const app = new URL('../../app/', import.meta.url)
const appRequire = createRequire(new URL('package.json', app))
const tf = appRequire('@tensorflow/tfjs')
const { BasicPitch } = appRequire('@spotify/basic-pitch')

const SEPARATOR_URL =
  'https://huggingface.co/Andremi/audioweb-models/resolve/953d0a9e46fd364860c9413ee4c7a9aa4fbcae4b/demucs_htdemucs_6s_s78_fp16w_ca.onnx'

async function separatorBytes(cacheDir) {
  mkdirSync(cacheDir, { recursive: true })
  const file = join(cacheDir, 'htdemucs_6s_s78_fp16w_ca.onnx')
  if (!existsSync(file)) {
    console.log('[models] downloading the separator (55 MB) …')
    const response = await fetch(SEPARATOR_URL)
    if (!response.ok) throw new Error(`separator download: HTTP ${response.status}`)
    writeFileSync(`${file}.part`, Buffer.from(await response.arrayBuffer()))
    renameSync(`${file}.part`, file)
  }
  return new Uint8Array(readFileSync(file))
}

function basicPitchFromDisk() {
  const dir = new URL('node_modules/@spotify/basic-pitch/model/', app)
  const json = JSON.parse(readFileSync(new URL('model.json', dir), 'utf8'))
  const weights = readFileSync(new URL('group1-shard1of1.bin', dir))
  const handler = {
    load: async () => ({
      modelTopology: json.modelTopology,
      format: json.format,
      generatedBy: json.generatedBy,
      convertedBy: json.convertedBy,
      weightSpecs: json.weightsManifest.flatMap((m) => m.weights),
      weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength),
    }),
  }
  return new BasicPitch(tf.loadGraphModel(handler))
}

async function onnxRuntime() {
  try {
    return await import('onnxruntime-node')
  } catch (err) {
    console.warn(`[models] onnxruntime-node unavailable (${err.code ?? err.message}); using onnxruntime-web`)
    return appRequire('onnxruntime-web')
  }
}

/**
 * TensorFlow.js on its WebAssembly backend (installed into app/node_modules
 * by setup.sh, to share the app's TensorFlow.js): ~25× faster than its
 * JavaScript one, and unlike tfjs-node it needs no AVX, which a Proxmox VM
 * with the default CPU type doesn't have.
 */
async function fastTensorFlow() {
  try {
    appRequire('@tensorflow/tfjs-backend-wasm')
    if (await tf.setBackend('wasm')) {
      // 3.21's wasm Fill fails ("Unknown dtype undefined") when the graph gives no dtype: default it, as the CPU backend does.
      const fill = tf.getKernel('Fill', 'wasm')
      tf.unregisterKernel('Fill', 'wasm')
      tf.registerKernel({
        ...fill,
        kernelFunc: (args) => fill.kernelFunc({ ...args, attrs: { ...args.attrs, dtype: args.attrs.dtype ?? (typeof args.attrs.value === 'string' ? 'string' : 'float32') } }),
      })
      return
    }
  } catch (err) {
    console.warn(`[models] TensorFlow.js wasm backend unavailable (${err.code ?? err.message}); Basic Pitch will be slow`)
  }
  await tf.setBackend('cpu')
}

/** { runtime, separator, beats, basicPitch }, as arrangeAudio's `models`. */
export async function loadModels({ cacheDir }) {
  await fastTensorFlow()
  await tf.ready()
  console.log(`[models] TensorFlow.js backend: ${tf.getBackend()}`)
  return {
    runtime: await onnxRuntime(),
    separator: await separatorBytes(cacheDir),
    beats: new Uint8Array(readFileSync(new URL('public/beat-this/small0.onnx', app))),
    basicPitch: basicPitchFromDisk(),
  }
}
