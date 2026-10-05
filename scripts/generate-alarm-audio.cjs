const fs = require("node:fs");
const path = require("node:path");

const sampleRate = 44100;
const durationSeconds = 2.4;
const tones = {
  classic: { frequencies: [880, 660, 880, 660], pulse: 0.22 },
  digital: { frequencies: [1047, 1319, 1047, 1319], pulse: 0.16 },
  bell: { frequencies: [659, 988, 1319], pulse: 0.34 },
  gentle: { frequencies: [523, 659, 784], pulse: 0.42 },
};

const outputDirectory = path.join(__dirname, "..", "public", "audio");
fs.mkdirSync(outputDirectory, { recursive: true });

for (const [name, definition] of Object.entries(tones)) {
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const slot = Math.floor(time / definition.pulse);
    const withinPulse = time % definition.pulse;
    const sounding = slot % 2 === 0 && time < 1.75;
    const frequency = definition.frequencies[Math.floor(slot / 2) % definition.frequencies.length];
    const envelope = Math.min(1, withinPulse / 0.02) * Math.min(1, (definition.pulse - withinPulse) / 0.04);
    const sample = sounding ? Math.sin(2 * Math.PI * frequency * time) * envelope * 0.82 : 0;
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }

  fs.writeFileSync(path.join(outputDirectory, `${name}.wav`), buffer);
}
