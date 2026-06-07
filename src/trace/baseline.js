export function evaluateTraceComparison(comparison, budgets = {}) {
  const checks = [
    ["changedStates", "changed states"],
    ["addedStates", "added states"],
    ["removedStates", "removed states"],
    ["annotationChanges", "annotation changes"]
  ];
  const failures = [];

  for (const [field, label] of checks) {
    const max = normalizeBudget(budgets[field]);
    if (max === undefined) continue;
    const actual = comparison.counts?.[field] || 0;
    if (actual > max) {
      failures.push({
        field,
        label,
        actual,
        max,
        message: `${label}: ${actual} exceeds max ${max}`
      });
    }
  }

  return {
    ok: failures.length === 0,
    failures
  };
}

function normalizeBudget(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Baseline budget must be a non-negative integer, got ${value}`);
  }
  return parsed;
}
