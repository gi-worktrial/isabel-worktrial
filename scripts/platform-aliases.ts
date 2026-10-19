// platform's web files import each other through #/ and the SDK by its package name, as in platform; our code keeps
// #src/. Vite's config and the component test server both resolve them
const SRC = new URL("../src", import.meta.url).pathname;

export const PLATFORM_ALIASES = [
  { find: /^#\/(.*)$/u, replacement: `${SRC}/platform/$1` },
  { find: /^@grounded-intelligence\/grounded-sdk$/u, replacement: `${SRC}/sdk/index.ts` },
];

/** The `#src` alias for the test runner, which resolves package imports without their conditions. */
export const SRC_ALIAS = { find: "#src", replacement: SRC };
