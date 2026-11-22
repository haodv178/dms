import fs from 'fs';
import path from 'path';

interface CommandMeta {
  description: string;
  usage?: string;
}

const ROOT_SCRIPT_META: Record<string, CommandMeta> = {
  'start.sh': {
    description: 'Start the full local Docker Compose stack (frontend, backend, solver, Postgres)',
    usage: './start.sh',
  },
  'stop.sh': {
    description: 'Stop all local Docker Compose services',
    usage: './stop.sh',
  },
  'commands.sh': {
    description: 'List all available project commands',
    usage: './commands.sh',
  },
};

const BACKEND_SCRIPT_META: Record<string, CommandMeta> = {
  dev: {
    description: 'Start backend API in watch mode (nodemon + ts-node)',
  },
  build: {
    description: 'Compile backend TypeScript to dist/',
  },
  start: {
    description: 'Run compiled backend server from dist/index.js',
  },
  'db:push': {
    description: 'Push Prisma schema changes directly to PostgreSQL',
  },
  seed: {
    description: 'Seed default depot, demo users, sample products, drivers, and 10 orders',
  },
  'seed:drivers': {
    description: 'Seed additional drivers for each active depot',
  },
  'seed:orders': {
    description: 'Seed random sample orders across active depots',
    usage: 'npm run seed:orders -- [count]  (or --count <n>, --help)',
  },
  'delete:orders': {
    description: 'Delete orders by filter (--all, --status, --store, --depot, --code, --id)',
    usage: 'npm run delete:orders -- --all|--status=NEW [--dry-run] [--help]',
  },
  'seed:products1000': {
    description: 'Seed 1,000 generated supermarket products and depot stock',
  },
  commands: {
    description: 'List all available project commands',
  },
};

const FRONTEND_SCRIPT_META: Record<string, CommandMeta> = {
  dev: {
    description: 'Start Vite dev server on http://localhost:5173',
  },
  build: {
    description: 'Type-check and build production bundle to frontend/dist/',
  },
  preview: {
    description: 'Preview built production bundle locally',
  },
  astryx: {
    description: 'Run Astryx Design System CLI',
  },
};

interface CommandEntry {
  name: string;
  run: string;
  rawCommand: string;
  description: string;
  usage?: string;
}

function readPackageScripts(pkgPath: string): Record<string, string> {
  if (!fs.existsSync(pkgPath)) {
    return {};
  }
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
  return parsed.scripts ?? {};
}

function collectRootScripts(repoRoot: string): CommandEntry[] {
  if (!fs.existsSync(repoRoot)) {
    return [];
  }
  const files = fs
    .readdirSync(repoRoot)
    .filter((file) => file.endsWith('.sh'))
    .sort();

  return files.map((file) => {
    const meta = ROOT_SCRIPT_META[file];
    return {
      name: file,
      run: `./${file}`,
      rawCommand: `./${file}`,
      description: meta?.description ?? `Run ${file}`,
      usage: meta?.usage,
    };
  });
}

function collectNpmScripts(
  pkgPath: string,
  prefix: string,
  metaMap: Record<string, CommandMeta>
): CommandEntry[] {
  const scripts = readPackageScripts(pkgPath);
  return Object.entries(scripts).map(([name, rawCommand]) => {
    const meta = metaMap[name];
    return {
      name,
      run: `npm --prefix ${prefix} run ${name}`,
      rawCommand,
      description: meta?.description ?? rawCommand,
      usage: meta?.usage,
    };
  });
}

function printSection(title: string, entries: CommandEntry[]) {
  if (entries.length === 0) {
    return;
  }
  console.log(`\n${title}`);
  console.log('─'.repeat(title.length));

  const maxRunLen = Math.max(...entries.map((entry) => entry.run.length), 24);
  for (const entry of entries) {
    const paddedRun = entry.run.padEnd(maxRunLen + 2);
    console.log(`  ${paddedRun}${entry.description}`);
    if (entry.usage && entry.usage !== entry.run) {
      console.log(`  ${''.padEnd(maxRunLen + 2)}Usage: ${entry.usage}`);
    }
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../..');

  const rootCommands = collectRootScripts(repoRoot);
  const backendCommands = collectNpmScripts(
    path.join(repoRoot, 'backend/package.json'),
    'backend',
    BACKEND_SCRIPT_META
  );
  const frontendCommands = collectNpmScripts(
    path.join(repoRoot, 'frontend/package.json'),
    'frontend',
    FRONTEND_SCRIPT_META
  );

  if (args.has('--json')) {
    console.log(
      JSON.stringify(
        {
          root: rootCommands,
          backend: backendCommands,
          frontend: frontendCommands,
        },
        null,
        2
      )
    );
    return;
  }

  const showAll = !args.has('--root') && !args.has('--backend') && !args.has('--frontend');

  console.log('DMS Project Commands');
  if (showAll || args.has('--root')) {
    printSection('Root / Stack Scripts (run from repo root)', rootCommands);
  }
  if (showAll || args.has('--backend')) {
    printSection('Backend Commands (from repo root, or `npm run <name>` inside backend/)', backendCommands);
  }
  if (showAll || args.has('--frontend')) {
    printSection('Frontend Commands (from repo root, or `npm run <name>` inside frontend/)', frontendCommands);
  }
  console.log('');
}

main();
