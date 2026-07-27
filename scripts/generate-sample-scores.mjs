import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateRawSync } from "node:zlib";

const outputDirectory = resolve("product-assets/samples");
await mkdir(outputDirectory, { recursive: true });

const measures = [
  ["C", "E", "G", "C"],
  ["F", "A", "C", "F"],
  ["G", "B", "D", "G"],
  ["C", "E", "G", "C"],
];
const score = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>First Light Practice</work-title></work>
  <identification><creator type="composer">Zupulse</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    ${measures
      .map(
        (steps, measureIndex) => `<measure number="${measureIndex + 1}">
      ${
        measureIndex === 0
          ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>'
          : ""
      }
      <harmony><root><root-step>${steps[0]}</root-step></root><kind>major</kind></harmony>
      ${steps
        .map(
          (step, noteIndex) =>
            `<note><pitch><step>${step}</step><octave>${noteIndex === 3 ? 5 : 4}</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>`,
        )
        .join("")}
      <backup><duration>4</duration></backup>
      <note><pitch><step>${steps[0]}</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><staff>2</staff><type>whole</type></note>
    </measure>`,
      )
      .join("")}
  </part>
</score-partwise>`;

const container =
  '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';

await writeFile(
  resolve(outputDirectory, "first-light-practice.mxl"),
  createZip([
    { name: "META-INF/container.xml", data: container },
    { name: "score.musicxml", data: score },
  ]),
);

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
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
    localParts.push(local, name, data);
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
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralData = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralData, end]);
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
