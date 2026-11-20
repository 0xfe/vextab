// Read one experimental VexTab score on standard input and print its checked event timeline.
import { compile, limits } from './compiler.mjs';

try {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > limits.bytes) throw new Error('source-limit: Score exceeds 64 KiB');
    chunks.push(chunk);
  }
  console.log(JSON.stringify(compile(Buffer.concat(chunks).toString('utf8')), null, 2));
} catch (error) {
  console.error(error.message);
  if (error.trace?.length) console.error(JSON.stringify(error.trace));
  process.exitCode = 1;
}
