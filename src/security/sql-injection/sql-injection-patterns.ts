import { SqlInjectionPattern } from './sql-injection.types';

export const SQL_INJECTION_PATTERNS: readonly SqlInjectionPattern[] = [
  {
    category: 'SQL_UNION_ATTACK',
    severity: 'HIGH',
    expression: /\bunion\s+(?:all\s+)?select\b/i,
  },
  {
    category: 'SQL_BOOLEAN_TAUTOLOGY',
    severity: 'HIGH',
    expression:
      /(?:^|[\s'"])(?:or|and)\s+['"]?[\w.-]+['"]?\s*=\s*['"]?[\w.-]+['"]?/i,
  },
  {
    category: 'SQL_TIME_BASED',
    severity: 'HIGH',
    expression: /\b(?:pg_sleep|sleep|benchmark)\s*\(/i,
  },
  {
    category: 'SQL_STACKED_QUERY',
    severity: 'HIGH',
    expression:
      /;\s*(?:drop|alter|create|truncate|insert|update|delete|select|grant|revoke|commit|rollback|savepoint|copy|set\s+search_path)\b/i,
  },
  {
    category: 'SQL_COMMENT',
    severity: 'HIGH',
    expression:
      /(?:--|#|\/\*|\*\/)\s*(?:$|(?:drop|alter|select|union|insert|update|delete|grant|revoke|truncate)\b)/i,
  },
  {
    category: 'SQL_DDL',
    severity: 'HIGH',
    expression:
      /\b(?:drop|alter|create|truncate)\s+(?:table|database|schema|index|view|function|extension)\b/i,
  },
  {
    category: 'SQL_DML',
    severity: 'HIGH',
    expression: /\b(?:insert\s+into|update\s+[\w".]+\s+set|delete\s+from)\b/i,
  },
  {
    category: 'SQL_DML',
    severity: 'HIGH',
    expression: /\bselect\b[\s\S]{0,160}\bfrom\b/i,
  },
  {
    category: 'SQL_DCL',
    severity: 'HIGH',
    expression: /\b(?:grant|revoke)\s+\w+/i,
  },
  {
    category: 'SQL_TCL',
    severity: 'MEDIUM',
    expression: /\b(?:commit|rollback|savepoint)\b/i,
    technicalOnly: true,
  },
  {
    category: 'SQL_SYSTEM_CATALOG',
    severity: 'HIGH',
    expression: /\b(?:information_schema|pg_catalog|pg_tables|pg_user)\b/i,
  },
  {
    category: 'SQL_FUNCTION_ABUSE',
    severity: 'HIGH',
    expression: /\b(?:current_database|current_user|version)\s*\(/i,
  },
  {
    category: 'SQL_RAW_RISK',
    severity: 'HIGH',
    expression: /\bcopy\s+[\w".]+\s+(?:from|to)\b/i,
  },
  {
    category: 'SQL_RAW_RISK',
    severity: 'HIGH',
    expression: /\bset\s+search_path\b/i,
  },
];

export const SQL_INJECTION_TECHNICAL_FIELDS = [
  'login',
  'email',
  'search',
  'busca',
  'query',
  'orderby',
  'order_by',
  'sort',
  'direction',
  'direcao',
  'filtro',
  'filters',
  'params',
  'ids',
  'id',
  'where',
] as const;
