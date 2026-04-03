import { defineConfig } from 'vite-plus'

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {
    trailingComma: 'es5',
    tabWidth: 2,
    semi: false,
    singleQuote: true,
    sortTailwindcss: {},
    printWidth: 80,
    sortPackageJson: true,
    ignorePatterns: [],
  },
})
