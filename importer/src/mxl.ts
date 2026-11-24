// Read the two selected ZIP members with the platform inflater and explicit archive budgets.
import { musicXMLReader } from './musicxml-reader.js';
import { convertPrepared, Input, targetVersion } from './score.js';
import { treeReader, xmlLimit } from './xml.js';
import type { MusicXMLOptions, ImportResult } from './types.js';

interface Member {
  offset: number;
  method: number;
  flags: number;
  compressed: number;
  size: number;
  checksum: number;
}
const directoryName = 'META-INF/container.xml';
const decoder = new TextDecoder('utf-8', { fatal: true });

/** Internal failures describe archive structure independently of any XML member location. */
class ArchiveError extends Error {}
class ArchiveLimit extends ArchiveError {}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ArchiveError(message);
}

/** Index the central directory. ZIP64, split, encrypted and oversized archives are outside this profile. */
function directory(data: Uint8Array, view: DataView) {
  check(data.length >= 22 && data.length <= 16 * 1024 * 1024, 'Invalid or oversized ZIP archive.');
  const word = (n: number) => view.getUint16(n, true),
    long = (n: number) => view.getUint32(n, true);
  let end = data.length - 22;
  while (
    end >= Math.max(0, data.length - 65557) &&
    (long(end) !== 0x06054b50 || end + 22 + word(end + 20) !== data.length)
  )
    end--;
  check(end >= Math.max(0, data.length - 65557), 'Missing ZIP directory.');
  const count = word(end + 10),
    start = long(end + 16);
  check(
    !long(end + 4) && word(end + 8) === count && count <= 256 && start + long(end + 12) === end,
    'Unsupported ZIP directory.',
  );
  const result = new Map<string, Member>();
  let cursor = start,
    total = 0;
  for (let i = 0; i < count; i++) {
    check(cursor + 46 <= end && long(cursor) === 0x02014b50, 'Invalid ZIP member.');
    const nameStart = cursor + 46,
      nameEnd = nameStart + word(cursor + 28);
    check(nameEnd <= end, 'Truncated member name.');
    const name = decoder.decode(data.subarray(nameStart, nameEnd));
    check(
      name &&
        !result.has(name) &&
        !name.startsWith('/') &&
        !/[\\:\x00]/.test(name) &&
        !name.split('/').some((piece) => piece === '..' || piece === '.'),
      'Invalid or repeated member path.',
    );
    const size = long(cursor + 24);
    total += size;
    check(total <= 32 * 1024 * 1024, 'Expanded ZIP members exceed 32 MiB.');
    result.set(name, {
      offset: long(cursor + 42),
      method: word(cursor + 10),
      flags: word(cursor + 8),
      compressed: long(cursor + 20),
      size,
      checksum: long(cursor + 16),
    });
    cursor = nameEnd + word(cursor + 30) + word(cursor + 32);
  }
  check(cursor === end, 'Invalid ZIP directory length.');
  return { members: result, start };
}

/** A 1 KiB lookup table keeps CRC-32 verification linear in expanded source bytes. */
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc;
});
function updateCRC(crc: number, bytes: Uint8Array) {
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 255];
  return crc;
}

/** Node 22.18+ exposes built-ins without a bundler import. One bounded zlib chunk avoids
 * allocating a second copy of large members. Browsers use their streaming inflater below.
 */
function inflateNode(packed: Uint8Array, size: number) {
  type Zlib = {
    inflateRawSync: (data: Uint8Array, options: { maxOutputLength: number; chunkSize: number }) => Uint8Array;
  };
  const platform = globalThis as { process?: { getBuiltinModule?: (name: string) => Zlib | undefined } };
  const zlib = platform.process?.getBuiltinModule?.('node:zlib');
  return zlib?.inflateRawSync(packed, { maxOutputLength: Math.max(1, size), chunkSize: Math.max(64, size + 1) });
}

