class ZupulseResourceProbeProcessor extends AudioWorkletProcessor {
  process() {
    return true;
  }
}

registerProcessor("zupulse-resource-probe", ZupulseResourceProbeProcessor);
