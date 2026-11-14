// Plays the emulator's interleaved stereo samples and reports how many it has
// taken so far (played or dropped), which paces the emulator's frames.
class GbaAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(sampleRate * 2);
    this.read = 0;
    this.write = 0;
    this.count = 0;
    this.taken = 0;
    this.calls = 0;
    this.port.onmessage = (e) => this.push(e.data);
  }

  push(samples) {
    const buf = this.buffer;
    const frames = samples.length >> 1;
    for (let i = 0; i < frames; i++) {
      if (this.count === buf.length >> 1) {
        this.read = (this.read + 2) % buf.length;
        this.count--;
        this.taken++;
      }
      buf[this.write] = samples[i * 2];
      buf[this.write + 1] = samples[i * 2 + 1];
      this.write = (this.write + 2) % buf.length;
      this.count++;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const left = out[0];
    const right = out[1] || out[0];
    const buf = this.buffer;
    for (let i = 0; i < left.length; i++) {
      if (this.count > 0) {
        left[i] = buf[this.read];
        right[i] = buf[this.read + 1];
        this.read = (this.read + 2) % buf.length;
        this.count--;
        this.taken++;
      } else {
        left[i] = 0;
        right[i] = 0;
      }
    }
    if (++this.calls % 2 === 0) this.port.postMessage(this.taken);
    return true;
  }
}

registerProcessor('gba-audio', GbaAudioProcessor);
