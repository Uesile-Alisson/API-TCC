export type SqlInjectionSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type SqlInjectionPatternCategory =
  | 'SQL_DDL'
  | 'SQL_DML'
  | 'SQL_DCL'
  | 'SQL_TCL'
  | 'SQL_COMMENT'
  | 'SQL_BOOLEAN_TAUTOLOGY'
  | 'SQL_UNION_ATTACK'
  | 'SQL_TIME_BASED'
  | 'SQL_STACKED_QUERY'
  | 'SQL_SYSTEM_CATALOG'
  | 'SQL_FUNCTION_ABUSE'
  | 'SQL_RAW_RISK';

export interface SqlInjectionPattern {
  category: SqlInjectionPatternCategory;
  severity: SqlInjectionSeverity;
  expression: RegExp;
  technicalOnly?: boolean;
}

export interface SqlInjectionDetectionMatch {
  path: string;
  category: SqlInjectionPatternCategory;
  severity: SqlInjectionSeverity;
  excerpt: string;
}

export interface SqlInjectionDetectionResult {
  safe: boolean;
  highestSeverity: SqlInjectionSeverity | null;
  matches: SqlInjectionDetectionMatch[];
}
