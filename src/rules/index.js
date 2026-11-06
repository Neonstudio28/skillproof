import { metadataRules } from './metadata.js';
import { contentRules } from './content.js';
import { referenceRules } from './references.js';
import { securityRules } from './security.js';

/** @type {import('../types.js').Rule[]} */
export const rules = [
  ...metadataRules,
  ...contentRules,
  ...referenceRules,
  ...securityRules,
];

export const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
