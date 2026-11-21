import { variantIds, type VariantId, type Mood } from '../src/domain.js';
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function allocate(mood: Mood, seed: number, prior: { mood: Mood; variants: VariantId[] }[]) {
  const rng = seeded(seed);
  const counts = Object.fromEntries(
    variantIds.map((id) => [
      id,
      prior.filter((a) => a.mood === mood && a.variants.includes(id)).length,
    ]),
  );
  const variants = variantIds
    .map((id) => ({ id, count: counts[id], tie: rng() }))
    .sort((a, b) => a.count - b.count || a.tie - b.tie)
    .slice(0, 4)
    .map((v) => v.id);
  const order = [...variants].sort(() => 0);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const examples = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [examples[i], examples[j]] = [examples[j], examples[i]];
  }
  const dates = ['D0', 'D5', 'D10', 'D15'],
    actions = ['A1', 'A6', 'A11', 'A16'];
  return {
    variants: order,
    counts_before: counts,
    trials: order.flatMap((variant, i) =>
      (i % 2
        ? [actions[examples[i]], dates[examples[i]]]
        : [dates[examples[i]], actions[examples[i]]]
      ).map((task_id) => ({ variant, task_id })),
    ),
  };
}
