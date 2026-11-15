// Chaque module est associé aux seuls fichiers de test capables de tuer ses
// mutants : la CI lance un job par module (variable MUTATE, voir
// .github/scripts/mutation-matrix.mjs) et le runner « command » ne relance que
// ces tests-là pour chaque mutant, au lieu de toute la suite. Un fichier trop
// long (src/views/list.ts) est découpé en plages de lignes (`fichier:début-fin`),
// un job chacune.
//
// Exclus, comme de la couverture (vitest.config.ts) : shared/types.ts (types
// seuls) et worker/listRoom.ts (couche Durable Object, couverte par les tests
// e2e).
export const targets = {
  'worker/index.ts': ['worker/index.test.ts'],
  'worker/crypto.ts': ['worker/crypto.test.ts'],
  'worker/reducer.ts': ['worker/reducer.test.ts'],
  'src/lib/accessibilityPreference.ts': ['src/lib/accessibilityPreference.test.ts'],
  'src/lib/basePath.ts': ['src/lib/basePath.test.ts'],
  'src/lib/color.ts': ['src/lib/color.test.ts'],
  'src/lib/compactShare.ts': ['src/lib/compactShare.test.ts'],
  'src/lib/confirmClick.ts': ['src/lib/confirmClick.test.ts'],
  'src/lib/dnd.ts': ['src/lib/dnd.test.ts'],
  'src/lib/dom.ts': ['src/lib/dom.test.ts'],
  'src/lib/editable.ts': ['src/lib/editable.test.ts'],
  'src/lib/focusTrap.ts': ['src/lib/focusTrap.test.ts'],
  'src/lib/hiddenRecipientsPreference.ts': ['src/lib/hiddenRecipientsPreference.test.ts'],
  'src/lib/hideCheckedPreference.ts': ['src/lib/hideCheckedPreference.test.ts'],
  'src/lib/http.ts': ['src/lib/http.test.ts'],
  'src/lib/icons.ts': ['src/lib/icons.test.ts'],
  'src/lib/id.ts': ['src/lib/id.test.ts'],
  'src/lib/importExport.ts': ['src/lib/importExport.test.ts'],
  'src/lib/importPayload.ts': ['src/lib/importPayload.test.ts'],
  'src/lib/itemSortPreference.ts': ['src/lib/itemSortPreference.test.ts'],
  'src/lib/pendingImport.ts': ['src/lib/pendingImport.test.ts'],
  'src/lib/privacyHint.ts': ['src/lib/privacyHint.test.ts'],
  'src/lib/sort.ts': ['src/lib/sort.test.ts'],
  'src/lib/storage.ts': ['src/lib/storage.test.ts'],
  'src/lib/swipe.ts': ['src/lib/swipe.test.ts'],
  'src/lib/syncWorker.ts': ['src/lib/syncWorker.test.ts'],
  'src/lib/theme.ts': ['src/lib/theme.test.ts'],
  'src/lib/ws.ts': ['src/lib/ws.test.ts'],
  'src/components/accessibilityModal.ts': ['src/components/accessibilityModal.test.ts'],
  'src/components/compactShareModal.ts': ['src/components/compactShareModal.test.ts'],
  'src/components/qr.ts': ['src/components/qr.test.ts'],
  'src/components/shareModal.ts': ['src/components/shareModal.test.ts'],
  'src/main.ts': ['src/main.test.ts'],
  'src/views/home.ts': ['src/views/home.test.ts'],
  'src/views/list.ts:1-170': ['src/views/list.test.ts'],
  'src/views/list.ts:171-340': ['src/views/list.test.ts'],
  'src/views/list.ts:341-510': ['src/views/list.test.ts'],
  'src/views/list.ts:511-680': ['src/views/list.test.ts'],
  'src/views/list.ts:681-850': ['src/views/list.test.ts'],
  'src/views/list.ts:851-1020': ['src/views/list.test.ts'],
  'src/views/list.ts:1021-1190': ['src/views/list.test.ts'],
  'src/views/list.ts:1191-1348': ['src/views/list.test.ts'],
};

const selected = process.env.MUTATE ? process.env.MUTATE.split(',') : Object.keys(targets);
for (const file of selected) {
  if (!targets[file]) throw new Error(`MUTATE : module inconnu ${file}`);
}
const tests = [...new Set(selected.flatMap((file) => targets[file]))];

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  // Le testRunner "vitest" officiel (@stryker-mutator/vitest-runner) ne
  // rattache plus les tests exécutés à chaque mutant sous Vitest 5
  // (testsCompleted: 0 pour tout mutant non statique) : chaque mutant
  // survit faute de test réellement lancé contre lui, et le score
  // s'effondre sans qu'aucune autre vérification ne le signale. Le
  // testRunner "command" relance simplement `vitest run` en sous-processus
  // par mutant, sans passer par l'API interne de Vitest — même choix que
  // dans Quine, PlusUn, KoiKiManke, OnMangeQuoi et MineCarte.
  testRunner: "command",
  commandRunner: { command: `npx vitest run ${tests.join(' ')}` },
  // Le runner "command" ne fait qu'exécuter une commande et lire son code
  // de sortie : aucune analyse de couverture par test possible.
  coverageAnalysis: "off",
  // Stryker réécrit par défaut tsconfig.json (extends/references) via
  // `ts.parseConfigFileTextToJson`, retirée de TypeScript 7 : pointer vers
  // un fichier volontairement inexistant fait sauter cette réécriture,
  // inutile ici (le runner "command" ne dépend d'aucune vérification de
  // type par Stryker).
  tsconfigFile: "tsconfig.stryker-unused.json",
  inPlace: true,
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "mutation-report/index.html" },
  mutate: selected,
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
};
