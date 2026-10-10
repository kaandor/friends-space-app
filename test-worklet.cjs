const fs = require('fs');
const src = fs.readFileSync('src/services/rnnoise.ts', 'utf8');
const start = src.indexOf('const PROCESSOR_SRC = `');
if (start < 0) { console.error('SRC NOT FOUND'); process.exit(1); }
const end = src.indexOf('`\n\nexport', start);
console.log('start=' + start + ' end=' + end + ' fileLen=' + src.length);
const code = src.substring(start + 'const PROCESSOR_SRC = `'.length, end);

let RegCls = null;
global.sampleRate = 48000;
global.AudioWorkletProcessor = class {
  constructor() { this.port = { onmessage: null, postMessage(m) { console.log('PORT:', JSON.stringify(m)); } }; }
};
global.registerProcessor = (n, c) => { RegCls = c; };
eval(code);

const P = new RegCls();
const heap = new Float32Array(1 << 20);
let nextPtr = 1024;
let procCalls = 0;
const M = {
  HEAPF32: heap,
  _malloc: (n) => { const p = nextPtr; nextPtr += n; return p; },
  _free: () => {},
  _rnnoise_create: () => 1,
  _rnnoise_destroy: () => {},
  _rnnoise_process_frame: (st, p, q) => { procCalls++; heap.copyWithin(q >> 2, p >> 2, (p >> 2) + 480); return 1; },
};
globalThis.__fsRnnoiseFactory = () => Promise.resolve(M);
P.port.onmessage({ data: { type: 'init', wasmBytes: new ArrayBuffer(8) } });

setTimeout(() => {
  if (!P.ready) { console.error('NOT READY'); process.exit(1); }
  console.log('ready=' + P.ready + ' st=' + P.st + ' hasM=' + !!P.M);
  const N = 100, IN = [], OUT = [];
  for (let q = 0; q < N; q++) {
    const inp = new Float32Array(128), out = new Float32Array(128);
    for (let i = 0; i < 128; i++) { inp[i] = q * 128 + i; IN.push(inp[i]); }
    P.process([[inp]], [[out]]);
    for (let i = 0; i < 128; i++) OUT.push(out[i]);
  }
  // Apos o warmup, a saida deve ser a rampa de entrada completa, em ordem,
  // sem gaps (zeros) e sem reordenacao: delay pode variar +-ms (inaudivel),
  // mas cada amostra entra exatamente uma vez e em ordem => monotonica.
  let firstLive = -1;
  for (let k = 0; k < OUT.length; k++) {
    if (OUT[k] !== 0) { firstLive = k; break; }
  }
  let breaks = 0;
  let firstBreak = -1;
  for (let k = firstLive + 1; k < OUT.length; k++) {
    if (OUT[k] === 0 || OUT[k] !== OUT[k - 1] + 1) {
      breaks++;
      if (firstBreak < 0) {
        firstBreak = k;
        console.log('primeira quebra em k=' + k + ' OUT[k-2..k+2]=' + [OUT[k - 2], OUT[k - 1], OUT[k], OUT[k + 1], OUT[k + 2]].join(','));
      }
    }
  }
  const finite = OUT.every(Number.isFinite);
  console.log('warmup=' + firstLive + ' amostras (~' + (firstLive / 128).toFixed(1) + ' quanta) | finite:' + finite + ' | quebrasDeOrdem=' + breaks);
  if (firstLive < 0 || !finite || breaks > 0) process.exit(1);
  // A saida deve ser a entrada exata deslocada pela latencia do pipeline:
  // OUT[firstLive-1+k] === IN[k] (OUT[896]=IN[0]=0 por coincidencia).
  const base = firstLive - 1;
  let shiftOk = true;
  for (let k = 0; k + base < OUT.length; k++) {
    if (OUT[base + k] !== IN[k]) { shiftOk = false; console.log('divergencia em k=' + k + ' out=' + OUT[base + k] + ' in=' + IN[k]); break; }
  }
  console.log('latencia=' + base + ' deslocamentoExato:' + shiftOk);
  if (!shiftOk) process.exit(1);
  console.log('WORKLET LOGIC OK');
}, 300);