/** Check the central entry, local header and path before inflation starts. */
function member(
  data: Uint8Array,
  view: DataView,
  index: ReturnType<typeof directory>,
  name: string,
  limit: number,
) {
  const entry = index.members.get(name);
  check(entry, 'Missing MXL member ' + name + '.');
  if (entry.size > limit)
    throw new ArchiveLimit(
      name +
        ' declares ' +
        entry.size +
        ' expanded bytes; limit is ' +
        limit +
        '. Select a part or measure range, or opt into the extended profile for larger XML.',
    );
  const { offset, method, flags, compressed, size } = entry;
  check(
    offset + 30 <= index.start &&
      view.getUint32(offset, true) === 0x04034b50 &&
      !(flags & ~0x80e) &&
      view.getUint16(offset + 6, true) === flags &&
      view.getUint16(offset + 8, true) === method,
    'Unsupported ZIP member header.',
  );
  const nameEnd = offset + 30 + view.getUint16(offset + 26, true);
  const start = nameEnd + view.getUint16(offset + 28, true);
  check(
    start + compressed <= index.start && decoder.decode(data.subarray(offset + 30, nameEnd)) === name,
    'Invalid member bounds.',
  );
  const packed = data.subarray(start, start + compressed);
  check(method === 0 || method === 8, 'Only stored and deflated ZIP members are supported.');
  if (method === 0) check(compressed === size, 'Stored member size differs.');
  return { packed, entry };
}

/** Verify CRC and actual expansion length before allowing parsed content to escape the archive reader. */
async function consume(source: ReturnType<typeof member>, write: (chunk: Uint8Array) => void) {
  const { entry, packed } = source;
  function verify(size: number, crc: number) {
    check(
      size === entry.size && (crc ^ 0xffffffff) >>> 0 === entry.checksum,
      'Inflated member length or checksum differs.',
    );
  }
  const direct = entry.method === 0 ? packed : inflateNode(packed, entry.size);
  if (direct) {
    verify(direct.length, updateCRC(0xffffffff, direct));
    write(direct);
    return;
  }
  // Backpressure limits the inflater's native output queue. A densely compressed member must not expand
  // into a single full-size staging buffer before the SAX parser gets its first measure.
  let offset = 0;
  const compressed = new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (offset === packed.length) {
        controller.close();
        return;
      }
      const next = Math.min(offset + 4096, packed.length);
      controller.enqueue(new Uint8Array(packed.subarray(offset, next)));
      offset = next;
    },
  });
  const reader = compressed.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  let size = 0,
    crc = 0xffffffff;
  let parseFailure: { error: unknown } | undefined;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      check(size <= entry.size, 'Inflated member exceeds its declared size.');
      crc = updateCRC(crc, value);
      if (!parseFailure) {
        try {
          write(value);
        } catch (error) {
          parseFailure = { error };
        }
      }
      // Only the native inflater owns this full output buffer. Caller-supplied archives and
      // stored-member views never enter this branch. Drop its backing store after both consumers
      // finish, including when we must keep reading for a CRC failure after a source error.
      if (value.byteOffset === 0 && value.byteLength === value.buffer.byteLength) {
        const owned = value.buffer as ArrayBuffer & { transfer?: (size: number) => ArrayBuffer };
        owned.transfer?.(0);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  verify(size, crc);
  if (parseFailure) throw parseFailure.error;
}

/** The first declared rootfile designates the score, independently of ZIP member order. */
export async function importMXL(data: Uint8Array, options: MusicXMLOptions = {}): Promise<ImportResult> {
  const archive = options.filename ?? 'score.mxl';
  const input = new Input(archive + '!/' + directoryName, options);
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const index = directory(data, view);
    const metadata = member(data, view, index, directoryName, 65536);
    const containerReader = treeReader(metadata.entry.size, false, input);
    await consume(metadata, containerReader.bytes);
    const container = containerReader.finish();
    const root = container.children
      .find((c) => c.name === 'rootfiles')
      ?.children.find((c) => c.name === 'rootfile');
    check(
      container.name === 'container' && root?.attributes['full-path'],
      'Missing MusicXML rootfile declaration.',
    );
    const name = root.attributes['full-path'];
    const score = member(data, view, index, name, xmlLimit(options));
    const scoreInput = new Input(archive + '!/' + name, options);
    let reader: ReturnType<typeof musicXMLReader> | undefined;
    const getReader = () => (reader ??= musicXMLReader(score.entry.size, false, scoreInput, options));
    try {
      await consume(score, (chunk) => getReader().tree.bytes(chunk));
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      // Structured MusicXML failures retain their source file and range. Runtime inflater errors go to the outer archive handler.
      return convertPrepared(scoreInput, () => {
        throw error;
      });
    }
    return convertPrepared(scoreInput, () => getReader().finish());
  } catch (error) {
    const diagnostics = error instanceof ArchiveError ? [] : input.diagnostics;
    if (!diagnostics.length)
      diagnostics.push({
        code: error instanceof ArchiveLimit ? 'limit' : 'syntax',
        severity: 'error',
        file: archive,
        range: [0, 0],
        message: error instanceof Error ? error.message : 'Invalid MXL archive.',
      });
    return { status: 'failed', documents: [], diagnostics, target: targetVersion(options) };
  }
}
