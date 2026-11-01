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
  commandRunner: {
    // Toute la suite Vitest de ce projet est de la logique pure (pas de
    // jsdom, voir vitest.config.ts) : la relancer en entier par mutant
    // reste rapide, et évite de tenir à la main une liste de fichiers de
    // test synchronisée avec `mutate`.
    command: "npx vitest run",
  },
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
  reporters: ["clear-text", "progress"],
  mutate: [
    "shared/**/*.ts",
    "worker/**/*.ts",
    "src/lib/color.ts",
    "src/lib/sort.ts",
    "src/lib/importPayload.ts",
    "src/lib/compactShare.ts",
    "!**/*.test.ts",
    "!worker/test/**",
    "!worker/listRoom.ts",
    "!shared/types.ts",
  ],
  thresholds: {
    high: 90,
    low: 70,
    break: 70,
  },
};
