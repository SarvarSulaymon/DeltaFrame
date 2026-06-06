export function parseArgs(argv) {
  const args = [...argv];
  const result = {
    command: undefined,
    flags: {},
    positionals: []
  };

  while (args.length > 0) {
    const current = args.shift();

    if (!result.command && !current.startsWith("-")) {
      result.command = current;
      continue;
    }

    if (current === "--") {
      result.positionals.push(...args);
      break;
    }

    if (current.startsWith("--")) {
      const raw = current.slice(2);
      const equalsAt = raw.indexOf("=");
      if (equalsAt !== -1) {
        result.flags[raw.slice(0, equalsAt)] = raw.slice(equalsAt + 1);
      } else {
        const next = args[0];
        result.flags[raw] = next && !next.startsWith("-") ? args.shift() : true;
      }
      continue;
    }

    if (current.startsWith("-") && current.length > 1) {
      for (const key of current.slice(1)) {
        result.flags[key] = true;
      }
      continue;
    }

    result.positionals.push(current);
  }

  return result;
}
