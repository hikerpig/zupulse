import { mkdir, writeFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { resolve } from "node:path";

const root = resolve("test-fixtures/musicxml/generated");
await mkdir(root, { recursive: true });
const score = (title, parts = 1, extra = "") => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>${title}</work-title></work><part-list>${Array.from({ length: parts }, (_, i) => `<score-part id="P${i + 1}"><part-name>Part ${i + 1}</part-name></score-part>`).join("")}</part-list>${Array.from({ length: parts }, (_, i) => `<part id="P${i + 1}"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>${i === 0 ? "<staves>2</staves>" : ""}</attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>${extra}</measure></part>`).join("")}</score-partwise>`;
const fixtures = {
  "single-voice.musicxml": score("Single Voice"),
  "piano-multistaff.musicxml": score("钢琴双谱表"),
  "multi-part.musicxml": score("Quartet", 4),
  "large-score.musicxml": score("Large Score", 6),
  "repeat-ending.musicxml": score("Repeat", 1, `<barline location="right"><repeat direction="backward"/></barline>`),
  "lyrics-pickup.musicxml": score("中文歌曲", 1, `<note><lyric><text>你好</text></lyric></note>`),
  "harmony-written-time.musicxml": `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>Written Time</work-title></work><part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>7</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>7</duration><voice>1</voice></note><backup><duration>7</duration></backup><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><time-modification><actual-notes>7</actual-notes><normal-notes>4</normal-notes></time-modification></note><forward><duration>6</duration></forward><attributes><divisions>11</divisions></attributes><note><pitch><step>G</step><octave>4</octave></pitch><duration>5</duration><voice>2</voice></note></measure></part></score-partwise>`,
  "timewise.musicxml": `<?xml version="1.0"?><score-timewise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><measure number="1"><part id="P1"><note><rest/><duration>4</duration></note></part></measure></score-timewise>`,
  "empty.musicxml": `<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>`,
  "malformed.musicxml": `<score-partwise><part>`,
};
for (const [name, contents] of Object.entries(fixtures)) await writeFile(resolve(root, name), contents);
await writeFile(
  resolve(root, "simple.mxl"),
  zip([
    {
      name: "META-INF/container.xml",
      data: `<container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`,
    },
    { name: "score.musicxml", data: fixtures["single-voice.musicxml"] },
  ]),
);
await writeFile(resolve(root, "broken.mxl"), new Uint8Array([0x50, 0x4b, 3, 4]));

function zip(entries) {
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const input = Buffer.from(entry.data);
    const data = deflateRawSync(input);
    const crc = crc32(input);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(input.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(input.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralData = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralData, end]);
}
function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
