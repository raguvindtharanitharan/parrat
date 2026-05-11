import { describe, expect, it } from 'vitest';
import { McpToolDeniedError } from '../../src/core/errors.js';
import {
  aggregateAllowlists,
  assertToolAllowed,
  resolveAllowlist,
} from '../../src/core/mcp/filter.js';

describe('core/mcp/filter', () => {
  describe('resolveAllowlist', () => {
    it('builds fully-qualified mcp__server__tool names', () => {
      const result = resolveAllowlist('dbt', ['list', 'get_node_details_dev']);
      expect(result.fullyQualified).toEqual(['mcp__dbt__list', 'mcp__dbt__get_node_details_dev']);
      expect(result.serverName).toBe('dbt');
    });

    it('preserves an empty tool list', () => {
      const result = resolveAllowlist('dbt', []);
      expect(result.fullyQualified).toEqual([]);
    });

    it('preserves order of supplied tool names', () => {
      const result = resolveAllowlist('snowflake', ['z', 'a', 'm']);
      expect(result.fullyQualified).toEqual([
        'mcp__snowflake__z',
        'mcp__snowflake__a',
        'mcp__snowflake__m',
      ]);
    });
  });

  describe('aggregateAllowlists', () => {
    it('combines multiple allowlists into a flat array', () => {
      const a = resolveAllowlist('dbt', ['list']);
      const b = resolveAllowlist('snowflake', ['query']);
      const combined = aggregateAllowlists([a, b]);
      expect(combined).toEqual(['mcp__dbt__list', 'mcp__snowflake__query']);
    });

    it('deduplicates fully-qualified names', () => {
      const a = resolveAllowlist('dbt', ['list']);
      const b = resolveAllowlist('dbt', ['list', 'compile']);
      const combined = aggregateAllowlists([a, b]);
      expect(combined.length).toBe(2);
      expect(combined).toContain('mcp__dbt__list');
      expect(combined).toContain('mcp__dbt__compile');
    });
  });

  describe('assertToolAllowed', () => {
    it('passes when tool is in allowlist', () => {
      expect(() => assertToolAllowed('mcp__dbt__list', ['mcp__dbt__list'])).not.toThrow();
    });

    it('throws McpToolDeniedError when tool is not in allowlist', () => {
      expect(() => assertToolAllowed('mcp__dbt__run', ['mcp__dbt__list'])).toThrow(
        McpToolDeniedError,
      );
    });
  });
});
