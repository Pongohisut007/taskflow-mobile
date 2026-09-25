import pluginSecurity from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'reports/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'module',
    },
  },
  pluginSecurity.configs.recommended,
];