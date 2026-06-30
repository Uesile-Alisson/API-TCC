import { Injectable } from '@nestjs/common';
import {
  SQL_INJECTION_PATTERNS,
  SQL_INJECTION_TECHNICAL_FIELDS,
} from './sql-injection-patterns';
import {
  SqlInjectionDetectionMatch,
  SqlInjectionDetectionResult,
  SqlInjectionPattern,
  SqlInjectionSeverity,
} from './sql-injection.types';

@Injectable()
export class SqlInjectionDetectorService {
  detect(value: unknown): SqlInjectionDetectionResult {
    const matches: SqlInjectionDetectionMatch[] = [];
    this.inspectValue(value, '$', matches);

    return {
      safe: matches.length === 0,
      highestSeverity: this.resolveHighestSeverity(matches),
      matches,
    };
  }

  private inspectValue(
    value: unknown,
    path: string,
    matches: SqlInjectionDetectionMatch[],
  ): void {
    if (this.shouldIgnoreValue(value)) {
      return;
    }

    if (typeof value === 'string') {
      this.inspectString(value, path, matches);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        this.inspectValue(item, `${path}[${index}]`, matches),
      );
      return;
    }

    if (this.isPlainObject(value)) {
      Object.entries(value).forEach(([key, item]) =>
        this.inspectValue(item, `${path}.${key}`, matches),
      );
    }
  }

  private inspectString(
    value: string,
    path: string,
    matches: SqlInjectionDetectionMatch[],
  ): void {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }

    const technicalField = this.isTechnicalField(path);
    SQL_INJECTION_PATTERNS.forEach((pattern) => {
      if (pattern.technicalOnly && !technicalField) {
        return;
      }

      if (!this.matchesPattern(trimmed, pattern)) {
        return;
      }

      matches.push({
        path,
        category: pattern.category,
        severity: pattern.severity,
        excerpt: this.maskExcerpt(trimmed),
      });
    });
  }

  private matchesPattern(value: string, pattern: SqlInjectionPattern): boolean {
    pattern.expression.lastIndex = 0;
    return pattern.expression.test(value);
  }

  private shouldIgnoreValue(value: unknown): boolean {
    return (
      value === null ||
      value === undefined ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value instanceof Date
    );
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || value instanceof Date) {
      return false;
    }

    return Object.getPrototypeOf(value) === Object.prototype;
  }

  private isTechnicalField(path: string): boolean {
    const normalizedPath = path.toLowerCase();

    return SQL_INJECTION_TECHNICAL_FIELDS.some((field) =>
      normalizedPath.includes(`.${field}`),
    );
  }

  private maskExcerpt(value: string): string {
    const compact = value.replace(/\s+/g, ' ').slice(0, 24);
    return compact.length < value.length ? `${compact}...` : compact;
  }

  private resolveHighestSeverity(
    matches: SqlInjectionDetectionMatch[],
  ): SqlInjectionSeverity | null {
    if (matches.some((match) => match.severity === 'HIGH')) {
      return 'HIGH';
    }

    if (matches.some((match) => match.severity === 'MEDIUM')) {
      return 'MEDIUM';
    }

    if (matches.some((match) => match.severity === 'LOW')) {
      return 'LOW';
    }

    return null;
  }
}
