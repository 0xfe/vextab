// Build one snapshot, backfill tagged releases, or explicitly publish validated measurements.
import { buildReport, ensureReport, refreshArchive, output } from './build.mjs';
import { base, git, root, revision, releases } from './snapshot.mjs';
import { uploadReport } from './upload.mjs';

const [command, ...args] = process.argv.slice(2);
if (command === 'build' && args.length <= 1) await buildReport(args[0]);
else if (command === 'history' && args.every((a) => a === '--all-commits')) {
  const head = revision('HEAD');
  const ids = args.includes('--all-commits')
    ? [
        revision(base),
        ...git(root, 'rev-list', '--reverse', '--ancestry-path', base + '..' + head)
          .split('\n')
          .filter(Boolean),
      ]
    : [...releases(head).map((r) => r.hash), head];
  for (const id of new Set(ids)) await ensureReport(id);
  await refreshArchive(output);
} else if (
  command === 'upload' &&
  args.every((a) => a === '--dry-run' || a === '--history' || a.startsWith('--commit='))
) {
  const id = args.find((a) => a.startsWith('--commit='))?.slice(9) ?? 'HEAD';
  if (args.includes('--history') && args.some((a) => a.startsWith('--commit=')))
    throw Error('Choose --commit or --history.');
  const head = revision(id);
  const ids = args.includes('--history') ? [...releases(head).map((r) => r.hash), head] : [head];
  for (const commit of new Set(ids))
    await uploadReport({ directory: output, commit, dryRun: args.includes('--dry-run') });
} else throw Error('Use report [-- <ref>], report:history, or report:upload [-- --dry-run --commit=<ref>].');
