import { FlatCompat } from '@eslint/eslintrc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'public/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@next/next/no-assign-module-variable': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/triple-slash-reference': 'off',
      'prefer-const': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
  {
    files: [
      'components/players/EpicProfile.tsx',
      'components/profile/ProfileLinkPlayerForm.tsx',
      'app/rankings/RankingsClient.tsx',
    ],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
];

export default config;
