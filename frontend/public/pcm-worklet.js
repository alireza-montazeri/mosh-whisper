class PCM16kWriter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
  }
  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;

    // Downsample to 16k (simple pick; fine for voice)
    const outLen = Math.floor(input.length / this.ratio);
    const down = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) down[i] = input[Math.floor(i * this.ratio)] || 0;

    // Float → int16 little-endian
    const int16 = new Int16Array(down.length);
    for (let i = 0; i < down.length; i++) {
      let s = Math.max(-1, Math.min(1, down[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage(int16);
    return true;
  }
}
registerProcessor('pcm16k-writer', PCM16kWriter);
