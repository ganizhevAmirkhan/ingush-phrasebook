/**
 * Zip staging with forward slashes (Linux-safe). No PowerShell backslashes.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function writeZip(outPath, rootDir) {
  const files = [];
  function walk(dir, prefix = "") {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs, rel);
      else files.push({ rel: rel.replace(/\\/g, "/"), abs, size: st.size, mtime: st.mtime });
    }
  }
  walk(rootDir);
  const parts = [];
  let offset = 0;
  for (const f of files) {
    const data = fs.readFileSync(f.abs);
    const nameBuf = Buffer.from(f.rel, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(f.mtime.getHours() << 11 | f.mtime.getMinutes() << 5 | (f.mtime.getSeconds() / 2), 10);
    local.writeUInt16LE(((f.mtime.getFullYear() - 1980) << 9) | ((f.mtime.getMonth() + 1) << 5) | f.mtime.getDate(), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt32LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    parts.push({ local, data, rel: f.rel, crc, size: data.length });
  }
  const chunks = [];
  const central = [];
  for (const p of parts) {
    central.push({ ...p, offset });
    chunks.push(p.local, p.data);
    offset += p.local.length + p.data.length;
  }
  const centralStart = offset;
  for (const p of central) {
    const nameBuf = Buffer.from(p.rel, "utf8");
    const hdr = Buffer.alloc(46 + nameBuf.length);
    hdr.writeUInt32LE(0x02014b50, 0);
    hdr.writeUInt16LE(20, 4);
    hdr.writeUInt16LE(20, 6);
    hdr.writeUInt16LE(0, 8);
    hdr.writeUInt16LE(0, 10);
    hdr.writeUInt16LE(p.local.readUInt16LE(10), 12);
    hdr.writeUInt16LE(p.local.readUInt16LE(12), 14);
    hdr.writeUInt32LE(p.crc, 16);
    hdr.writeUInt32LE(p.size, 20);
    hdr.writeUInt32LE(p.size, 24);
    hdr.writeUInt32LE(nameBuf.length, 28);
    hdr.writeUInt16LE(0, 30);
    hdr.writeUInt16LE(0, 32);
    hdr.writeUInt16LE(0, 34);
    hdr.writeUInt16LE(0, 36);
    hdr.writeUInt32LE(0, 38);
    hdr.writeUInt32LE(p.offset, 42);
    nameBuf.copy(hdr, 46);
    chunks.push(hdr);
    offset += hdr.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - centralStart, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  chunks.push(end);
  fs.writeFileSync(outPath, Buffer.concat(chunks));
}

module.exports = { writeZip };
